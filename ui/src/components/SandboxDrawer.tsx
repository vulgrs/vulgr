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
    <div className="fixed inset-y-0 right-0 w-[640px] bg-base-elevated border-l border-zinc-800 shadow-modal z-50 flex flex-col animate-slide-in-right select-none text-zinc-200">
      {/* Header */}
      <div className="h-14 px-5 bg-base-surface border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <GitBranch size={16} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-zinc-100 font-sans">
                Agent Worktree Sandbox Review
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {sandboxes.length} active
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              Review isolated agent edits before merging into your working copy
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

      {/* Sandbox Selector Tabs */}
      {sandboxes.length > 0 ? (
        <div className="px-5 py-2.5 bg-base-surface border-b border-zinc-900 flex items-center space-x-2 overflow-x-auto no-scrollbar">
          {sandboxes.map((s) => {
            const isSelected = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setMergeResult(null);
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
 isSelected
 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm'
 : 'bg-base-surface text-zinc-400 border border-zinc-900 hover:text-zinc-100 hover:bg-zinc-900'
 }`}
              >
                <GitBranch size={12} />
                <span className="truncate max-w-[160px]">{s.branchName}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-zinc-500 font-mono">
          No active agent sandboxes. Autonomous agents run in sandboxes automatically.
        </div>
      )}

      {/* Merge / Conflict Status Alert Banner */}
      {mergeResult && (
        <div
          className={`mx-5 my-3 p-3 rounded-md border text-xs font-mono flex items-center justify-between ${
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
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono bg-base-surface p-2.5 rounded-md border border-zinc-900">
            <div className="truncate">
              <span className="text-zinc-500">Path: </span>
              <span className="text-zinc-300">{selectedSandbox.worktreePath}</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-300">
              {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'} changed
            </span>
          </div>

          {/* Diff Viewer Container */}
          <div className="flex-1 min-h-0 bg-base-app rounded-md border border-zinc-800 overflow-hidden">
            {diff.trim().length > 0 ? (
              <DiffViewer diff={diff} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-zinc-500 font-mono">
                No uncommitted changes in this sandbox yet.
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onOpenTerminalInSandbox(selectedSandbox.worktreePath)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-200 border border-zinc-800 transition-all"
                title="Open interactive terminal session in this sandbox directory"
              >
                <Terminal size={13} className="text-zinc-400" />
                <span>Open Terminal Here</span>
              </button>

              <button
                onClick={handleDiscard}
                disabled={discarding}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-md bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-300 border border-red-500/25 transition-all disabled:opacity-50"
                title="Delete worktree and abandon agent changes"
              >
                <Trash2 size={13} />
                <span>{discarding ? 'Discarding...' : 'Discard'}</span>
              </button>
            </div>

            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all disabled:opacity-50"
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
