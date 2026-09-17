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
  Settings,
  FileDown,
  ChevronDown,
  Search,
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
  onOpenSkillsModal: () => void;
  onOpenSettings: () => void;
  onOpenExportReport: () => void;
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
  onOpenSkillsModal,
  onOpenSettings,
  onOpenExportReport,
  doctor,
  hasUncommittedDiff,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
}) => {
  const [agentMenuOpen, setAgentMenuOpen] = React.useState(false);
  const [aiMenuOpen, setAiMenuOpen] = React.useState(false);

  // Close dropdowns on outside click or escape
  React.useEffect(() => {
    const handleGlobalClick = () => {
      setAgentMenuOpen(false);
      setAiMenuOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  return (
    <div className="h-11 bg-[#090a0f]/95 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-3 select-none flex-shrink-0 z-30">
      {/* Left: App Brand & Tab Strip */}
      <div className="flex items-center space-x-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all"
          title="Toggle Sidebar"
        >
          {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
        </button>

        {/* Brand Icon & Name */}
        <div className="flex items-center space-x-1.5 mr-2 pl-0.5">
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-[11px] text-black shadow-[0_0_10px_rgba(0,216,255,0.3)]">
            <Zap size={11} className="text-black fill-current" />
          </div>
          <span className="font-bold text-xs text-slate-100 tracking-wider font-sans">
            DEXTER
          </span>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white/[0.08] text-white font-medium border border-white/[0.12] shadow-sm'
                    : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <Terminal size={11} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
                <span className="max-w-[110px] truncate text-[11px]">{tab.title}</span>

                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 hover:bg-white/[0.08] transition-opacity"
                  >
                    <X size={10} />
                  </button>
                )}

                {isActive && (
                  <div className="absolute bottom-0 left-1.5 right-1.5 h-[1.5px] bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full" />
                )}
              </div>
            );
          })}

          <button
            onClick={onAddTab}
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all"
            title="New Tab (Ctrl+Shift+T)"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Center: Sleek Command Search Omnibar */}
      <button
        onClick={onOpenPalette}
        className="hidden md:flex items-center space-x-2 px-3 py-1 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] text-xs text-slate-400 hover:text-slate-200 transition-all w-64 max-w-xs justify-between"
        title="Search commands, files, or ask AI (#) (Ctrl+Shift+P)"
      >
        <div className="flex items-center space-x-2">
          <Search size={11} className="text-cyan-400" />
          <span className="text-[11px]">Search or ask AI (#)...</span>
        </div>
        <kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.07] text-[9px] font-mono text-slate-400">
          ^⇧P
        </kbd>
      </button>

      {/* Right: Consolidated Controls */}
      <div className="flex items-center space-x-1.5">
        {/* + Pane / Agent Dropdown */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setAgentMenuOpen(!agentMenuOpen);
              setAiMenuOpen(false);
            }}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              agentMenuOpen
                ? 'bg-white/[0.1] border-white/[0.2] text-white'
                : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] text-slate-300 hover:text-white'
            }`}
            title="Add Terminal Pane or AI Agent"
          >
            <Plus size={11} className="text-cyan-400" />
            <span>Pane</span>
            <ChevronDown size={10} className="text-slate-400" />
          </button>

          {agentMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-[#0c0e17] border border-white/[0.1] shadow-2xl p-1 z-50 text-xs font-sans animate-in fade-in">
              <button
                onClick={() => {
                  onLaunchAgent('shell');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.08] text-left transition-colors"
              >
                <Terminal size={12} className="text-slate-400" />
                <span>Interactive Shell</span>
              </button>
              <button
                onClick={() => {
                  onLaunchAgent('claude');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-purple-500/15 text-left transition-colors"
              >
                <Sparkles size={12} className="text-purple-400" />
                <span>Claude Code</span>
              </button>
              <button
                onClick={() => {
                  onLaunchAgent('agy');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-cyan-200 hover:text-white hover:bg-cyan-500/15 text-left transition-colors"
              >
                <Shield size={12} className="text-cyan-400" />
                <span>AGY Engine</span>
              </button>
              <button
                onClick={() => {
                  onLaunchAgent('codex');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-500/15 text-left transition-colors"
              >
                <Bot size={12} className="text-emerald-400" />
                <span>Codex CLI</span>
              </button>
            </div>
          )}
        </div>

        {/* Autonomous AI Modes Dropdown */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setAiMenuOpen(!aiMenuOpen);
              setAgentMenuOpen(false);
            }}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              aiMenuOpen
                ? 'bg-purple-500/25 border-purple-500/50 text-purple-200'
                : 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/25 text-purple-300'
            }`}
            title="Autonomous Squads & Skills"
          >
            <Sparkles size={11} className="text-cyan-400" />
            <span>AI Squad</span>
            <ChevronDown size={10} className="text-purple-300" />
          </button>

          {aiMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-[#0c0e17] border border-white/[0.1] shadow-2xl p-1.5 z-50 text-xs font-sans animate-in fade-in">
              <button
                onClick={() => {
                  onOpenSquadModal();
                  setAiMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-cyan-200 hover:text-white hover:bg-cyan-500/15 text-left transition-colors"
              >
                <Users size={13} className="text-cyan-400" />
                <div>
                  <div className="font-medium">Live 2-Way Squad</div>
                  <div className="text-[10px] text-slate-400">Claude ⇄ AGY Split view</div>
                </div>
              </button>
              <button
                onClick={() => {
                  onOpenMeshModal();
                  setAiMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-purple-200 hover:text-white hover:bg-purple-500/15 text-left transition-colors"
              >
                <Zap size={13} className="text-purple-400" />
                <div>
                  <div className="font-medium">Autonomous Agent Mesh</div>
                  <div className="text-[10px] text-slate-400">Verification & self-correction</div>
                </div>
              </button>
              <div className="h-px bg-white/[0.08] my-1" />
              <button
                onClick={() => {
                  onOpenSkillsModal();
                  setAiMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-amber-200 hover:text-white hover:bg-amber-500/15 text-left transition-colors"
              >
                <Zap size={13} className="text-amber-400 fill-current" />
                <div>
                  <div className="font-medium">Shared Skills & Memory</div>
                  <div className="text-[10px] text-slate-400">Universal workflows</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Git Diff Pill */}
        <button
          onClick={onToggleDiff}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
            hasUncommittedDiff
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-slate-200'
          }`}
          title="Inspect Git Diff & Review (Ctrl+Shift+G)"
        >
          <GitCompare size={12} className={hasUncommittedDiff ? 'text-amber-400' : 'text-slate-400'} />
          <span>Diff</span>
          {hasUncommittedDiff && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Technical Report Export Button */}
        <button
          onClick={onOpenExportReport}
          className="p-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 hover:text-white hover:border-white/[0.12] transition-all"
          title="Export Technical Report (Ctrl+Shift+X)"
        >
          <FileDown size={13} />
        </button>

        {/* Settings Modal Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 hover:text-white hover:border-white/[0.12] transition-all"
          title="CLI Permissions & Settings (Ctrl+,)"
        >
          <Settings size={13} />
        </button>

        {/* Doctor Status Dot */}
        {doctor && (
          <div
            className="flex items-center justify-center p-1.5 text-slate-400"
            title={`System Ready (Node ${doctor.node.version})`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
          </div>
        )}
      </div>
    </div>
  );
};
