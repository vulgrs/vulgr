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
} from 'lucide-react';
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
}) => {
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [ghostSuggestion, setGhostSuggestion] = useState<AutoSuggestItem | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const debounceRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAiMode = input.startsWith('#');

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

    if (window.warpApi?.getAutoSuggestion) {
      window.warpApi.getAutoSuggestion(input).then((res: AutoSuggestItem | null) => {
        if (res && res.suffix) {
          setGhostSuggestion(res);
        } else {
          setGhostSuggestion(null);
        }
      }).catch(() => {
        setGhostSuggestion(null);
      });
    }
  }, [input, isAiMode]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSession) return;

    if (isAiMode && suggestion) {
      onSendInput(suggestion.command + '\r');
      setInput('');
      setSuggestion(null);
      setGhostSuggestion(null);
      return;
    }

    if (!input.trim()) return;
    onSendInput(input + '\r');

    // Also record in persistent MemoryStore
    if (window.warpApi?.recordMemoryCommand) {
      window.warpApi.recordMemoryCommand({ command: input.trim(), exitCode: 0 });
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
      setShowAttachMenu(false);
      setShowModelPicker(false);
    }
  };

  const handleCopySuggestion = () => {
    if (!suggestion) return;
    navigator.clipboard.writeText(suggestion.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const getModelLabel = () => {
    switch (primaryModel) {
      case 'claude':
        return 'High Fast (Claude 3.7)';
      case 'agy':
        return 'AGY Engine 2.0';
      case 'codex':
        return 'Codex CLI';
      case 'shell':
        return 'PTY Shell';
      default:
        return 'High Fast';
    }
  };

  const shortCwd = cwd ? cwd.split(/[\\/]/).pop() || 'This PC' : 'This PC';

  return (
    <div className="relative bg-[#000000] border-t border-zinc-900/80 px-4 pt-2.5 pb-2 select-none z-20 flex-shrink-0 font-sans">
      {/* Floating AI Command Generator Card */}
      {isAiMode && (
        <div className="absolute bottom-full mb-3 left-4 right-4 max-w-xl mx-auto bg-[#09090b] rounded-xl p-4 shadow-2xl border border-zinc-800 animate-in slide-in-from-bottom-2 duration-150 z-30 select-none">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <div className="flex items-center space-x-2">
              <div className="p-1 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800">
                <Sparkles size={13} />
              </div>
              <span className="font-semibold text-xs text-zinc-100 font-sans tracking-wide">
                Dexter AI Command Search
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
                      className="flex items-center space-x-1 px-3 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-[10px] font-sans font-semibold transition-all shadow-sm"
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

      {/* Floating Action Chips Row (Matches screenshot: [Continue Working] [Commit & Push ▾]) */}
      <div className="max-w-3xl mx-auto flex items-center space-x-2 mb-2">
        <button
          onClick={() => {
            if (onContinueWorking) onContinueWorking();
            else if (activeSession) onSendInput('\r');
          }}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-300 hover:text-white text-[11px] font-medium transition-all shadow-sm"
        >
          <Play size={11} className="text-zinc-400" />
          <span>Continue Working</span>
        </button>

        {onCommitAndPush && (
          <button
            onClick={onCommitAndPush}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-300 hover:text-white text-[11px] font-medium transition-all shadow-sm"
          >
            <GitBranch size={11} className="text-zinc-400" />
            <span>Commit & Push</span>
          </button>
        )}

        {onExplainActive && (
          <button
            onClick={onExplainActive}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-md bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800/60 text-zinc-400 hover:text-zinc-200 text-[11px] transition-all"
          >
            <Sparkles size={11} className="text-purple-400" />
            <span>Explain with Claude</span>
          </button>
        )}

        {onFixActive && (
          <button
            onClick={onFixActive}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-md bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800/60 text-zinc-400 hover:text-zinc-200 text-[11px] transition-all"
          >
            <Shield size={11} className="text-zinc-400" />
            <span>Auto-Fix w/ AGY</span>
          </button>
        )}
      </div>

      {/* Main Input Capsule (Matches screenshot: [+] [Send follow-up / command] [High Fast ▾] [Mic / Enter]) */}
      <div className="max-w-3xl mx-auto">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center bg-[#09090b] border border-zinc-800 rounded-xl px-2.5 py-1.5 shadow-xl transition-all focus-within:border-zinc-600 focus-within:bg-[#0c0c0f]"
        >
          {/* Context Attachment (+) Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors mr-1.5"
              title="Attach context (Git diff, Error log, Skills)"
            >
              <Plus size={15} />
            </button>

            {/* Context attachment dropdown menu */}
            {showAttachMenu && (
              <div className="absolute bottom-full mb-2 left-0 w-44 bg-[#09090b] border border-zinc-800 rounded-lg shadow-2xl p-1 z-30 text-xs font-sans animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    if (onAttachContext) onAttachContext('diff');
                    setInput((v) => v + ' [Context: Working Tree Diff]');
                    setShowAttachMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center space-x-2"
                >
                  <GitBranch size={12} className="text-zinc-400" />
                  <span>Attach Git Diff</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onAttachContext) onAttachContext('error');
                    setInput((v) => v + ' [Context: Last Terminal Error]');
                    setShowAttachMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center space-x-2"
                >
                  <Terminal size={12} className="text-zinc-400" />
                  <span>Attach Error Logs</span>
                </button>
              </div>
            )}
          </div>

          {/* Prompt / Command Input */}
          <div className="relative flex-1 flex items-center min-w-0">
            {/* Ghost Text Overlay */}
            {ghostSuggestion && !isAiMode && (
              <div className="absolute inset-0 px-1 py-0.5 flex items-center pointer-events-none font-mono text-xs overflow-hidden select-none whitespace-pre">
                <span className="opacity-0">{input}</span>
                <span className="text-zinc-600 italic">{ghostSuggestion.suffix}</span>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!activeSession}
              placeholder={
                activeSession
                  ? "Send follow-up, run command, or '# port 3000 kapat'..."
                  : 'Select a terminal first'
              }
              className="w-full bg-transparent text-zinc-100 text-xs font-sans placeholder:text-zinc-600 focus:outline-none outline-none relative z-10"
            />
          </div>

          {/* Model Selector Dropdown (Matches Reference: "High Fast ▾") */}
          <div className="relative flex items-center space-x-1.5 flex-shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] font-sans transition-all"
            >
              <span>{getModelLabel()}</span>
              <ChevronDown size={11} className="text-zinc-500" />
            </button>

            {/* Model picker popover */}
            {showModelPicker && onSelectModel && (
              <div className="absolute bottom-full mb-2 right-0 w-48 bg-[#09090b] border border-zinc-800 rounded-lg shadow-2xl p-1 z-30 text-xs font-sans animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    onSelectModel('claude');
                    setShowModelPicker(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center space-x-2"
                >
                  <Sparkles size={12} className="text-purple-400" />
                  <div>
                    <div className="font-medium">Claude 3.7 Sonnet</div>
                    <div className="text-[10px] text-zinc-500">High Fast / Reasoning</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectModel('agy');
                    setShowModelPicker(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center space-x-2"
                >
                  <Shield size={12} className="text-zinc-300" />
                  <div>
                    <div className="font-medium">AGY Engine 2.0</div>
                    <div className="text-[10px] text-zinc-500">Antigravity CLI Agent</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectModel('codex');
                    setShowModelPicker(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center space-x-2"
                >
                  <Bot size={12} className="text-emerald-400" />
                  <div>
                    <div className="font-medium">Codex CLI</div>
                    <div className="text-[10px] text-zinc-500">Fast Scripting</div>
                  </div>
                </button>
              </div>
            )}

            {/* Submit Arrow Button */}
            <button
              type="submit"
              disabled={!input.trim() || !activeSession}
              className="p-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed transition-all shadow-sm"
              title="Send"
            >
              <CornerDownLeft size={12} />
            </button>
          </div>
        </form>

        {/* Bottom Status Row (Matches Reference: main ▾ | This PC ▾ | dot) */}
        <div className="flex items-center justify-between pt-1.5 px-1 text-[10px] font-mono text-zinc-600">
          <div className="flex items-center space-x-3">
            {gitBranch && (
              <span className="flex items-center space-x-1 hover:text-zinc-400 cursor-pointer">
                <GitBranch size={10} />
                <span>{gitBranch}</span>
                <span>▾</span>
              </span>
            )}
            <span className="flex items-center space-x-1 hover:text-zinc-400 cursor-pointer">
              <span>💻 {shortCwd}</span>
              <span>▾</span>
            </span>

            {onOpenHud && (
              <button
                type="button"
                onClick={onOpenHud}
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-emerald-900/40 text-emerald-400 hover:text-emerald-300 hover:border-emerald-800 transition-colors"
                title="Open Token & Context Optimizer HUD"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>⚡ {tokenSavingsText || '68% saved'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-1 text-zinc-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-sans">Dexter Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};
