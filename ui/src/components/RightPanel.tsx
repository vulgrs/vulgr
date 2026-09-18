import React, { useState } from 'react';
import {
  GitCompare,
  Globe,
  Plus,
  X,
  RotateCcw,
  Sparkles,
  Shield,
  Bot,
  Check,
  Send,
  Loader2,
  GitBranch,
  Terminal,
  ExternalLink,
  ChevronDown,
  CornerDownLeft,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer.js';
import type { SessionType } from '../types/warp.js';

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  diff: string;
  filesChanged: string[];
  gitBranch: string | null;
  sandboxes: any[];
  onRevert: () => void;
  onCommitAndPush: (message: string) => Promise<void> | void;
  onOpenTerminalInSandbox?: (worktreePath: string, branchName: string) => void;
  onSendDiffToAgent?: (type: SessionType) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  isOpen,
  onClose,
  diff,
  filesChanged,
  gitBranch,
  sandboxes,
  onRevert,
  onCommitAndPush,
  onOpenTerminalInSandbox,
  onSendDiffToAgent,
}) => {
  const [activeTab, setActiveTab] = useState<'changes' | 'sandbox'>('changes');
  const [commitMsg, setCommitMsg] = useState('');
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCommitPush = async () => {
    const msg = commitMsg.trim() || `fix: update ${filesChanged.slice(0, 2).join(', ')}`;
    setIsCommitting(true);
    try {
      await onCommitAndPush(msg);
      setCommitMsg('');
      setShowCommitInput(false);
      setCommitSuccess(true);
      setTimeout(() => setCommitSuccess(false), 2000);
    } catch {
      // error handled upstream
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="w-[460px] lg:w-[500px] h-full bg-[#050507] border-l border-zinc-800/80 flex flex-col select-none z-20 flex-shrink-0 animate-in slide-in-from-right-2 duration-150">
      {/* Top Tabs: Changes / Sandbox */}
      <div className="h-10 bg-[#000000] border-b border-zinc-900 flex items-center justify-between px-2 flex-shrink-0">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('changes')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
 activeTab === 'changes'
 ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-sm'
 : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
 }`}
          >
            <GitCompare size={13} className="text-zinc-400" />
            <span>Changes</span>
            {filesChanged.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300">
                {filesChanged.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
 activeTab === 'sandbox'
 ? 'bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-sm'
 : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
 }`}
          >
            <Globe size={13} className="text-zinc-400" />
            <span>Browser / Sandbox</span>
            {sandboxes.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                {sandboxes.length}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
          title="Close panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Sub-Header Toolbar (Matches Reference: Uncommitted +X | main ▾ | Commit & Push | ↶) */}
      {activeTab === 'changes' && (
        <div className="px-3.5 py-2.5 bg-zinc-950 border-b border-zinc-900 flex items-center justify-between flex-shrink-0 text-xs font-sans">
          <div className="flex items-center space-x-2">
            <span className="text-zinc-400 font-medium text-xs">
              Uncommitted {filesChanged.length > 0 ? `+${filesChanged.length}` : '0'}
            </span>

            {gitBranch && (
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-mono">
                <GitBranch size={11} className="text-zinc-400" />
                <span>{gitBranch}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={onRevert}
              disabled={filesChanged.length === 0}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="Revert working tree changes"
            >
              <RotateCcw size={13} />
            </button>

            {/* Commit & Push Primary Button (Exact button from screenshot) */}
            <button
              onClick={() => {
                if (showCommitInput) {
                  handleCommitPush();
                } else {
                  setShowCommitInput(true);
                }
              }}
              disabled={filesChanged.length === 0 || isCommitting}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isCommitting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : commitSuccess ? (
                <Check size={12} className="text-emerald-600" />
              ) : (
                <CornerDownLeft size={12} />
              )}
              <span>Commit & Push</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Commit Message Input Drawer */}
      {showCommitInput && (
        <div className="p-3 bg-zinc-950 border-b border-zinc-800/80 animate-in slide-in-from-top-1 duration-150 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              autoFocus
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitPush();
                if (e.key === 'Escape') setShowCommitInput(false);
              }}
              placeholder="Commit message (e.g. fix: update config)..."
              className="flex-1 bg-black border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600 font-sans"
            />
            <button
              onClick={handleCommitPush}
              disabled={isCommitting}
              className="px-2.5 py-1 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-semibold"
            >
              Commit
            </button>
            <button
              onClick={() => setShowCommitInput(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#000000]">
        {activeTab === 'changes' ? (
          <div>
            <DiffViewer diff={diff} onRevertFile={onRevert} />

            {/* Quick Cross-Model Review Pills */}
            {filesChanged.length > 0 && onSendDiffToAgent && (
              <div className="mt-4 pt-3 border-t border-zinc-900 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">
                  Send Diff to Agent:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onSendDiffToAgent('claude')}
                    className="flex items-center justify-center space-x-1 px-2 py-1.5 rounded-md bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-medium transition-all"
                  >
                    <Sparkles size={11} className="text-zinc-400" />
                    <span>Claude</span>
                  </button>
                  <button
                    onClick={() => onSendDiffToAgent('agy')}
                    className="flex items-center justify-center space-x-1 px-2 py-1.5 rounded-md bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-medium transition-all"
                  >
                    <Shield size={11} className="text-zinc-400" />
                    <span>AGY Engine</span>
                  </button>
                  <button
                    onClick={() => onSendDiffToAgent('codex')}
                    className="flex items-center justify-center space-x-1 px-2 py-1.5 rounded-md bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-medium transition-all"
                  >
                    <Bot size={11} className="text-zinc-400" />
                    <span>Codex</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Sandbox & Isolated Worktrees View */
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
              <span className="text-xs font-semibold text-zinc-200">
                Git Worktree Sandboxes
              </span>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Isolated directories where AI agents experiment without touching your working tree.
              </p>
            </div>

            {sandboxes.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-600">
                No active agent worktrees. Run an autonomous squad with sandbox isolation enabled.
              </div>
            ) : (
              sandboxes.map((sb) => (
                <div
                  key={sb.runId}
                  className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-zinc-300 font-semibold truncate max-w-[200px]">
                      {sb.branchName}
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                      Isolated
                    </span>
                  </div>

                  <div className="text-[10px] text-zinc-500 font-mono truncate">
                    {sb.worktreePath}
                  </div>

                  {onOpenTerminalInSandbox && (
                    <button
                      onClick={() => onOpenTerminalInSandbox(sb.worktreePath, sb.branchName)}
                      className="w-full flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition-all"
                    >
                      <Terminal size={12} />
                      <span>Open Shell in Worktree</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
