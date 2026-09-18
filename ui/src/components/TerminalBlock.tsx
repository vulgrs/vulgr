import React, { useState } from 'react';
import {
  Terminal,
  Check,
  X,
  Clock,
  Copy,
  Sparkles,
  Shield,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  CornerDownLeft,
} from 'lucide-react';
import type { TerminalCommandBlock } from '../types/warp.js';

interface TerminalBlockProps {
  block: TerminalCommandBlock;
  onExplainWithClaude?: (command: string, output: string) => void;
  onFixWithAgy?: (command: string, errorSnippet: string) => void;
  onRerunCommand?: (command: string) => void;
}

export const TerminalBlock: React.FC<TerminalBlockProps> = ({
  block,
  onExplainWithClaude,
  onFixWithAgy,
  onRerunCommand,
}) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleCopy = () => {
    const text = `$ ${block.command}\n${block.stdout}\n${block.stderr}`.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isFailed = block.exitCode !== null && block.exitCode !== 0;
  const combinedOutput = `${block.stdout}\n${block.stderr}`.trim();

  return (
    <div
      className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-150 ${
 isFailed
 ? 'border-red-900/50 bg-[#070505]'
 : 'border-zinc-800 hover:border-zinc-700 bg-[#050505]'
 }`}
    >
      {/* Block Header (Warp Style) */}
      <div className="px-3.5 py-2 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between text-xs select-none">
        <div className="flex items-center space-x-2.5 min-w-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>

          <span className="text-zinc-500 font-bold font-mono text-xs select-none">❯</span>

          <span className="font-mono font-semibold text-zinc-100 truncate max-w-xl text-xs">
            {block.command}
          </span>
        </div>

        {/* Right Status & Meta */}
        <div className="flex items-center space-x-2 flex-shrink-0 text-[11px] font-mono">
          {block.durationMs !== undefined && (
            <div className="flex items-center space-x-1 text-zinc-500 text-[10px]">
              <Clock size={10} />
              <span>{block.durationMs}ms</span>
            </div>
          )}

          {block.isExecuting ? (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
              <span>Running...</span>
            </div>
          ) : block.exitCode === 0 ? (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-bold">
              <Check size={11} className="text-emerald-400" />
              <span>0</span>
            </div>
          ) : isFailed ? (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-red-950/50 border border-red-800/50 text-red-300 text-[10px] font-bold">
              <X size={11} />
              <span>{block.exitCode}</span>
            </div>
          ) : null}

          {/* Quick Action Pills on Hover */}
          <div className="flex items-center space-x-1 pl-1 border-l border-zinc-800">
            {onExplainWithClaude && (
              <button
                onClick={() => onExplainWithClaude(block.command, combinedOutput)}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[10px] font-sans font-medium transition-all"
                title="Explain this command & output with Claude"
              >
                <Sparkles size={10} className="text-zinc-400" />
                <span>Explain</span>
              </button>
            )}

            {isFailed && onFixWithAgy && (
              <button
                onClick={() => onFixWithAgy(block.command, block.stderr || block.stdout)}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[10px] font-sans font-medium transition-all"
                title="Fix this error with AGY Engine"
              >
                <Shield size={10} className="text-zinc-400" />
                <span>Fix w/ AGY</span>
              </button>
            )}

            {onRerunCommand && (
              <button
                onClick={() => onRerunCommand(block.command)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
                title="Re-run command"
              >
                <RotateCcw size={11} />
              </button>
            )}

            <button
              onClick={handleCopy}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              title="Copy command and output"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      </div>

      {/* Block Output */}
      {!collapsed && (
        <div className="p-3 font-mono text-xs text-zinc-200 bg-[#000000] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[420px] select-text">
          {block.stdout && <div>{block.stdout}</div>}
          {block.stderr && <div className="text-red-300 mt-1">{block.stderr}</div>}

          {!block.stdout && !block.stderr && !block.isExecuting && (
            <div className="text-zinc-600 italic text-[11px]">[Process completed with no output]</div>
          )}

          {/* Prompt banner for failure */}
          {isFailed && (
            <div className="mt-3 pt-2.5 border-t border-red-900/40 flex items-center justify-between bg-red-950/20 -mx-3 -mb-3 p-3">
              <span className="text-[11px] text-red-300 font-sans flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span>Process exited with code {block.exitCode}. Error detected.</span>
              </span>

              <div className="flex items-center space-x-2">
                {onFixWithAgy && (
                  <button
                    onClick={() => onFixWithAgy(block.command, block.stderr || block.stdout)}
                    className="flex items-center space-x-1 px-3 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-sans font-medium transition-all shadow-sm"
                  >
                    <Shield size={11} />
                    <span>Auto-Fix with AGY</span>
                  </button>
                )}

                {onExplainWithClaude && (
                  <button
                    onClick={() => onExplainWithClaude(block.command, combinedOutput)}
                    className="flex items-center space-x-1 px-3 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-sans font-medium transition-all shadow-sm"
                  >
                    <Sparkles size={11} />
                    <span>Diagnose with Claude</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

