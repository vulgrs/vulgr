import React, { useState } from 'react';
import { GitCompare, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface DiffViewerProps {
  diff: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  if (!diff || !diff.trim()) {
    return (
      <div className="p-3 text-xs text-slate-500 italic bg-warp-bg/50 rounded border border-warp-border">
        No git diff changes detected.
      </div>
    );
  }

  const lines = diff.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded border border-warp-border bg-warp-bg/80 overflow-hidden font-mono text-[11px]">
      <div className="px-3 py-1.5 bg-warp-card border-b border-warp-border flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center space-x-1.5 text-slate-300 font-sans font-medium hover:text-white transition-colors"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <GitCompare size={13} className="text-cyan-400" />
          <span>Git Diff Snapshot</span>
        </button>

        <button
          onClick={handleCopy}
          className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy diff"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>

      {expanded && (
        <div className="p-2 max-h-[350px] overflow-y-auto overflow-x-auto select-text space-y-0.5 leading-relaxed">
          {lines.map((line, idx) => {
            let colorClass = 'text-slate-300';
            let bgClass = 'transparent';

            if (line.startsWith('+') && !line.startsWith('+++')) {
              colorClass = 'text-emerald-400';
              bgClass = 'bg-emerald-950/30';
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              colorClass = 'text-red-400';
              bgClass = 'bg-red-950/30';
            } else if (line.startsWith('@@')) {
              colorClass = 'text-cyan-400 font-semibold';
              bgClass = 'bg-cyan-950/20';
            } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
              colorClass = 'text-slate-400 font-bold';
            }

            return (
              <div key={idx} className={`px-1.5 py-0.2 rounded-sm ${colorClass} ${bgClass}`}>
                {line || ' '}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
