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
        <div className="absolute bottom-full mb-2 right-4 w-[520px] bg-[#09090b] rounded-xl p-4 shadow-2xl border border-zinc-800 animate-in slide-in-from-bottom-2 duration-150 z-30 select-none">
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
                {/* Monospace Command Box */}
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

                {/* Explanation */}
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                  {suggestion.explanation}
                </p>

                {/* Keyboard Shortcuts & Actions */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80 text-[10px] font-mono text-zinc-400">
                  <div className="flex items-center space-x-2">
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">↵ Enter</kbd> Run</span>
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">Tab</kbd> Insert</span>
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">Esc</kbd> Cancel</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => {
                        setInput(suggestion.command);
                        setSuggestion(null);
                      }}
                      className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-[10px] font-sans font-medium transition-all"
                    >
                      Insert into Input
                    </button>
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
                Type what you want to do in plain English or Turkish (e.g. <span className="font-mono text-zinc-200"># port 3000 kapat</span> or <span className="font-mono text-zinc-200"># undo last commit</span>)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Bottom Dock Bar */}
      <div className="h-10 bg-[#000000] border-t border-zinc-900 flex items-center justify-between px-3.5 select-none flex-shrink-0 z-20">
        {/* Left: Active Session Indicator */}
        <div className="flex items-center space-x-2 min-w-0 flex-shrink-0">
          {activeSession ? (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800/80 text-zinc-300 font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span className="font-medium truncate max-w-[130px]">{activeSession.title}</span>
            </div>
          ) : (
            <span className="text-[11px] text-zinc-600 font-mono italic">No active pane</span>
          )}
        </div>

        {/* Center & Right: Focused Prompt Input with Ghost Text */}
        <form onSubmit={handleSubmit} className="relative flex-1 max-w-2xl mx-4 flex items-center space-x-2">
          {/* Floating Ghost Suggestion Micro-Pill */}
          {ghostSuggestion && !isAiMode && (
            <div className="absolute bottom-full mb-1.5 left-0 flex items-center space-x-2 px-2.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[10px] font-mono shadow-xl animate-in fade-in z-20 select-none">
              <span className="px-1 py-0.2 rounded bg-zinc-900 text-zinc-300 font-bold text-[9px] border border-zinc-800">Tab ⇥</span>
              <span className="text-zinc-500">or</span>
              <span className="px-1 py-0.2 rounded bg-zinc-900 text-zinc-300 font-bold text-[9px] border border-zinc-800">→</span>
              <span className="text-zinc-300 truncate max-w-[200px]">{ghostSuggestion.description || 'Complete command'}</span>
              <span className="px-1 py-0.2 rounded text-[8px] uppercase bg-zinc-900 text-zinc-400 border border-zinc-800">
                {ghostSuggestion.source}
              </span>
            </div>
          )}

          <div className="relative flex-1 flex items-center">
            <span
              className={`absolute left-2.5 font-mono text-xs select-none transition-colors z-10 ${
                isAiMode ? 'text-zinc-200 font-bold' : 'text-zinc-500'
              }`}
            >
              {isAiMode ? '✨' : '❯'}
            </span>

            {/* Ghost Text Overlay behind caret */}
            {ghostSuggestion && !isAiMode && (
              <div className="absolute inset-0 pl-6 pr-3 py-1 flex items-center pointer-events-none font-mono text-xs overflow-hidden select-none whitespace-pre">
                <span className="opacity-0">{input}</span>
                <span className="text-zinc-500 italic opacity-80">{ghostSuggestion.suffix}</span>
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
              className={`w-full rounded-md pl-6 pr-3 py-1 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:outline-none transition-all shadow-inner relative z-0 bg-zinc-950 border border-zinc-800/80 focus:border-zinc-600 focus:bg-zinc-900/50 ${
                isAiMode
                  ? 'border-zinc-600 shadow-[0_0_12px_rgba(255,255,255,0.06)] text-zinc-100'
                  : ''
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || !activeSession}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all shadow-sm bg-zinc-100 hover:bg-white text-zinc-950 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border disabled:border-zinc-800/60 disabled:cursor-not-allowed"
          >
            <Send size={11} />
            <CornerDownLeft size={10} className="text-zinc-600" />
          </button>
        </form>

        {/* Right shortcut tip */}
        <div className="hidden lg:flex items-center space-x-2 text-[10px] font-mono text-zinc-600">
          <span># for AI</span>
          <span>•</span>
          <span>^⇧P for palette</span>
        </div>
      </div>
    </div>
  );
};
