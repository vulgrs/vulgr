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
} from 'lucide-react';
import type { TerminalSession } from '../types/warp.js';

interface BottomCommandDockProps {
  activeSession: TerminalSession | null;
  onSendInput: (text: string) => void;
}

interface CommandSuggestion {
  command: string;
  explanation: string;
  source: string;
}

interface AutoSuggestItem {
  input: string;
  completion: string;
  suffix: string;
  source: 'history' | 'skill' | 'builtin';
  description?: string;
}

export const BottomCommandDock: React.FC<BottomCommandDockProps> = ({
  activeSession,
  onSendInput,
}) => {
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [ghostSuggestion, setGhostSuggestion] = useState<AutoSuggestItem | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [copied, setCopied] = useState(false);
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

    // Also record in persistent MemoryStore for future history autocompletions
    if (window.warpApi?.recordMemoryCommand) {
      window.warpApi.recordMemoryCommand({ command: input.trim(), exitCode: 0 });
    }

    setInput('');
    setGhostSuggestion(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 1. Ghost text completion via Tab or ArrowRight at end of line
    if (!isAiMode && ghostSuggestion) {
      const isAtEnd = e.currentTarget.selectionStart === input.length;
      if (e.key === 'Tab' || (e.key === 'ArrowRight' && isAtEnd)) {
        e.preventDefault();
        setInput(ghostSuggestion.completion);
        setGhostSuggestion(null);
        return;
      }
    }

    // 2. AI suggestion completion via Tab
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

  return (
    <div className="relative">
      {/* Floating AI Command Generator Card */}
      {isAiMode && (
        <div className="absolute bottom-full mb-2 right-4 w-[520px] glass-modal rounded-2xl p-4 shadow-[0_15px_40px_rgba(0,0,0,0.8)] border border-cyan-500/30 animate-in slide-in-from-bottom-2 duration-150 z-30 select-none">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <div className="flex items-center space-x-2">
              <div className="p-1 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(0,216,255,0.2)]">
                <Sparkles size={13} className="animate-pulse" />
              </div>
              <span className="font-bold text-xs text-white font-sans">
                Warp AI Command Search
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.1] text-cyan-300">
                Natural Language ➔ Shell
              </span>
            </div>

            <button
              onClick={() => {
                setInput('');
                setSuggestion(null);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          <div className="pt-3 space-y-2.5">
            {loadingAi && !suggestion ? (
              <div className="flex items-center space-x-2 py-3 text-xs text-slate-400 font-mono">
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                <span>Translating query into shell command...</span>
              </div>
            ) : suggestion ? (
              <>
                {/* Monospace Command Box */}
                <div className="p-2.5 rounded-xl bg-black/80 border border-cyan-500/40 font-mono text-xs text-cyan-200 flex items-center justify-between shadow-inner">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-cyan-400 font-bold select-none">$</span>
                    <span className="truncate font-semibold select-text">{suggestion.command}</span>
                  </div>

                  <div className="flex items-center space-x-1 flex-shrink-0 pl-2">
                    <button
                      onClick={handleCopySuggestion}
                      className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                      title="Copy command"
                    >
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Explanation */}
                <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                  {suggestion.explanation}
                </p>

                {/* Keyboard Shortcuts & Actions */}
                <div className="pt-2 flex items-center justify-between border-t border-white/[0.06] text-[10px] font-mono text-slate-400">
                  <div className="flex items-center space-x-2">
                    <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-slate-300 font-sans">↵ Enter</kbd> Run</span>
                    <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-slate-300 font-sans">Tab</kbd> Insert</span>
                    <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-slate-300 font-sans">Esc</kbd> Cancel</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => {
                        setInput(suggestion.command);
                        setSuggestion(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 text-[10px] font-sans font-medium transition-all"
                    >
                      Insert into Input
                    </button>
                    <button
                      onClick={() => {
                        onSendInput(suggestion.command + '\r');
                        setInput('');
                        setSuggestion(null);
                      }}
                      className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-[10px] font-sans font-semibold transition-all shadow-[0_0_12px_rgba(0,216,255,0.3)]"
                    >
                      <Play size={10} className="fill-current" />
                      <span>Run Now</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-2 text-xs text-slate-400 font-sans">
                Type what you want to do in plain English or Turkish (e.g. <span className="font-mono text-cyan-300"># port 3000 kapat</span> or <span className="font-mono text-cyan-300"># undo last commit</span>)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Bottom Dock Bar */}
      <div className="h-13 bg-[#090b12]/90 backdrop-blur-xl border-t border-white/[0.08] flex items-center justify-between px-4 py-2 select-none flex-shrink-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        {/* Left: Active Session Indicator */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Target:
          </span>
          {activeSession ? (
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.09] text-slate-200 font-mono text-xs shadow-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00d8ff] animate-pulse" />
              <span className="font-semibold">{activeSession.title}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 italic">Select a terminal pane</span>
          )}
        </div>

        {/* Center Quick Commands */}
        <div className="flex items-center space-x-2">
          {/* AI Command Trigger Chip */}
          <button
            onClick={() => setInput('# ')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-500/15 via-indigo-500/15 to-purple-500/15 hover:from-cyan-500/25 hover:to-purple-500/25 border border-cyan-500/30 text-cyan-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-[0_0_10px_rgba(0,216,255,0.15)]"
            title="Type '#' for Natural Language AI Command Search"
          >
            <Sparkles size={11} className="text-cyan-400 animate-pulse" />
            <span># AI Cmd</span>
          </button>

          <button
            onClick={() => onSendInput('claude\r')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-purple-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-sm"
            title="Type 'claude' in active terminal"
          >
            <Sparkles size={11} className="text-purple-400" />
            <span>claude</span>
          </button>

          <button
            onClick={() => onSendInput('agy\r')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-sm"
            title="Type 'agy' in active terminal"
          >
            <Shield size={11} className="text-cyan-400" />
            <span>agy</span>
          </button>

          <button
            onClick={() => onSendInput('codex\r')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-200 text-xs font-mono transition-all hover:scale-105 active:scale-95 shadow-sm"
            title="Type 'codex' in active terminal"
          >
            <Bot size={11} className="text-emerald-400" />
            <span>codex</span>
          </button>

          <button
            onClick={() => onSendInput('npm test\r')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-mono transition-all hover:scale-105 active:scale-95"
            title="Run test suite"
          >
            <CheckCircle2 size={11} className="text-emerald-400" />
            <span>npm test</span>
          </button>

          <button
            onClick={() => onSendInput('git status\r')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-mono transition-all hover:scale-105 active:scale-95"
            title="Check git status"
          >
            <GitBranch size={11} className="text-amber-400" />
            <span>git status</span>
          </button>
        </div>

        {/* Right: Inline Input with Ghost Text */}
        <form onSubmit={handleSubmit} className="relative flex items-center space-x-2">
          {/* Floating Ghost Suggestion Micro-Pill */}
          {ghostSuggestion && !isAiMode && (
            <div className="absolute bottom-full mb-1.5 right-0 flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-[#0d101a]/95 border border-cyan-500/30 text-[11px] font-mono shadow-xl backdrop-blur-md animate-fadeIn z-20 select-none">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.1] text-cyan-300 font-bold text-[10px]">Tab ⇥</span>
              <span className="text-slate-400">or</span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.1] text-cyan-300 font-bold text-[10px]">→</span>
              <span className="text-slate-300 truncate max-w-[200px]">{ghostSuggestion.description || 'Complete command'}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {ghostSuggestion.source}
              </span>
            </div>
          )}

          <div className="relative flex items-center">
            <span
              className={`absolute left-2.5 font-mono text-xs select-none transition-colors z-10 ${
                isAiMode ? 'text-purple-400 font-bold' : 'text-cyan-400'
              }`}
            >
              {isAiMode ? '✨' : '❯'}
            </span>

            {/* Ghost Text Overlay behind caret */}
            {ghostSuggestion && !isAiMode && (
              <div className="absolute inset-0 pl-7 pr-3 py-1.5 flex items-center pointer-events-none font-mono text-xs overflow-hidden select-none whitespace-pre">
                <span className="opacity-0">{input}</span>
                <span className="text-slate-500 italic opacity-80">{ghostSuggestion.suffix}</span>
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
                  ? "Type command, or '# port 3000 kapat' for AI search..."
                  : 'Select a terminal first'
              }
              className={`w-96 glass-input rounded-xl pl-7 pr-3 py-1.5 text-slate-200 text-xs font-mono placeholder:text-slate-500 focus:outline-none transition-all shadow-inner relative z-0 bg-transparent ${
                isAiMode
                  ? 'border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.2)] text-purple-200'
                  : 'focus:border-cyan-500/60'
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || !activeSession}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-white text-xs font-medium transition-all shadow-sm hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
              isAiMode
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-[0_0_12px_rgba(0,216,255,0.25)]'
            }`}
          >
            <Send size={11} />
            <CornerDownLeft size={10} className="text-cyan-200" />
          </button>
        </form>
      </div>
    </div>
  );
};
