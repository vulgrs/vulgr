import React, { useState } from 'react';
import { Folder, ChevronDown, Check, FolderOpen } from 'lucide-react';

interface ProjectMenuProps {
  repo: string;
  cwd: string;
  recentProjects: string[];
  onOpenFolder: () => void;
  onSelectProject: (path: string) => void;
  dropUp?: boolean;
}

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

export const ProjectMenu: React.FC<ProjectMenuProps> = ({
  repo,
  cwd,
  recentProjects,
  onOpenFolder,
  onSelectProject,
  dropUp = false,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors"
        title={cwd}
      >
        <Folder size={13} className="text-zinc-500" />
        <span>{repo}</span>
        <ChevronDown size={12} className="text-zinc-600" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 right-0 w-72 rounded-xl border border-white/10 bg-[#141416] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] p-1.5 ${
              dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                onOpenFolder();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
            >
              <FolderOpen size={14} className="text-zinc-400" />
              Open folder…
            </button>

            {recentProjects.length > 0 && (
              <>
                <div className="h-px bg-white/[0.06] my-1.5" />
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Recent
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {recentProjects.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onSelectProject(p);
                        setOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left hover:bg-white/[0.06] transition-colors group"
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-zinc-200 truncate">
                          {baseName(p)}
                        </span>
                        <span className="block text-[10px] text-zinc-600 truncate">{p}</span>
                      </span>
                      {p === cwd && <Check size={13} className="text-emerald-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
