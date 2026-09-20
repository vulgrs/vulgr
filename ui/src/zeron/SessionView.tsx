import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Monitor,
  Folder,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Brain,
} from 'lucide-react';
import { Composer } from './Composer.js';
import { ToolCall } from './ToolCall.js';
import { Markdown } from './Markdown.js';
import type { EffortLevel, ImageAttachment, ModelOption, Session } from './types.js';
import type { ChatMessage } from '../types/warp.js';

interface SessionViewProps {
  session: Session;
  host: string;
  repo: string;
  branch: string;
  model: ModelOption;
  effort: EffortLevel;
  onSelectModel: (m: ModelOption) => void;
  onSelectEffort: (e: EffortLevel) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  attachments: ImageAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
}

/** Collapsible "Thought process" block for extended-thinking content. */
const ThinkingBlock: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.03] text-left"
      >
        <Brain size={13} className="text-zinc-500 flex-shrink-0" />
        <span className="text-[12px] font-medium text-zinc-400">Thought process</span>
        <ChevronRight
          size={13}
          className={`ml-auto text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3 py-2 text-[12.5px] text-zinc-400 leading-relaxed whitespace-pre-wrap break-words">
          {message.text}
        </div>
      )}
    </div>
  );
};

/** User and assistant text bubbles (tool calls are rendered separately). */
const TextBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  if (message.kind === 'thinking') {
    return <ThinkingBlock message={message} />;
  }

  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-white/[0.08] border border-white/10 px-3.5 py-2 text-[13px] leading-relaxed text-zinc-100">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="attachment"
                  className="w-20 h-20 object-cover rounded-lg border border-white/10"
                />
              ))}
            </div>
          )}
          {message.text && <div className="whitespace-pre-wrap break-words">{message.text}</div>}
        </div>
      </div>
    );
  }

  if (message.kind === 'assistant') {
    return (
      <div className="text-[13.5px] leading-relaxed text-zinc-200 px-0.5">
        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] bg-gradient-to-br from-zinc-200 to-zinc-400 text-[8px] font-bold text-black">
            ✳
          </span>
          Claude
          {message.streaming && <Loader2 size={10} className="animate-spin text-zinc-600" />}
        </div>
        {message.streaming ? (
          <div className="whitespace-pre-wrap break-words">{message.text}</div>
        ) : (
          <Markdown>{message.text}</Markdown>
        )}
      </div>
    );
  }

  // error
  return (
    <div className="flex justify-center">
      <div className="max-w-[90%] rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-[12px] text-red-300 flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
        <span className="whitespace-pre-wrap break-words">{message.text}</span>
      </div>
    </div>
  );
};

const HeaderSelector: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
    <span className="text-zinc-600">{icon}</span>
    <span>{label}</span>
    <ChevronDown size={11} className="text-zinc-700" />
  </div>
);

type RenderItem =
  | { kind: 'text'; message: ChatMessage }
  | { kind: 'tool'; call: ChatMessage; result?: ChatMessage };

/** Merge each tool_result into the tool_use it answers, for compact rendering. */
function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const resultByToolUse = new Map<string, ChatMessage>();
  for (const m of messages) {
    if (m.kind === 'tool_result' && m.toolUseId) resultByToolUse.set(m.toolUseId, m);
  }
  const consumed = new Set<string>();
  const items: RenderItem[] = [];
  for (const m of messages) {
    if (m.kind === 'tool_use') {
      const result = resultByToolUse.get(m.id);
      if (result) consumed.add(result.id);
      items.push({ kind: 'tool', call: m, result });
    } else if (m.kind === 'tool_result') {
      if (consumed.has(m.id)) continue;
      // Orphan result: render as a tool row with a generic call.
      items.push({
        kind: 'tool',
        call: { id: m.id + '-call', kind: 'tool_use', text: '', toolName: 'Tool', timestamp: m.timestamp },
        result: m,
      });
    } else {
      items.push({ kind: 'text', message: m });
    }
  }
  return items;
}

export const SessionView: React.FC<SessionViewProps> = ({
  session,
  host,
  repo,
  branch,
  model,
  effort,
  onSelectModel,
  onSelectEffort,
  input,
  onInputChange,
  onSubmit,
  onStop,
  attachments,
  onAddFiles,
  onRemoveAttachment,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = session.chat.messages;
  const items = useMemo(() => buildRenderItems(messages), [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col">
      {/* Session header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.06]">
        <span className="text-[13px] font-medium text-zinc-200 truncate">{session.title}</span>
        <div className="flex items-center gap-4">
          <HeaderSelector icon={<Monitor size={12} />} label={host} />
          <HeaderSelector icon={<Folder size={12} />} label={repo} />
          <HeaderSelector icon={<GitBranch size={12} />} label={branch} />
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[760px] mx-auto w-full px-5 py-5 space-y-2.5">
          {items.map((item) =>
            item.kind === 'text' ? (
              <TextBubble key={item.message.id} message={item.message} />
            ) : (
              <ToolCall key={item.call.id} call={item.call} result={item.result} />
            )
          )}
          {session.running && session.chat.streamingText === '' && (
            <div className="flex items-center gap-2 text-[12px] text-zinc-500 px-0.5">
              <Loader2 size={13} className="animate-spin" /> Claude is working…
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="px-5 pb-5 pt-1">
        <div className="max-w-[760px] mx-auto w-full">
          <Composer
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            model={model}
            effort={effort}
            onSelectModel={onSelectModel}
            onSelectEffort={onSelectEffort}
            attachments={attachments}
            onAddFiles={onAddFiles}
            onRemoveAttachment={onRemoveAttachment}
            running={session.running}
            onStop={onStop}
            placeholder={session.running ? 'Queue a follow-up…' : 'Reply to Claude…'}
          />
        </div>
      </div>
    </div>
  );
};
