import React, { useState } from 'react';
import {
  Plus,
  Search,
  Zap,
  Sliders,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Sparkles,
  Shield,
  Bot,
  Settings,
  Clock,
  User,
  GitBranch,
} from 'lucide-react';
import type { WorkspaceTab } from '../types/warp.js';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  cwd: string;
  gitBranch: string | null;
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewSession: () => void;
  onOpenPalette: () => void;
  onOpenSquads: () => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  pastRuns?: any[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  cwd,
  gitBranch,
  tabs,
  activeTabId,
  onSelectTab,
  onNewSession,
  onOpenPalette,
  onOpenSquads,
  onOpenSkills,
  onOpenSettings,
  pastRuns = [],
}) => {
  const [reposExpanded, setReposExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  if (!isOpen) return null;

  const repoName = cwd ? cwd.split(/[\\/]/).pop() || 'cli' : 'cli';

  return (
    <div className="w-60 bg-[#000000] border-r border-zinc-800/80 flex flex-col h-full select-none text-xs text-zinc-300 z-20 flex-shrink-0 animate-in slide-in-from-left-2 duration-150">
      {/* Top Action Button (Matches Reference: "+ New Chat" / "+ New Session") */}
      <div className="p-3 border-b border-zinc-900">
        <button
          onClick={onNewSession}
          className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 font-medium text-xs transition-all shadow-sm hover:border-zinc-700 active:scale-[0.99]"
        >
          <Plus size={14} className="text-zinc-400" />
          <span>New Session</span>
        </button>
      </div>

      {/* Main Navigation Links (Matches Reference: Search, Automations, Customize) */}
      <div className="px-2 py-2 border-b border-zinc-900 space-y-0.5">
        <button
          onClick={onOpenPalette}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 text-xs transition-all"
        >
          <div className="flex items-center space-x-2">
            <Search size={13} className="text-zinc-500" />
            <span>Search</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1">
            ^P
          </span>
        </button>

        <button
          onClick={onOpenSquads}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 text-xs transition-all"
        >
          <div className="flex items-center space-x-2">
            <Zap size={13} className="text-zinc-500" />
            <span>Automations</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500">Squad</span>
        </button>

        <button
          onClick={onOpenSkills}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 text-xs transition-all"
        >
          <div className="flex items-center space-x-2">
            <Sliders size={13} className="text-zinc-500" />
            <span>Customize</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500">Skills</span>
        </button>
      </div>

      {/* Tree Section (Matches Reference: Projects & Repositories with session history) */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3 font-sans">
        {/* Projects header */}
        <div>
          <div
            onClick={() => setProjectsExpanded(!projectsExpanded)}
            className="flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300"
          >
            <div className="flex items-center space-x-1">
              {projectsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span>Projects</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNewSession();
              }}
              className="p-0.5 rounded hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            >
              <Plus size={12} />
            </button>
          </div>

          {projectsExpanded && (
            <div className="mt-1 space-y-0.5 pl-1.5">
              <div className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-zinc-300 bg-zinc-900/50 border border-zinc-800/60 font-medium">
                <div className="flex items-center space-x-2 truncate">
                  <span className="text-zinc-500">📁</span>
                  <span className="truncate">{repoName}</span>
                </div>
                {gitBranch && (
                  <span className="text-[9px] font-mono text-zinc-500 truncate max-w-[60px]">
                    {gitBranch}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Repositories & Sessions List (Exact layout from reference image) */}
        <div>
          <div
            onClick={() => setReposExpanded(!reposExpanded)}
            className="flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300"
          >
            <div className="flex items-center space-x-1">
              {reposExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span>Repositories</span>
            </div>
          </div>

          {reposExpanded && (
            <div className="mt-1 space-y-1">
              {/* Repository Title Item */}
              <div className="flex items-center space-x-2 px-2 py-1 text-xs text-zinc-400 font-medium">
                <FolderGit2 size={12} className="text-zinc-500" />
                <span className="truncate">{repoName}</span>
              </div>

              {/* Active Workspace Tabs / Sessions */}
              <div className="space-y-0.5 pl-3 border-l border-zinc-800/60 ml-2.5">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  const firstSession = tab.sessions[0];
                  const sessionType = firstSession?.type || 'shell';

                  return (
                    <div
                      key={tab.id}
                      onClick={() => onSelectTab(tab.id)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-all ${
                        isActive
                          ? 'bg-zinc-800 text-zinc-100 font-medium shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate min-w-0">
                        {sessionType === 'claude' ? (
                          <Sparkles size={11} className="text-purple-400 flex-shrink-0" />
                        ) : sessionType === 'agy' ? (
                          <Shield size={11} className="text-zinc-300 flex-shrink-0" />
                        ) : sessionType === 'codex' ? (
                          <Bot size={11} className="text-emerald-400 flex-shrink-0" />
                        ) : (
                          <Terminal size={11} className="text-zinc-500 flex-shrink-0" />
                        )}
                        <span className="truncate">{tab.title}</span>
                      </div>

                      <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 ml-1">
                        {isActive ? 'now' : 'idle'}
                      </span>
                    </div>
                  );
                })}

                {/* Additional Past Sessions from history */}
                {pastRuns.slice(0, 4).map((run) => (
                  <div
                    key={run.runId}
                    className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 cursor-pointer transition-all"
                  >
                    <div className="flex items-center space-x-2 truncate min-w-0">
                      <Clock size={10} className="text-zinc-600 flex-shrink-0" />
                      <span className="truncate">{run.prompt || run.runId}</span>
                    </div>
                    <span className="text-[9px] font-mono text-zinc-600">3h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Profile / Machine & Settings Bar (Matches Reference) */}
      <div className="p-2.5 border-t border-zinc-900 bg-zinc-950/60 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-300">
            <User size={11} />
          </div>
          <span className="text-zinc-400 truncate text-[11px] font-mono">
            {gitBranch || 'master'}
          </span>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          title="Settings"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
};

