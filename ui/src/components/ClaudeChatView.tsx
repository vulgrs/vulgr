import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Send,
  Square,
  Loader2,
  Terminal as TerminalIcon,
  FileEdit,
  FilePlus,
  FileText,
  Search,
  Globe,
  ListTodo,
  Wrench,
  AlertTriangle,
  Sparkles,
  User,
  GitBranch,
  RotateCcw,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer.js';
import {
  reduceChatEvent,
  appendUserMessage,
  initialChatState,
  type ChatReducerState,
} from '../utils/claudeStreamParser.js';
import type { ChatMessage } from '../types/warp.js';

interface ClaudeChatViewProps {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  gitBranch: string | null;
}

/** Icon for a given tool_use bubble. */
function toolIcon(name?: string) {
  switch (name) {
    case 'Bash':
      return <TerminalIcon size={13} />;
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return <FileEdit size={13} />;
    case 'Write':
      return <FilePlus size={13} />;
    case 'Read':
      return <FileText size={13} />;
    case 'Glob':
    case 'Grep':
      return <Search size={13} />;
    case 'WebFetch':
    case 'WebSearch':
      return <Globe size={13} />;
    case 'TodoWrite':
      return <ListTodo size={13} />;
    default:
      return <Wrench size={13} />;
  }
}

