import React from 'react';
import {
  X,
  RotateCcw,
  Sparkles,
  Shield,
  Bot,
  GitCompare,
  FileCode,
  AlertOctagon,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer.js';
import type { SessionType } from '../types/warp.js';

interface DiffDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  diff: string;
  filesChanged: string[];
  onRevert: () => void;
  onSendDiffToAgent: (type: SessionType) => void;
}

export const DiffDrawer: React.FC<DiffDrawerProps> = ({
  isOpen,
  onClose,
  diff,
  filesChanged,
  onRevert,
  onSendDiffToAgent,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-[#0b0d14]/95 border-l border-white/[0.1] shadow-[-20px_0_50px_rgba(0,0,0,0.8)] z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="h-14 px-5 bg-white/[0.03] border-b border-white/[0.08] flex items-center justify-between select-none">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-zinc-500/10 border border-zinc-500/30 text-zinc-400 shadow-[0_0_10px_rgba(0,216,255,0.2)]">
            <GitCompare size={16} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-100 font-sans">
                Working Tree Diff & Cross-Check
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-slate-300">
                {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Inspect uncommitted changes & run adversarial audits
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Files List */}
      {filesChanged.length > 0 && (
        <div className="px-5 py-2.5 border-b border-white/[0.06] bg-[#07080c]/60 flex items-center space-x-2 overflow-x-auto text-xs font-mono text-slate-300">
          <FileCode size={13} className="text-zinc-400 flex-shrink-0" />
          {filesChanged.map((f, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] whitespace-nowrap text-slate-300"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Diff Content */}
      <div className="flex-1 overflow-y-auto p-4 select-text bg-[#07080c]/40">
        <DiffViewer diff={diff} />
      </div>

      {/* Footer / Cross-Model Actions */}
      <div className="p-4 bg-white/[0.02] border-t border-white/[0.08] space-y-3 select-none">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-sans">
            Cross-Model Adversarial Audit:
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Pipes diff to target CLI</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onSendDiffToAgent('claude')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/30 hover:border-zinc-500/50 text-zinc-200 text-xs font-semibold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles size={13} className="text-zinc-400" />
            <span>Audit Claude</span>
          </button>

          <button
            onClick={() => onSendDiffToAgent('agy')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/30 hover:border-zinc-500/50 text-zinc-200 text-xs font-semibold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            <Shield size={13} className="text-zinc-400" />
            <span>Audit AGY</span>
          </button>

          <button
            onClick={() => onSendDiffToAgent('codex')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-200 text-xs font-semibold transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            <Bot size={13} className="text-emerald-400" />
            <span>Audit Codex</span>
          </button>
        </div>

        <button
          onClick={onRevert}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-semibold transition-all shadow-sm"
        >
          <RotateCcw size={13} />
          <span>Discard & Rollback Changes (git reset --hard)</span>
        </button>
      </div>
    </div>
  );
};
