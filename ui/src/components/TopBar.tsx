import React from 'react';
import {
  Plus,
  Terminal,
  Sparkles,
  Shield,
  Bot,
  GitCompare,
  X,
  Command,
  PanelLeft,
  PanelLeftClose,
  Zap,
  Users,
} from 'lucide-react';
import type { WorkspaceTab, DoctorStatus, SessionType } from '../types/warp.js';

interface TopBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onLaunchAgent: (type: SessionType) => void;
  onToggleDiff: () => void;
  onOpenMeshModal: () => void;
  onOpenSquadModal: () => void;
  doctor: DoctorStatus | null;
  hasUncommittedDiff: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onLaunchAgent,
  onToggleDiff,
  onOpenMeshModal,
  onOpenSquadModal,
  doctor,
  hasUncommittedDiff,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
}) => {
  return (
    <div className="h-12 bg-[#090a0f]/90 backdrop-blur-xl border-b border-white/[0.07] flex items-center justify-between px-3 select-none flex-shrink-0 z-30">
      {/* Left: App Brand & Tab Strip */}
      <div className="flex items-center space-x-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all"
          title="Toggle Sidebar"
        >
          {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
        </button>

        {/* Brand Icon & Name */}
        <div className="flex items-center space-x-2 mr-3 pl-1">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-black shadow-[0_0_12px_rgba(0,216,255,0.3)]">
            <Zap size={13} className="text-black fill-current" />
          </div>
          <span className="font-bold text-xs text-slate-100 tracking-wider font-sans">
            WARP <span className="text-cyan-400 font-medium">ORCHESTRATOR</span>
          </span>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white/[0.08] text-white font-medium border border-white/[0.12] shadow-sm'
                    : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <Terminal size={12} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                <span className="max-w-[120px] truncate">{tab.title}</span>

                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 hover:bg-white/[0.08] transition-opacity"
                  >
                    <X size={11} />
                  </button>
                )}

                {isActive && (
                  <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full" />
                )}
              </div>
            );
          })}

          <button
            onClick={onAddTab}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all"
            title="New Tab"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Right: Actions, Launchers & System Info */}
      <div className="flex items-center space-x-2">
        {/* Agent Quick Launchers */}
        <div className="flex items-center space-x-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <button
            onClick={() => onLaunchAgent('shell')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all"
            title="Launch Interactive Shell"
          >
            <Terminal size={12} className="text-slate-400" />
            <span>Shell</span>
          </button>

          <button
            onClick={() => onLaunchAgent('claude')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 hover:border-purple-500/40 transition-all shadow-sm"
            title="Launch Claude Code"
          >
            <Sparkles size={12} className="text-purple-400" />
            <span>Claude</span>
          </button>

          <button
            onClick={() => onLaunchAgent('agy')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 hover:border-cyan-500/40 transition-all shadow-sm"
            title="Launch Google AGY Engine"
          >
            <Shield size={12} className="text-cyan-400" />
            <span>AGY</span>
          </button>

          <button
            onClick={() => onLaunchAgent('codex')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/40 transition-all shadow-sm"
            title="Launch Codex CLI"
          >
            <Bot size={12} className="text-emerald-400" />
            <span>Codex</span>
          </button>
        </div>

        {/* Live Squad Trigger */}
        <button
          onClick={onOpenSquadModal}
          className="relative group flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-200 text-xs font-semibold shadow-[0_0_12px_rgba(0,216,255,0.2)] transition-all hover:scale-[1.02] active:scale-[0.98]"
          title="Launch Live 2-Way Split Autonomous Squad (Claude + AGY)"
        >
          <Users size={12} className="text-cyan-400" />
          <span>👥 Live Squad</span>
        </button>

        {/* Autonomous Mesh Trigger */}
        <button
          onClick={onOpenMeshModal}
          className="relative group flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:via-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-[0_0_16px_rgba(168,85,247,0.35)] transition-all hover:scale-[1.02] active:scale-[0.98]"
          title="Launch Autonomous Multi-CLI Agent Mesh"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-ping" />
          <span>⚡ Autonomous Mesh</span>
        </button>

        {/* Command Palette Button */}
        <button
          onClick={onOpenPalette}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:text-white hover:border-white/[0.15] text-xs font-medium transition-all"
          title="Command Palette (Ctrl+Shift+P)"
        >
          <Command size={12} className="text-cyan-400" />
          <span className="text-[10px] font-mono text-slate-400">^⇧P</span>
        </button>

        {/* Git Diff Inspector Pill */}
        <button
          onClick={onToggleDiff}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
            hasUncommittedDiff
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
              : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/[0.14]'
          }`}
          title="Inspect Git Diff & Review"
        >
          <GitCompare size={13} className={hasUncommittedDiff ? 'text-amber-400' : 'text-slate-400'} />
          <span>Diff</span>
          {hasUncommittedDiff && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Doctor Status Badge */}
        {doctor && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
            <span className="text-slate-400">Ready</span>
          </div>
        )}
      </div>
    </div>
  );
};
