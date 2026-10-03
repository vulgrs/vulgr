import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Send,
  Sparkles,
  Shield,
  Bot,
  CheckCircle2,
  GitBranch,
  CornerDownLeft,
  Copy,
  Check,
  Play,
  ArrowRight,
  X,
  Loader2,
  Plus,
  ChevronDown,
  Folder,
  RotateCcw,
} from 'lucide-react';
import { formatCwdLabel } from './XtermPane.js';
import type { TerminalSession, CommandSuggestion, AutoSuggestItem } from '../types/warp.js';

interface BottomCommandDockProps {
  activeSession: TerminalSession | null;
  onSendInput: (text: string) => void;
  primaryModel?: string;
  onSelectModel?: (model: string) => void;
  gitBranch?: string | null;
  cwd?: string;
  onContinueWorking?: () => void;
  onCommitAndPush?: () => void;
  onExplainActive?: () => void;
  onFixActive?: () => void;
  onAttachContext?: (type: 'diff' | 'error' | 'skill') => void;
  onOpenHud?: () => void;
  tokenSavingsText?: string;
  onAskClaude?: (prompt: string) => void;
}

export const BottomCommandDock: React.FC<BottomCommandDockProps> = ({
  activeSession,
  onSendInput,
  primaryModel = 'claude',
  onSelectModel,
  gitBranch,
  cwd,
  onContinueWorking,
  onCommitAndPush,
  onExplainActive,
  onFixActive,
  onAttachContext,
  onOpenHud,
  tokenSavingsText,
  onAskClaude,
}) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'shell' | 'claude'>('shell');
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [ghostSuggestion, setGhostSuggestion] = useState<AutoSuggestItem | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAiMode = mode === 'shell' && input.startsWith('#');


  // Query AI command generator when query starts with '#'
  useEffect(() => {
    if (!isAiMode) {
      setSuggestion(null);
      setLoadingAi(false);
      return;
    }

    const query = input.slice(1).trim();
    if (!query) {
      setSuggestion(null);
      setLoadingAi(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!window.warpApi?.generateCommand) return;
      setLoadingAi(true);
      try {
        const res = await window.warpApi.generateCommand(query);
        setSuggestion(res);
      } catch {
        setSuggestion(null);
      } finally {
        setLoadingAi(false);
      }
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, isAiMode]);

  // Query Smart Ghost Text auto-suggest when typing regular commands
  useEffect(() => {
    if (isAiMode || !input || input.trim().length === 0) {
      setGhostSuggestion(null);
      return;
    }

    // Ignore answers that arrive after the input changed (e.g. was cleared on submit).
    let stale = false;
    if (window.warpApi?.getAutoSuggestion) {
      window.warpApi.getAutoSuggestion(input).then((res: AutoSuggestItem | null) => {
        if (stale) return;
        if (res && res.suffix) {
          setGhostSuggestion(res);
        } else {
          setGhostSuggestion(null);
        }
      }).catch(() => {
        if (!stale) setGhostSuggestion(null);
      });
    }
    return () => {
      stale = true;
    };
  }, [input, isAiMode]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSession) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    // Claude Mode or ? question prefix: route to Claude Code
    if (mode === 'claude' || trimmed.startsWith('?')) {
      const prompt = mode === 'claude' ? trimmed : trimmed.slice(1).trim();
      if (prompt && onAskClaude) {
        onAskClaude(prompt);
      }
      setInput('');
      setSuggestion(null);
      setGhostSuggestion(null);
      return;
    }

    // AI Command Translation
    if (isAiMode && suggestion) {
      onSendInput(suggestion.command + '\r');
      setInput('');
      setSuggestion(null);
      setGhostSuggestion(null);
      return;
    }

    onSendInput(input + '\r');

    // Also record in persistent MemoryStore
    if (window.warpApi?.recordMemoryCommand) {
      window.warpApi.recordMemoryCommand({ command: trimmed, exitCode: 0 });
    }

    setInput('');
    setGhostSuggestion(null);
  };


  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isAiMode && ghostSuggestion) {
      const isAtEnd = e.currentTarget.selectionStart === input.length;
      if (e.key === 'Tab' || (e.key === 'ArrowRight' && isAtEnd)) {
        e.preventDefault();
        setInput(ghostSuggestion.completion);
        setGhostSuggestion(null);
        return;
      }
    }

    if (isAiMode && e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setInput(suggestion.command);
      setSuggestion(null);
      return;
    }

    if (e.key === 'Escape') {
      setInput('');
      setSuggestion(null);
      setGhostSuggestion(null);
    }
  };

  const handleCopySuggestion = () => {
    if (!suggestion) return;
    navigator.clipboard.writeText(suggestion.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shortCwd = formatCwdLabel(cwd || '');

  return (
    <div className="relative bg-base-app border-t border-zinc-900/70 select-none z-20 flex-shrink-0 font-mono">
      {/* Floating AI Command Generator Card */}
      {isAiMode && (
        <div className="absolute bottom-full mb-3 left-4 right-4 max-w-xl mx-auto bg-base-elevated rounded-xl p-4 shadow-2xl border border-zinc-800 animate-slide-in-up z-30 select-none">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <div className="flex items-center space-x-2">
              <div className="p-1 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800">
                <Sparkles size={13} />
              </div>
              <span className="font-semibold text-xs text-zinc-100 font-sans tracking-wide">
                Vulgaris AI Command Search
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400">
                Natural Language ➔ Shell
              </span>
            </div>

            <button
              onClick={() => {
                setInput('');
                setSuggestion(null);
              }}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          <div className="pt-3 space-y-2.5">
            {loadingAi && !suggestion ? (
              <div className="flex items-center space-x-2 py-3 text-xs text-zinc-400 font-mono">
                <Loader2 size={14} className="animate-spin text-zinc-300" />
                <span>Translating query into shell command...</span>
              </div>
            ) : suggestion ? (
              <>
                <div className="p-2.5 rounded-lg bg-black border border-zinc-800 font-mono text-xs text-zinc-100 flex items-center justify-between shadow-inner">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-zinc-500 font-bold select-none">$</span>
                    <span className="truncate font-semibold select-text">{suggestion.command}</span>
                  </div>

                  <div className="flex items-center space-x-1 flex-shrink-0 pl-2">
                    <button
                      onClick={handleCopySuggestion}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
                      title="Copy command"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                  {suggestion.explanation}
                </p>

                <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80 text-[10px] font-mono text-zinc-400">
                  <div className="flex items-center space-x-2">
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">↵ Enter</kbd> Run</span>
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">Tab</kbd> Insert</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => {
                        onSendInput(suggestion.command + '\r');
                        setInput('');
                        setSuggestion(null);
                      }}
                      className="flex items-center space-x-1 btn-accent px-3 py-1 text-[10px] font-sans font-semibold transition-all"
                    >
                      <Play size={10} className="fill-current" />
                      <span>Run Now</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-2 text-xs text-zinc-400 font-sans">
                Type what you want to do in plain English or Turkish (e.g. <span className="font-mono text-zinc-200"># port 3000 kapat</span>)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input block: cwd chip & mode toggle on top, then the input with a send button. */}
      <form onSubmit={handleSubmit} className="relative px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 text-[11px]"
            title={cwd || shortCwd}
          >
            <Folder size={11} />
            <span className="max-w-[280px] truncate">{shortCwd}</span>
          </div>

          {/* Mode Switcher: Terminal Shell vs Claude Code */}
          <div className="inline-flex items-center p-0.5 rounded-md bg-zinc-900/70 border border-zinc-800 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setMode('shell')}
              className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                mode === 'shell'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Terminal Shell mode — runs commands directly in PTY (prefix # for AI translation, ? for Claude)"
            >
              <Terminal size={10} />
              <span>Shell</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('claude')}
              className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                mode === 'claude'
                  ? 'bg-violet-950/80 text-violet-200 border border-violet-700/60 font-semibold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Claude Code mode — asks questions or sends coding tasks directly to Claude Code"
            >
              <Sparkles size={10} className={mode === 'claude' ? 'text-violet-300' : 'text-zinc-500'} />
              <span>Claude Code</span>
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative flex-1 flex items-center min-w-0">
            {/* Mode prefix icon */}
            <span className="mr-2 text-xs select-none">
              {mode === 'claude' ? (
                <Sparkles size={13} className="text-violet-400" />
              ) : (
                <span className="text-zinc-500 font-bold">$</span>
              )}
            </span>

            {/* Ghost Text Overlay */}
            {ghostSuggestion && !isAiMode && mode === 'shell' && (
              <div className="absolute inset-0 pl-5 px-0.5 flex items-center pointer-events-none font-mono text-[13px] overflow-hidden select-none whitespace-pre">
                <span className="opacity-0">{input}</span>
                <span className="text-zinc-600 italic">{ghostSuggestion.suffix}</span>
              </div>
            )}

            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!activeSession}
              placeholder={
                !activeSession
                  ? 'Önce bir terminal seçin'
                  : mode === 'claude'
                  ? "Claude Code'a sor veya görev ver (örn. Testleri çalıştır, hataları düzelt)..."
                  : "Komut girin (örn. npm test, git status) · Claude için ? veya # ile başlayın..."
              }
              className="w-full bg-transparent text-zinc-100 text-[13px] font-mono placeholder:text-zinc-600 focus:outline-none outline-none relative z-10"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || !activeSession}
            className={`flex-shrink-0 flex items-center px-2 py-1 rounded border text-xs font-mono transition-colors disabled:cursor-not-allowed ${
              mode === 'claude'
                ? 'border-violet-800 text-violet-300 enabled:hover:bg-violet-950/60 disabled:border-zinc-800 disabled:text-zinc-600'
                : 'border-zinc-800 text-zinc-600 enabled:text-zinc-200 enabled:hover:bg-zinc-900'
            }`}
            title={mode === 'claude' ? 'Send to Claude Code' : 'Run in Shell'}
          >
            {mode === 'claude' ? <Sparkles size={12} className="mr-1 text-violet-400" /> : <ArrowRight size={12} />}
            <span>{mode === 'claude' ? 'Ask' : 'Run'}</span>
          </button>
        </div>
      </form>


      {/* Hint Row — matches reference: shortcut hint left, status right */}
      <div className="flex items-center justify-between px-4 pb-2 text-[10px] font-mono text-zinc-600">
        <span>ctrl-shift-⏎ yeni /agent konuşması</span>
        <div className="flex items-center space-x-3">
          {gitBranch && (
            <span className="flex items-center space-x-1">
              <GitBranch size={10} />
              <span>{gitBranch}</span>
            </span>
          )}
          {onOpenHud && (
            <button
              type="button"
              onClick={onOpenHud}
              className="flex items-center space-x-1 hover:text-zinc-300 transition-colors"
              title="Open Token & Context Optimizer HUD"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>{tokenSavingsText || '68% saved'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
