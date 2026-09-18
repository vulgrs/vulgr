import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Sparkles,
  Shield,
  Zap,
  CornerDownLeft,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Terminal,
  Loader2,
} from 'lucide-react';
import type { TerminalCommandBlock } from '../types/warp.js';
import { TerminalBlock } from './TerminalBlock.js';

export interface StreamItem {
  id: string;
  userPrompt?: string;
  thoughtLog?: string;
  toolCapsule?: string;
  commandBlock?: TerminalCommandBlock;
  durationMs?: number;
  timestamp?: string;
  metaText?: string;
}

interface CommandBlocksFeedProps {
  items: StreamItem[];
  onExplainWithClaude?: (command: string, output: string) => void;
  onFixWithAgy?: (command: string, errorSnippet: string) => void;
  onRerunCommand?: (command: string) => void;
  onQuickPrompt?: (prompt: string) => void;
}

export const CommandBlocksFeed: React.FC<CommandBlocksFeedProps> = ({
  items,
  onExplainWithClaude,
  onFixWithAgy,
  onRerunCommand,
  onQuickPrompt,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, 'up' | 'down' | null>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleReaction = (id: string, type: 'up' | 'down') => {
    setReactions((prev) => ({
      ...prev,
      [id]: prev[id] === type ? null : type,
    }));
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return null;
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto px-6 py-6 space-y-6 select-text font-sans bg-[#000000]">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center py-16 select-none">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 mb-3 shadow-sm">
            <Terminal size={22} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">Terminal Command Stream</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm leading-relaxed">
            Run commands or prompt AI agents in the dock below. Execution logs, timers, and tool
            outputs will stream here.
          </p>

          <div className="flex items-center space-x-2 mt-5">
            <button
              onClick={() => onQuickPrompt && onQuickPrompt('git status')}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono transition-all"
            >
              git status
            </button>
            <button
              onClick={() => onQuickPrompt && onQuickPrompt('npm test')}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono transition-all"
            >
              npm test
            </button>
            <button
              onClick={() => onQuickPrompt && onQuickPrompt('# check working tree changes')}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-sans transition-all"
            >
              # AI Search
            </button>
          </div>
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="space-y-3 max-w-3xl mx-auto">
            {/* 1. User Prompt Bubble (Matches reference: "çalışmıyor vercelde yüklü") */}
            {item.userPrompt && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 text-xs font-medium text-zinc-100 shadow-sm leading-relaxed max-w-2xl">
                  {item.userPrompt}
                </div>
              </div>
            )}

            {/* 2. Execution Timer Badge (Matches reference: "Worked for 3m 58s") */}
            {(item.durationMs !== undefined || item.commandBlock?.isExecuting) && (
              <div className="flex items-center space-x-1.5 text-xs text-zinc-500 font-sans select-none pl-1">
                {item.commandBlock?.isExecuting ? (
                  <>
                    <Loader2 size={12} className="animate-spin text-zinc-400" />
                    <span className="text-zinc-400">Executing command...</span>
                  </>
                ) : (
                  <>
                    <Clock size={12} className="text-zinc-500" />
                    <span>Worked for {formatDuration(item.durationMs)}</span>
                  </>
                )}
              </div>
            )}

            {/* 3. Thought / Log Statement (Matches reference: "Log doğrulandı: SQLITE_CANTOPEN...") */}
            {item.thoughtLog && (
              <div className="pl-1 text-xs text-zinc-300 font-sans leading-relaxed">
                {item.thoughtLog}
              </div>
            )}

            {/* 4. Tool / Plugin Capsule */}
            {item.toolCapsule && (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800/90 text-xs text-zinc-300 font-mono w-fit max-w-full shadow-inner">
                <Zap size={12} className="text-zinc-400 flex-shrink-0" />
                <span className="truncate">{item.toolCapsule}</span>
              </div>
            )}

            {/* 5. Terminal Command Block & Output (Matches reference: ">. Get Neon integration install help...") */}
            {item.commandBlock && (
              <TerminalBlock
                block={item.commandBlock}
                onExplainWithClaude={onExplainWithClaude}
                onFixWithAgy={onFixWithAgy}
                onRerunCommand={onRerunCommand}
              />
            )}

            {/* 6. Metadata / Reactions Footer (Matches reference: Updated metadata | 👍 👎 ⎘ 3h ago) */}
            <div className="flex items-center justify-between pt-1 pl-1 text-[11px] text-zinc-500 select-none">
              <span className="font-sans text-zinc-500">{item.metaText || 'Execution completed'}</span>

              <div className="flex items-center space-x-2 text-zinc-500">
                <button
                  onClick={() => handleReaction(item.id, 'up')}
                  className={`p-1 rounded hover:text-zinc-200 transition-colors ${
 reactions[item.id] === 'up' ? 'text-emerald-400' : ''
 }`}
                  title="Helpful"
                >
                  <ThumbsUp size={12} />
                </button>
                <button
                  onClick={() => handleReaction(item.id, 'down')}
                  className={`p-1 rounded hover:text-zinc-200 transition-colors ${
 reactions[item.id] === 'down' ? 'text-red-400' : ''
 }`}
                  title="Not helpful"
                >
                  <ThumbsDown size={12} />
                </button>
                <button
                  onClick={() =>
                    handleCopy(
                      item.id,
                      item.commandBlock
                        ? `${item.commandBlock.command}\n${item.commandBlock.stdout}`
                        : item.thoughtLog || ''
                    )
                  }
                  className="p-1 rounded hover:text-zinc-200 transition-colors"
                  title="Copy block content"
                >
                  {copiedId === item.id ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
                <span className="font-mono text-[10px] text-zinc-600">
                  {item.timestamp || 'just now'}
                </span>
              </div>
            </div>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
};
