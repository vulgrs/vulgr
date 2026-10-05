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
  /** Ctrl+Shift+Enter: hand the typed text to Claude as a prompt instead of running it. */
  onAskAgent?: (prompt: string) => void;
  /** Text pushed in from elsewhere (file explorer, skills) to append to the input. */
  insertRequest?: { text: string; nonce: number } | null;
  /** First-step buttons shown above the input until the session has run something. */
  quickActions?: { label: string; title?: string; onClick: () => void }[];
}

// Commands submitted from the dock, newest last. Module-level so the history
// survives the dock being unmounted while a program owns the terminal.
const HISTORY_KEY = 'vulgaris.dockHistory';
const HISTORY_MAX = 200;
const history: string[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
})();

function pushHistory(command: string) {
  if (history[history.length - 1] !== command) history.push(command);
  if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
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
  onAskAgent,
  insertRequest,
  quickActions,
}) => {
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [ghostSuggestion, setGhostSuggestion] = useState<AutoSuggestItem | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Position while browsing history with ↑/↓ (history.length = not browsing)
  // and the half-typed line to restore when stepping back past the newest entry.
  const historyIndex = useRef(history.length);
  const draft = useRef('');

  const lastInsert = useRef<number | null>(null);
  useEffect(() => {
    if (!insertRequest || insertRequest.nonce === lastInsert.current) return;
    lastInsert.current = insertRequest.nonce;
    const { text } = insertRequest;
    if (text) setInput((prev) => (prev && !prev.endsWith(' ') ? `${prev} ${text}` : prev + text));
    inputRef.current?.focus();
  }, [insertRequest]);

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

    if (isAiMode && suggestion) {
      onSendInput(suggestion.command + '\r');
      setInput('');
      setSuggestion(null);
      setGhostSuggestion(null);
      return;
    }

    if (!input.trim()) return;
    onSendInput(input + '\r');
    pushHistory(input.trim());
    historyIndex.current = history.length;

    // Also record in persistent MemoryStore
    if (window.warpApi?.recordMemoryCommand) {
      window.warpApi.recordMemoryCommand({ command: input.trim(), exitCode: 0 });
    }

    setInput('');
    setGhostSuggestion(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      const prompt = (isAiMode ? input.slice(1) : input).trim();
      if (!prompt || !onAskAgent) return;
      onAskAgent(prompt);
      setInput('');
      setSuggestion(null);
      setGhostSuggestion(null);
      return;
    }

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isAiMode && history.length > 0) {
      e.preventDefault();
      if (historyIndex.current === history.length) draft.current = input;
      const next = Math.min(
        history.length,
        Math.max(0, historyIndex.current + (e.key === 'ArrowUp' ? -1 : 1))
      );
      historyIndex.current = next;
      setInput(next === history.length ? draft.current : history[next]);
      setGhostSuggestion(null);
      return;
    }

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
      historyIndex.current = history.length;
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
                <span>Komuta çevriliyor...</span>
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
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">↵ Enter</kbd> Çalıştır</span>
                    <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-sans">Tab</kbd> Kutuya yerleştir</span>
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
                      <span>Şimdi çalıştır</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-2 text-xs text-zinc-400 font-sans">
                Ne yapmak istediğinizi yazın, uygun komutu önereyim (örn. <span className="font-mono text-zinc-200"># port 3000 kapat</span>).
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input block: cwd chip on top, then the input with a send button. */}
      <form onSubmit={handleSubmit} className="relative px-4 pt-3 pb-1.5">
        {quickActions && quickActions.length > 0 && !input && (
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 font-sans">
            <span className="text-[11px] text-zinc-500 mr-1">Başlamak için:</span>
            {quickActions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                title={a.title}
                className="px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 hover:bg-zinc-900 transition-colors"
              >
                {a.label}
              </button>
            ))}
            <span className="text-[11px] text-zinc-600 ml-1">ya da aşağıya bir komut yazın</span>
          </div>
        )}
        <div
          className="inline-flex items-center gap-1 px-1.5 py-1 rounded bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 text-[11px]"
          title={cwd || shortCwd}
        >
          <Folder size={11} />
          <span className="max-w-[320px] truncate">{shortCwd}</span>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative flex-1 flex items-center min-w-0">
            {/* Ghost Text Overlay */}
            {ghostSuggestion && !isAiMode && (
              <div className="absolute inset-0 px-0.5 flex items-center pointer-events-none font-mono text-[13px] overflow-hidden select-none whitespace-pre">
                <span className="opacity-0">{input}</span>
                <span className="text-zinc-600 italic">{ghostSuggestion.suffix}</span>
              </div>
            )}

            <input
              ref={inputRef}
              autoFocus
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={input}
              onChange={(e) => {
                historyIndex.current = history.length;
                setInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              disabled={!activeSession}
              placeholder={
                activeSession
                  ? "Komut yazıp Enter'a basın (örn. git status) · # ile Türkçe tarif edin · Ctrl+Shift+Enter ile Claude'a sorun"
                  : 'Önce bir terminal seçin'
              }
              className="w-full bg-transparent text-zinc-100 text-[13px] font-mono placeholder:text-zinc-600 focus:outline-none outline-none relative z-10"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || !activeSession}
            className="flex-shrink-0 flex items-center px-1.5 py-1 rounded border border-zinc-800 text-zinc-600 enabled:text-zinc-200 enabled:hover:bg-zinc-900 disabled:cursor-not-allowed transition-colors"
            title="Çalıştır (Enter)"
          >
            <ArrowRight size={12} />
          </button>
        </div>
      </form>

      {/* Hint Row — matches reference: shortcut hint left, status right */}
      <div className="flex items-center justify-between px-4 pb-2 text-[10px] font-mono text-zinc-600">
        <div className="flex items-center gap-3 min-w-0 truncate">
          <span><Kbd>Enter</Kbd> çalıştır</span>
          <span><Kbd>↑↓</Kbd> geçmiş</span>
          <span><Kbd>Tab</Kbd> tamamla</span>
          <span><Kbd>#</Kbd> Türkçe tarif → komut</span>
          {onAskAgent && <span><Kbd>Ctrl+Shift+Enter</Kbd> Claude'a sor</span>}
        </div>
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
              <span className="size-1.5 rounded-full bg-primary" />
              <span>{tokenSavingsText || '68% saved'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1 py-px rounded border border-zinc-800 bg-zinc-900/60 text-zinc-400 font-sans">{children}</kbd>
);
