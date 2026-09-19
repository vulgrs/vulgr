import React, { useEffect, useState } from 'react';
import {
  Search,
  PanelLeft,
  PanelLeftClose,
  Sliders,
  LayoutGrid,
  GitCompare,
  FileDown,
  Settings,
  Zap,
  User,
  Minus,
  Square,
  Copy,
  X,
} from 'lucide-react';
import type { DoctorStatus } from '../types/warp.js';

interface TopBarProps {
  onToggleDiff: () => void;
  onOpenMeshModal: () => void;
  onOpenSquadModal: () => void;
  onOpenSkillsModal: () => void;
  onOpenSettings: () => void;
  onOpenExportReport: () => void;
  doctor: DoctorStatus | null;
  hasUncommittedDiff: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
}

const noDrag: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export const TopBar: React.FC<TopBarProps> = ({
  onToggleDiff,
  onOpenMeshModal,
  onOpenSquadModal,
  onOpenSkillsModal,
  onOpenSettings,
  onOpenExportReport,
  doctor,
  hasUncommittedDiff,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const hasWindowControls = typeof window !== 'undefined' && !!window.warpApi?.windowMinimize;

  useEffect(() => {
    if (!window.warpApi?.windowIsMaximized) return;
    window.warpApi.windowIsMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = window.warpApi.onWindowMaximizedChanged?.(setIsMaximized);
    return () => unsubscribe?.();
  }, []);

  return (
    <div
      className="h-9 bg-base-app border-b border-zinc-900 flex items-center justify-between px-2 select-none flex-shrink-0 z-30"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: Brand & Utility Icons */}
      <div className="flex items-center gap-1 min-w-0" style={noDrag}>
        <div className="flex items-center gap-1.5 pl-1 pr-2 flex-shrink-0">
          <img src="./logo.png" alt="Dexter" className="w-5 h-5 object-contain" draggable={false} />
          <span className="text-[11px] font-semibold text-zinc-300 truncate max-w-[220px]">
            Dexter <span className="text-zinc-600 font-normal">– Autonomous AI Terminal Orchestrator</span>
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-850 mx-0.5 flex-shrink-0" />

        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors flex-shrink-0"
          title="Toggle Sidebar (Ctrl+Shift+B)"
        >
          {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
        </button>
        <button
          onClick={onOpenSkillsModal}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors flex-shrink-0"
          title="Customize: Shared Skills & Memory (Ctrl+Shift+K)"
        >
          <Sliders size={13} />
        </button>
        <button
          onClick={onOpenSquadModal}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors flex-shrink-0"
          title="Automations: Live Squads"
        >
          <LayoutGrid size={13} />
        </button>
      </div>

      {/* Center: Search Omnibar */}
      <button
        onClick={onOpenPalette}
        className="flex items-center space-x-2 px-3 py-1 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-all w-full max-w-md justify-between shadow-inner mx-3"
        title="Search sessions, agents, files (Ctrl+Shift+P)"
        style={noDrag}
      >
        <div className="flex items-center space-x-2">
          <Search size={11} className="text-zinc-400" />
          <span className="text-[11px] text-zinc-400">Search sessions, agents, files...</span>
        </div>
        <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-400">
          ^⇧P
        </kbd>
      </button>

      {/* Right: Icon Cluster, Avatar & Window Controls */}
      <div className="flex items-center flex-shrink-0" style={noDrag}>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggleDiff}
            className="relative p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            title="Inspect Git Diff & Review (Ctrl+Shift+G)"
          >
            <GitCompare size={13} className={hasUncommittedDiff ? 'text-accent' : ''} />
            {hasUncommittedDiff && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>

          <button
            onClick={onOpenExportReport}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            title="Export Technical Report (Ctrl+Shift+X)"
          >
            <FileDown size={13} />
          </button>

          <button
            onClick={onOpenMeshModal}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            title="Autonomous Agent Mesh"
          >
            <Zap size={13} />
          </button>

          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            title="Settings (Ctrl+,)"
          >
            <Settings size={13} />
          </button>

          <div
            className="ml-1 relative w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300"
            title={doctor ? `System Ready (Node ${doctor.node.version})` : 'System'}
          >
            <User size={11} />
            {doctor && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-base-app" />
            )}
          </div>
        </div>

        {/* Custom Frameless Window Controls */}
        {hasWindowControls && (
          <div className="flex items-center ml-2 -mr-2 h-9">
            <button
              onClick={() => window.warpApi.windowMinimize()}
              className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
              title="Minimize"
            >
              <Minus size={13} />
            </button>
            <button
              onClick={() => window.warpApi.windowMaximizeToggle()}
              className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Copy size={11} className="rotate-90" /> : <Square size={11} />}
            </button>
            <button
              onClick={() => window.warpApi.windowClose()}
              className="w-10 h-9 flex items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