/** Split assistant text into plain and fenced-code segments. */
function renderRichText(text: string): React.ReactNode {
  const parts = text.split(/```/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // fenced code block: strip an optional language tag on the first line
      const firstNewline = part.indexOf('\n');
      const code = firstNewline >= 0 ? part.slice(firstNewline + 1) : part;
      return (
        <pre
          key={i}
          className="my-2 rounded-lg bg-zinc-950 border border-zinc-800 p-3 overflow-x-auto text-[12px] leading-5 font-mono text-zinc-200"
        >
          {code.replace(/\n$/, '')}
        </pre>
      );
    }
    return (
      <span key={i} className="whitespace-pre-wrap break-words">
        {part}
      </span>
    );
  });
}

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const [expanded, setExpanded] = useState(false);

  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-indigo-600/90 text-white px-4 py-2.5 text-[13px] leading-relaxed shadow-sm">
          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
            <User size={11} /> You
          </div>
          <div className="whitespace-pre-wrap break-words">{message.text}</div>
        </div>
      </div>
    );
  }

  if (message.kind === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-[13px] leading-relaxed text-zinc-200">
          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            <Sparkles size={11} /> Claude
            {message.streaming && <Loader2 size={11} className="animate-spin text-zinc-500" />}
          </div>
          <div>{renderRichText(message.text)}</div>
        </div>
      </div>
    );
  }

  if (message.kind === 'tool_use') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] w-full rounded-xl bg-zinc-950 border border-zinc-800/80 px-3 py-2 text-[12px] font-mono text-zinc-300">
          <div className="flex items-center gap-2 text-sky-300">
            <span className="text-sky-400">{toolIcon(message.toolName)}</span>
            <span className="font-semibold">{message.toolName || 'tool'}</span>
          </div>
          {message.toolInput && (
            <div className="mt-1 pl-5 text-zinc-400 whitespace-pre-wrap break-words">
              {message.toolInput}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.kind === 'tool_result') {
    const long = message.text.length > 600;
    const shown = expanded || !long ? message.text : message.text.slice(0, 600) + '…';
    return (
      <div className="flex justify-start">
        <div
          className={`max-w-[85%] w-full rounded-xl border px-3 py-2 text-[11px] font-mono ${
            message.isError
              ? 'border-red-900/60 bg-red-950/30 text-red-300'
              : 'border-zinc-800/60 bg-zinc-950/60 text-zinc-400'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wide opacity-70">
            {message.isError && <AlertTriangle size={10} />} output
          </div>
          <pre className="whitespace-pre-wrap break-words">{shown}</pre>
          {long && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="flex justify-center">
      <div className="max-w-[90%] rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[12px] text-red-300 flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
        <span className="whitespace-pre-wrap break-words">{message.text}</span>
      </div>
    </div>
  );
};

export const ClaudeChatView: React.FC<ClaudeChatViewProps> = ({ isOpen, onClose, cwd, gitBranch }) => {
  const [state, setState] = useState<ChatReducerState>(initialChatState);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [diff, setDiff] = useState('');
  const sessionIdRef = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const api = (window as any).warpApi;

  const refreshDiff = useCallback(async () => {
    try {
      const res = await api?.getGitDiff?.(cwd);
      if (res) setDiff(res.diff || '');
    } catch {}
  }, [api, cwd]);

  // Subscribe to stream events while the view is open.
  useEffect(() => {
    if (!isOpen || !api) return;
    const offEvent = api.onClaudeChatEvent(({ id, event }: { id: string; event: any }) => {
      if (id !== sessionIdRef.current) return;
      setState((prev) => reduceChatEvent(prev, event));
      if (event?.type === 'result') {
        setRunning(false);
        refreshDiff();
      }
    });
    const offExit = api.onClaudeChatExit(({ id }: { id: string; code: number }) => {
      if (id !== sessionIdRef.current) return;
      setRunning(false);
      refreshDiff();
    });
    return () => {
      offEvent?.();
      offExit?.();
    };
  }, [isOpen, api, refreshDiff]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (isOpen) refreshDiff();
  }, [isOpen, refreshDiff]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || running) return;
    setInput('');
    setState((prev) => appendUserMessage(prev, text));
    setRunning(true);

    if (!started) {
      const id = `chat-${Date.now()}`;
      sessionIdRef.current = id;
      setStarted(true);
      api?.startClaudeChat({ id, prompt: text, cwd });
    } else {
      api?.sendClaudeChat(sessionIdRef.current, text);
    }
  }, [input, running, started, api, cwd]);

  const handleStop = useCallback(() => {
    if (sessionIdRef.current) api?.stopClaudeChat(sessionIdRef.current);
    setRunning(false);
  }, [api]);

  const handleNewChat = useCallback(() => {
    if (sessionIdRef.current) api?.stopClaudeChat(sessionIdRef.current);
    sessionIdRef.current = '';
    setStarted(false);
    setRunning(false);
    setState(initialChatState());
  }, [api]);

  const meta = state.meta;
  const costText = useMemo(
    () => (meta.totalCostUsd != null ? `$${meta.totalCostUsd.toFixed(4)}` : null),
    [meta.totalCostUsd]
  );

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex bg-base-app">
      {/* Chat column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-900/70 bg-zinc-950/60">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={15} className="text-violet-400 flex-shrink-0" />
            <span className="text-[13px] font-semibold text-zinc-200">Claude Code Chat</span>
            {meta.model && (
              <span className="text-[10px] font-mono text-zinc-500 truncate">· {meta.model}</span>
            )}
            {costText && <span className="text-[10px] font-mono text-emerald-400">· {costText}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleNewChat}
              className="px-2 py-1 rounded-md text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 flex items-center gap-1"
              title="Start a new conversation"
            >
              <RotateCcw size={12} /> New
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              title="Close chat"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {state.messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center select-none">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-violet-400 mb-3">
                <Sparkles size={22} />
              </div>
              <p className="text-sm font-semibold text-zinc-300">Ask Claude Code to build something</p>
              <p className="text-[12px] text-zinc-500 mt-1 max-w-sm">
                Try “create a todo app”. Output streams here as chat, file changes show in the diff
                panel on the right.
              </p>
            </div>
          )}
          {state.messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {running && state.streamingText === '' && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-zinc-500 flex items-center gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" /> Claude is working…
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-zinc-900/70 bg-zinc-950/60 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={running ? 'Claude is working… (you can queue a follow-up)' : 'Message Claude Code…'}
              className="flex-1 resize-none max-h-40 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-violet-600/60 outline-none px-3 py-2.5 text-[13px] text-zinc-200 placeholder:text-zinc-600"
            />
            {running ? (
              <button
                onClick={handleStop}
                className="h-10 px-3 rounded-xl bg-red-600/90 hover:bg-red-600 text-white flex items-center gap-1.5 text-[12px] font-semibold"
                title="Stop the current turn"
              >
                <Square size={13} /> Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="h-10 px-3 rounded-xl bg-violet-600 enabled:hover:bg-violet-500 disabled:opacity-40 text-white flex items-center gap-1.5 text-[12px] font-semibold"
              >
                <Send size={13} /> Send
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Diff sidebar */}
      <div className="w-[380px] flex-shrink-0 border-l border-zinc-900/70 bg-zinc-950/40 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-900/70">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-300">
            <FileEdit size={13} className="text-zinc-400" /> Changes
          </div>
          <div className="flex items-center gap-2">
            {gitBranch && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                <GitBranch size={11} /> {gitBranch}
              </span>
            )}
            <button
              onClick={refreshDiff}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              title="Refresh diff"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <DiffViewer diff={diff} />
        </div>
      </div>
    </div>
  );
};
