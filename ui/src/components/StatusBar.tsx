import React from 'react';
import { GitBranch, FolderGit2, Cpu, LayoutPanelLeft, Command } from 'lucide-react';
import type { DoctorStatus, TerminalSession } from '../types/warp.js';

interface StatusBarProps {
  cwd: string;
  gitBranch: string | null;
  isDirty: boolean;
  doctor: DoctorStatus | null;
  paneCount: number;
  activeSession: TerminalSession | null;
  sandboxCount?: number;
  onOpenSandbox?: () => void;
  onOpenPalette: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cwd,
  gitBranch,
  isDirty,
  doctor,
  paneCount,
  activeSession,
  sandboxCount = 0,
  onOpenSandbox,
  onOpenPalette,
}) => {
  const shortCwd = cwd ? cwd.split(/[\\/]/).slice(-2).join('/') : 'workspace';

  return (
    <div className="h-7 bg-[#07080c]/90 backdrop-blur-md border-t border-white/[0.06] flex items-center justify-between px-3 select-none flex-shrink-0 text-[11px] font-mono text-slate-400">
      <div className="flex items-center space-x-3 min-w-0">
        <span className="flex items-center space-x-1.5 text-slate-300" title={cwd}>
          <FolderGit2 size={12} className="text-cyan-400" />
          <span className="truncate max-w-[220px] font-medium">{shortCwd}</span>
        </span>

        {gitBranch && (
          <span
            className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-md border ${
              isDirty
                 ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
            title={isDirty ? 'Uncommitted changes' : 'Working tree clean'}
          >
            <GitBranch size={11} />
            <span className="font-semibold">{gitBranch}</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isDirty ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
          </span>
        )}

        {sandboxCount > 0 && onOpenSandbox && (
          <button
            onClick={onOpenSandbox}
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-all shadow-[0_0_10px_rgba(34,197,94,0.2)]"
            title="Inspect Isolated Agent Worktrees"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">🌱 Sandbox ({sandboxCount})</span>
          </button>
        )}

        <span className="flex items-center space-x-1.5 text-slate-400">
          <LayoutPanelLeft size={11} className="text-slate-500" />
          <span>
            {paneCount} pane{paneCount === 1 ? '' : 's'}
          </span>
        </span>

        {activeSession && (
          <span className="text-slate-400 truncate max-w-[180px]">
            <span className="text-slate-600 mr-1">•</span>
            {activeSession.title}
          </span>
        )}
      </div>

      <div className="flex items-center space-x-3 flex-shrink-0">
        {doctor && (
          <span className="flex items-center space-x-1.5 text-slate-400" title="Node.js version">
            <Cpu size={11} className="text-cyan-400" />
            <span>{doctor.node.version}</span>
          </span>
        )}

        <button
          onClick={onOpenPalette}
          className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] hover:text-white border border-white/[0.08] transition-all text-slate-300"
          title="Open Command Palette (Ctrl+Shift+P)"
        >
          <Command size={11} className="text-cyan-400" />
          <span>^⇧P</span>
        </button>
      </div>
    </div>
  );
};
