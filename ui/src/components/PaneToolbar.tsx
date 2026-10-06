import React from 'react';
import { Columns2, Rows2 } from 'lucide-react';
import type { WorkspaceTab } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface PaneToolbarProps {
  tab: WorkspaceTab;
  /** 'h' adds a pane to the right (side by side), 'v' adds one below (stacked). */
  onSplit: (direction: 'h' | 'v') => void;
}

/** Slim bar over the terminal area: the open terminal's name and the split controls. */
export const PaneToolbar: React.FC<PaneToolbarProps> = ({ tab, onSplit }) => {
  const { t } = useI18n();
  const panes = tab.sessions.length;

  const button = (direction: 'h' | 'v', active: boolean, icon: React.ReactNode, label: string, hint: string) => (
    <button
      onClick={() => onSplit(direction)}
      title={hint}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
        active ? 'text-zinc-100 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900'
      }`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );

  return (
    <div className="h-8 flex-shrink-0 flex items-center justify-between gap-3 px-3 border-b border-zinc-900 bg-base-app select-none">
      <div className="flex items-center gap-2 min-w-0 text-[12px]">
        <span className={`truncate ${tab.title ? 'text-zinc-300' : 'text-zinc-500 italic'}`}>
          {tab.title || t.sidebar.untitled}
        </span>
        {panes > 1 && <span className="text-[10px] text-zinc-600 flex-shrink-0">{t.sidebar.panes(panes)}</span>}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {button('h', panes > 1 && tab.layout === 'split-h', <Columns2 size={13} />, t.workspace.splitRight, t.workspace.splitRightHint)}
        {button('v', panes > 1 && tab.layout === 'split-v', <Rows2 size={13} />, t.workspace.splitDown, t.workspace.splitDownHint)}
      </div>
    </div>
  );
};
