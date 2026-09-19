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
    <div className="fixed inset-y-0 right-0 w-[600px] bg-base-elevated border-l border-zinc-800 shadow-modal z-50 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="h-14 px-5 bg-base-surface border-b border-zinc-800 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-accent">
            <GitCompare size={16} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-zinc-100 font-sans">
                Working Tree Diff & Cross-Check
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
                {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              Inspect uncommitted changes & run adversarial audits
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="modal-close-btn p-1.5"
        >
          <X size={16} />
        </button>
      </div>

      {/* Files List */}
      {filesChanged.length > 0 && (
        <div className="px-5 py-2.5 border-b border-zinc-900 bg-base-app flex items-center space-x-2 overflow-x-auto text-xs font-mono text-zinc-300">
          <FileCode size={13} className="text-zinc-400 flex-shrink-0" />
          {filesChanged.map((f, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] whitespace-nowrap text-zinc-300"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Diff Content */}
      <div className="flex-1 overflow-y-auto p-4 select-text bg-base-app">
        <DiffViewer diff={diff} />
      </div>

      {/* Footer / Cross-Model Actions */}
      <div className="p-4 bg-base-surface border-t border-zinc-800 space-y-3 select-none">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-sans">
            Cross-Model Adversarial Audit:
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">Pipes diff to target CLI</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onSendDiffToAgent('claude')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
          >
            <Sparkles size={13} className="text-zinc-400" />
            <span>Audit Claude</span>
          </button>

          <button
            onClick={() => onSendDiffToAgent('agy')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
          >
            <Shield size={13} className="text-zinc-400" />
            <span>Audit AGY</span>
          </button>

          <button
            onClick={() => onSendDiffToAgent('codex')}
            className="flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-200 text-xs font-semibold transition-all"
          >
            <Bot size={13} className="text-emerald-400" />
            <span>Audit Codex</span>
          </button>
        </div>

        <button
          onClick={onRevert}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-semibold transition-all"
        >
          <RotateCcw size={13} />
          <span>Discard & Rollback Changes (git reset --hard)</span>
        </button>
      </div>
    </div>
  );
};
