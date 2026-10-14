import React from 'react';
import { GitBranch, FolderGit2, Cpu, LayoutPanelLeft, Command } from 'lucide-react';
import type { DoctorStatus, TerminalSession } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';
import { BranchMenu } from './BranchMenu.js';

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
  /** After the branch menu switched or created a branch. */
  onBranchSwitched?: () => void;
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
  onBranchSwitched,
}) => {
  const { t } = useI18n();
  const shortCwd = cwd ? cwd.split(/[\\/]/).slice(-2).join('/') : 'workspace';

  return (
    <div className="h-6 bg-base-app border-t border-zinc-900 flex items-center justify-between px-3 select-none flex-shrink-0 text-[10px] font-mono text-zinc-500">
      <div className="flex items-center space-x-3 min-w-0">
        <span className="flex items-center space-x-1.5 text-zinc-400 hover:text-zinc-200 transition-colors" title={cwd}>
          <FolderGit2 size={11} className="text-zinc-400" />
          <span className="truncate max-w-[220px] font-medium">{shortCwd}</span>
        </span>

        {gitBranch && (
          <BranchMenu
            cwd={cwd || undefined}
            branch={gitBranch}
            isDirty={isDirty}
            title={isDirty ? t.workspace.branchDirty(gitBranch) : t.workspace.branchClean(gitBranch)}
            onSwitched={() => onBranchSwitched?.()}
          />
        )}

        {sandboxCount > 0 && onOpenSandbox && (
          <button
            onClick={onOpenSandbox}
            className="flex items-center space-x-1 px-1.5 py-0.2 rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition-all text-[9px]"
            title={t.workspace.sandboxesHint}
          >
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="font-semibold">Sandbox ({sandboxCount})</span>
          </button>
        )}

        <span
          className="flex items-center space-x-1 text-zinc-500"
          title={t.workspace.panesHint}
        >
          <LayoutPanelLeft size={10} />
          <span>
            {t.workspace.paneCount(paneCount)}
          </span>
        </span>

        {activeSession && (
          <span className="text-zinc-400 truncate max-w-[200px]" title={t.workspace.activeHint}>
            <span className="text-zinc-700 mr-1">•</span>
            {t.workspace.active(activeSession.title)}
          </span>
        )}
      </div>

      <div className="flex items-center space-x-3 flex-shrink-0 text-zinc-500">
        {doctor && (
          <span className="flex items-center space-x-1" title={t.workspace.nodeHint}>
            <Cpu size={10} className="text-zinc-500" />
            <span>{doctor.node.version}</span>
          </span>
        )}
      </div>
    </div>
  );
};
