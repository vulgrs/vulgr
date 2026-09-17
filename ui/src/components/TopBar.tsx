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
    <div className="h-10 bg-[#000000] border-b border-zinc-800/80 flex items-center justify-between px-3 select-none flex-shrink-0 z-30">
      {/* Left: App Brand & Tab Strip */}
      <div className="flex items-center space-x-2 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-all"
          title="Toggle Sidebar"
        >
          {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
        </button>

        {/* Brand Icon & Name */}
        <div className="flex items-center space-x-1.5 mr-2 pl-0.5">
          <div className="w-5 h-5 rounded-md bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-100 shadow-xs">
            <Zap size={11} className="text-zinc-100 fill-current" />
          </div>
          <span className="font-bold text-xs text-zinc-100 tracking-wider font-mono">
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
                    ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-700/80 shadow-xs'
                    : 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <Terminal size={11} className={isActive ? 'text-zinc-200' : 'text-zinc-500'} />
                <span className="max-w-[110px] truncate text-[11px]">{tab.title}</span>

                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 hover:bg-zinc-800 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                )}

                {isActive && (
                  <div className="absolute bottom-0 left-1.5 right-1.5 h-[1.5px] bg-zinc-300 rounded-full" />
                )}
              </div>
            );
          })}

          <button
            onClick={onAddTab}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-all"
            title="New Tab (Ctrl+Shift+T)"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Center: Sleek Command Search Omnibar */}
      <button
        onClick={onOpenPalette}
        className="hidden md:flex items-center space-x-2 px-3 py-1 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-all w-64 max-w-xs justify-between shadow-inner"
        title="Search commands, files, or ask AI (#) (Ctrl+Shift+P)"
      >
        <div className="flex items-center space-x-2">
          <Search size={11} className="text-zinc-400" />
          <span className="text-[11px] text-zinc-400">Search or ask AI (#)...</span>
        </div>
        <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-400">
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
                ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100'
            }`}
            title="Add Terminal Pane or AI Agent"
          >
            <Plus size={11} className="text-zinc-300" />
            <span>Pane</span>
            <ChevronDown size={10} className="text-zinc-400" />
          </button>

          {agentMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-[#09090b] border border-zinc-800 shadow-2xl p-1 z-50 text-xs font-sans animate-in fade-in">
              <button
                onClick={() => {
                  onLaunchAgent('shell');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Terminal size={12} className="text-zinc-400" />
                <span>Interactive Shell</span>
              </button>
              <button
                onClick={() => {
                  onLaunchAgent('claude');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Sparkles size={12} className="text-zinc-400" />
                <span>Claude Code</span>
              </button>
              <button
                onClick={() => {
                  onLaunchAgent('agy');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Shield size={12} className="text-zinc-400" />
                <span>AGY Engine</span>
              </button>
              <button
                onClick={() => {
                  onLaunchAgent('codex');
                  setAgentMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Bot size={12} className="text-zinc-400" />
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
                ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100'
            }`}
            title="Autonomous Squads & Skills"
          >
            <Sparkles size={11} className="text-zinc-300" />
            <span>AI Squad</span>
            <ChevronDown size={10} className="text-zinc-400" />
          </button>

          {aiMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-[#09090b] border border-zinc-800 shadow-2xl p-1.5 z-50 text-xs font-sans animate-in fade-in">
              <button
                onClick={() => {
                  onOpenSquadModal();
                  setAiMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Users size={13} className="text-zinc-400" />
                <div>
                  <div className="font-medium">Live 2-Way Squad</div>
                  <div className="text-[10px] text-zinc-500">Claude ⇄ AGY Split view</div>
                </div>
              </button>
              <button
                onClick={() => {
                  onOpenMeshModal();
                  setAiMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Zap size={13} className="text-zinc-400" />
                <div>
                  <div className="font-medium">Autonomous Agent Mesh</div>
                  <div className="text-[10px] text-zinc-500">Verification & self-correction</div>
                </div>
              </button>
              <div className="h-px bg-zinc-800 my-1" />
              <button
                onClick={() => {
                  onOpenSkillsModal();
                  setAiMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors"
              >
                <Zap size={13} className="text-zinc-400" />
                <div>
                  <div className="font-medium">Shared Skills & Memory</div>
                  <div className="text-[10px] text-zinc-500">Universal workflows</div>
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
              ? 'bg-zinc-900 border-zinc-700 text-zinc-100 shadow-xs'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
          title="Inspect Git Diff & Review (Ctrl+Shift+G)"
        >
          <GitCompare size={12} className={hasUncommittedDiff ? 'text-amber-400' : 'text-zinc-500'} />
          <span>Diff</span>
          {hasUncommittedDiff && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Technical Report Export Button */}
        <button
          onClick={onOpenExportReport}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 hover:border-zinc-700 transition-all"
          title="Export Technical Report (Ctrl+Shift+X)"
        >
          <FileDown size={13} />
        </button>

        {/* Settings Modal Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 hover:border-zinc-700 transition-all"
          title="CLI Permissions & Settings (Ctrl+,)"
        >
          <Settings size={13} />
        </button>

        {/* Doctor Status Dot */}
        {doctor && (
          <div
            className="flex items-center justify-center p-1.5 text-zinc-400"
            title={`System Ready (Node ${doctor.node.version})`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]" />
          </div>
        )}
      </div>
    </div>
  );
};
