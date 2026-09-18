import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  GitMerge,
  Trash2,
  Terminal,
  Check,
  AlertTriangle,
  FileCode,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer.js';
import type { SandboxSession, SandboxMergeResult } from '../types/warp.js';

interface SandboxDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerminalInSandbox: (worktreePath: string) => void;
  onRefreshDiff?: () => void;
}

export const SandboxDrawer: React.FC<SandboxDrawerProps> = ({
  isOpen,
  onClose,
  onOpenTerminalInSandbox,
  onRefreshDiff,
}) => {
  const [sandboxes, setSandboxes] = useState<SandboxSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [filesChanged, setFilesChanged] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<SandboxMergeResult | null>(null);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadSandboxes();
  }, [isOpen]);

  const loadSandboxes = async () => {
    if (window.warpApi?.listSandboxes) {
      try {
        const list = await window.warpApi.listSandboxes();
        setSandboxes(list);
        if (list.length > 0) {
          if (!selectedId || !list.some((s: SandboxSession) => s.id === selectedId)) {
            setSelectedId(list[0].id);
          }
        } else {
          setSelectedId(null);
          setDiff('');
          setFilesChanged([]);
        }
      } catch (err) {
        console.error('Failed to load sandboxes:', err);
      }
    }
  };

  const selectedSandbox = sandboxes.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    if (!selectedSandbox) {
      setDiff('');
      setFilesChanged([]);
      return;
    }

    loadDiff(selectedSandbox.worktreePath);
  }, [selectedSandbox?.id]);

  const loadDiff = async (worktreePath: string) => {
    if (window.warpApi?.getSandboxDiff) {
      try {
        const res = await window.warpApi.getSandboxDiff(worktreePath);
        setDiff(res.diff || '');
        setFilesChanged(res.filesChanged || []);
      } catch (err) {
        console.error('Failed to get sandbox diff:', err);
      }
    }
  };

  const handleMerge = async () => {
    if (!selectedSandbox || !window.warpApi?.mergeSandbox) return;
    setMerging(true);
    setMergeResult(null);

    try {
      const res: SandboxMergeResult = await window.warpApi.mergeSandbox({
        worktreePath: selectedSandbox.worktreePath,
        branchName: selectedSandbox.branchName,
      });

      setMergeResult(res);
      if (res.success) {
        onRefreshDiff?.();
        setTimeout(async () => {
          await loadSandboxes();
        }, 1500);
      }
    } catch (err: any) {
      setMergeResult({
        success: false,
        error: err.message || 'Merge failed',
      });
    } finally {
      setMerging(false);
    }
  };

  const handleDiscard = async () => {
    if (!selectedSandbox || !window.warpApi?.destroySandbox) return;
    setDiscarding(true);

    try {
      await window.warpApi.destroySandbox({
        worktreePath: selectedSandbox.worktreePath,
        branchName: selectedSandbox.branchName,
        force: true,
      });
      await loadSandboxes();
    } catch (err) {
      console.error('Failed to discard sandbox:', err);
    } finally {
      setDiscarding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[640px] bg-[#0b0d14]/95 border-l border-white/[0.1] shadow-[-20px_0_50px_rgba(0,0,0,0.8)] z-50 flex flex-col animate-in slide-in-from-right duration-200 select-none text-slate-200">
      {/* Header */}
      <div className="h-14 px-5 bg-white/[0.03] border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
            <GitBranch size={16} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-100 font-sans">
                Agent Worktree Sandbox Review
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {sandboxes.length} active
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Review isolated agent edits before merging into your working copy
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

      {/* Sandbox Selector Tabs */}
      {sandboxes.length > 0 ? (
        <div className="px-5 py-2.5 bg-white/[0.01] border-b border-white/[0.06] flex items-center space-x-2 overflow-x-auto no-scrollbar">
          {sandboxes.map((s) => {
            const isSelected = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setMergeResult(null);
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-mono transition-all ${
 isSelected
 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm'
 : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.06]'
 }`}
              >
                <GitBranch size={12} />
                <span className="truncate max-w-[160px]">{s.branchName}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-slate-500 font-mono">
          No active agent sandboxes. Autonomous agents run in sandboxes automatically.
        </div>
      )}

      {/* Merge / Conflict Status Alert Banner */}
      {mergeResult && (
        <div
          className={`mx-5 my-3 p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
 mergeResult.success
 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
 : 'bg-red-500/10 border-red-500/30 text-red-300'
 }`}
        >
          <div className="flex items-center space-x-2">
            {mergeResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
            <span>
              {mergeResult.success
                ? `Merged cleanly into working branch! (${mergeResult.mergedCommit?.substring(0, 7)})`
                : mergeResult.conflict
                ? `Merge conflict in: ${mergeResult.conflictFiles?.join(', ')}`
                : mergeResult.error || 'Merge failed'}
            </span>
          </div>
        </div>
      )}

      {/* Diff & Files Changed Area */}
      {selectedSandbox && (
        <div className="flex-1 min-h-0 flex flex-col p-5 space-y-3">
          {/* Metadata pill */}
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
            <div className="truncate">
              <span className="text-slate-500">Path: </span>
              <span className="text-slate-300">{selectedSandbox.worktreePath}</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-300">
              {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'} changed
            </span>
          </div>

          {/* Diff Viewer Container */}
          <div className="flex-1 min-h-0 bg-black/40 rounded-xl border border-white/[0.08] overflow-hidden">
            {diff.trim().length > 0 ? (
              <DiffViewer diff={diff} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                No uncommitted changes in this sandbox yet.
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="pt-2 flex items-center justify-between border-t border-white/[0.08]">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onOpenTerminalInSandbox(selectedSandbox.worktreePath)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-slate-200 border border-white/[0.08] transition-all"
                title="Open interactive terminal session in this sandbox directory"
              >
                <Terminal size={13} className="text-zinc-400" />
                <span>Open Terminal Here</span>
              </button>

              <button
                onClick={handleDiscard}
                disabled={discarding}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-300 border border-red-500/25 transition-all disabled:opacity-50"
                title="Delete worktree and abandon agent changes"
              >
                <Trash2 size={13} />
                <span>{discarding ? 'Discarding...' : 'Discard'}</span>
              </button>
            </div>

            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-semibold text-xs shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <GitMerge size={14} className="fill-current" />
              <span>{merging ? 'Merging...' : 'Merge into Active Branch'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
