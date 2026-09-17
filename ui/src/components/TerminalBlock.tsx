import React, { useState } from 'react';
import { Terminal, Check, X, Clock, Copy, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import type { TerminalCommandBlock } from '../types/warp.js';

interface TerminalBlockProps {
  block: TerminalCommandBlock;
  onAskAiAboutError?: (errorMsg: string, command: string) => void;
}

export const TerminalBlock: React.FC<TerminalBlockProps> = ({ block, onAskAiAboutError }) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = () => {
    const text = `$ ${block.command}\n${block.stdout}\n${block.stderr}`.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isFailed = block.exitCode !== null && block.exitCode !== 0;

  return (
    <div className="rounded-lg bg-warp-surface border border-warp-border shadow-md overflow-hidden transition-all hover:border-warp-borderLight">
      {/* Block Header (Warp Style) */}
      <div className="px-3 py-2 bg-warp-card/70 border-b border-warp-border flex items-center justify-between text-xs select-none">
        <div className="flex items-center space-x-2.5 min-w-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          <span className="text-cyan-400 font-bold font-mono">$</span>

          <span className="font-mono font-medium text-slate-100 truncate max-w-xl">
            {block.command}
          </span>
        </div>

        {/* Right Status & Meta */}
        <div className="flex items-center space-x-2.5 flex-shrink-0 text-[11px] font-mono">
          {block.durationMs !== undefined && (
            <div className="flex items-center space-x-1 text-slate-400">
              <Clock size={11} />
              <span>{block.durationMs}ms</span>
            </div>
          )}

          {block.isExecuting ? (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-700 text-cyan-300 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Running...</span>
            </div>
          ) : block.exitCode === 0 ? (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400">
              <Check size={12} />
              <span>0</span>
            </div>
          ) : isFailed ? (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800 text-red-400">
              <X size={12} />
              <span>{block.exitCode}</span>
            </div>
          ) : null}

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-warp-surface transition-colors"
            title="Copy block"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {/* Block Output */}
      {!collapsed && (
        <div className="p-3 font-mono text-xs text-slate-200 bg-warp-bg/90 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[500px]">
          {block.stdout && <div>{block.stdout}</div>}
          {block.stderr && <div className="text-red-400 mt-1">{block.stderr}</div>}

          {!block.stdout && !block.stderr && !block.isExecuting && (
            <div className="text-slate-500 italic">[Process completed with no output]</div>
          )}

          {/* Warp "Ask AI about this error" suggestion pill */}
          {isFailed && onAskAiAboutError && (
            <div className="mt-3 pt-2 border-t border-warp-border/60 flex items-center justify-between">
              <span className="text-[11px] text-red-400 font-sans">Command exited with failure.</span>
              <button
                onClick={() => onAskAiAboutError(block.stderr || block.stdout, block.command)}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-gradient-to-r from-purple-900/60 to-indigo-900/60 hover:from-purple-800 hover:to-indigo-800 border border-purple-500/50 text-purple-200 text-[11px] font-sans font-medium transition-all shadow-sm"
              >
                <Sparkles size={12} className="text-purple-300" />
                <span>Fix error with AI Orchestrator</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
