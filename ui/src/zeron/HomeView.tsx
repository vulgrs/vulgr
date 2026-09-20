import React from 'react';
import { Monitor, ChevronDown, GitBranch, FolderGit2 } from 'lucide-react';
import { Composer } from './Composer.js';
import { ProjectMenu } from './ProjectMenu.js';
import type { EffortLevel, ImageAttachment, ModelOption } from './types.js';

interface HomeViewProps {
  host: string;
  repo: string;
  branch: string;
  cwd: string;
  recentProjects: string[];
  onOpenFolder: () => void;
  onSelectProject: (path: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  model: ModelOption;
  effort: EffortLevel;
  onSelectModel: (m: ModelOption) => void;
  onSelectEffort: (e: EffortLevel) => void;
  attachments: ImageAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = (props) => {
  const { host, repo, branch, cwd, recentProjects, onOpenFolder, onSelectProject } = props;

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[640px] -mt-16">
        {/* Host + repo selectors above the box, right-aligned */}
        <div className="flex items-center justify-end gap-4 mb-2 pr-1">
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-400">
            <Monitor size={13} className="text-zinc-500" />
            <span>{host}</span>
            <ChevronDown size={12} className="text-zinc-600" />
          </div>
          <ProjectMenu
            repo={repo}
            cwd={cwd}
            recentProjects={recentProjects}
            onOpenFolder={onOpenFolder}
            onSelectProject={onSelectProject}
          />
        </div>

        <Composer
          value={props.input}
          onChange={props.onInputChange}
          onSubmit={props.onSubmit}
          model={props.model}
          effort={props.effort}
          onSelectModel={props.onSelectModel}
          onSelectEffort={props.onSelectEffort}
          attachments={props.attachments}
          onAddFiles={props.onAddFiles}
          onRemoveAttachment={props.onRemoveAttachment}
          autoFocus
        />

        {/* Checkout + branch selectors below the box, left-aligned */}
        <div className="flex items-center gap-4 mt-2 pl-1">
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-400">
            <FolderGit2 size={13} className="text-zinc-500" />
            <span>Current checkout</span>
            <ChevronDown size={12} className="text-zinc-600" />
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-400">
            <GitBranch size={13} className="text-zinc-500" />
            <span>{branch}</span>
            <ChevronDown size={12} className="text-zinc-600" />
          </div>
        </div>
      </div>
    </div>
  );
};
