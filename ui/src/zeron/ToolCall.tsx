import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  FileEdit,
  FilePlus,
  FileText,
  Search,
  Globe,
  ListTodo,
  Wrench,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import type { ChatMessage } from '../types/warp.js';

interface ToolCallProps {
  call: ChatMessage; // kind === 'tool_use'
  result?: ChatMessage; // kind === 'tool_result'
}

function iconFor(name?: string) {
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

/** Short "verb + target" summary shown on the collapsed row. */
function summarize(name?: string, input?: string): { verb: string; target: string } {
  const t = input || '';
  switch (name) {
    case 'Bash':
      return { verb: 'Ran', target: t };
    case 'Read':
      return { verb: 'Read', target: t };
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { verb: 'Edited', target: t };
    case 'Write':
      return { verb: 'Wrote', target: t };
    case 'Glob':
    case 'Grep':
      return { verb: 'Searched', target: t };
    case 'WebFetch':
    case 'WebSearch':
      return { verb: 'Fetched', target: t };
    case 'TodoWrite':
      return { verb: 'Updated todos', target: '' };
    default:
      return { verb: name || 'Tool', target: t };
  }
}

export const ToolCall: React.FC<ToolCallProps> = ({ call, result }) => {
  const [open, setOpen] = useState(false);
  const { verb, target } = summarize(call.toolName, call.toolInput);
  const pending = !result;
  const isError = result?.isError;

  const hasDetail = !!(result?.text || (call.toolInput && call.toolInput.length > 60));

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left ${
          hasDetail ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className={`flex-shrink-0 ${isError ? 'text-red-400' : 'text-zinc-400'}`}>
          {iconFor(call.toolName)}
        </span>
        <span className="text-[12px] font-medium text-zinc-300 flex-shrink-0">{verb}</span>
        {target && (
          <span className="text-[11.5px] font-mono text-zinc-500 truncate min-w-0 flex-1">
            {target}
          </span>
        )}
        <span className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {pending && <Loader2 size={11} className="animate-spin text-zinc-600" />}
          {isError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
          {hasDetail && (
            <ChevronRight
              size={13}
              className={`text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`}
            />
          )}
        </span>
      </button>

      {open && hasDetail && (
        <div className="border-t border-white/[0.06] px-2.5 py-2 space-y-2">
          {call.toolInput && call.toolInput.length > 60 && (
            <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-words">
              {call.toolInput}
            </pre>
          )}
          {result?.text && (
            <pre
              className={`text-[11px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto rounded-md bg-black/40 p-2 ${
                isError ? 'text-red-300' : 'text-zinc-400'
              }`}
            >
              {result.text.length > 4000 ? result.text.slice(0, 4000) + '\n…' : result.text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
