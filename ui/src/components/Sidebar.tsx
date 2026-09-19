import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Terminal,
  Sparkles,
  Shield,
  Bot,
  Settings,
  Clock,
  User,
} from 'lucide-react';
import type { WorkspaceTab, SessionType } from '../types/warp.js';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  cwd: string;
  gitBranch: string | null;
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewSession: (type?: SessionType) => void;
  onLaunchAgent?: (type: SessionType) => void;
  onOpenPalette: () => void;
  onOpenSquads: () => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
  pastRuns?: any[];
}

const typeMeta: Record<SessionType, { icon: React.ReactNode; chip: string; label: string }> = {
  claude: { icon: <Sparkles size={11} className="text-white" />, chip: 'bg-orange-600/90', label: 'Claude Code' },
  agy: { icon: <Shield size={11} className="text-white" />, chip: 'bg-blue-600/90', label: 'AGY Engine' },
  codex: { icon: <Bot size={11} className="text-white" />, chip: 'bg-emerald-600/90', label: 'Codex CLI' },
  shell: { icon: <Terminal size={11} className="text-white" />, chip: 'bg-zinc-600', label: 'Terminal' },
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggleSidebar,
  cwd,
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
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleOutside = () => setNewMenuOpen(false);
    if (newMenuOpen) {
      window.addEventListener('click', handleOutside);
      return () => window.removeEventListener('click', handleOutside);
    }
  }, [newMenuOpen]);

  const filteredTabs = useMemo(() => {
    if (!query.trim()) return tabs;
    const q = query.toLowerCase();
    return tabs.filter((t) => t.title.toLowerCase().includes(q));
  }, [tabs, query]);

  if (!isOpen) return null;

  return (
    <div className="w-60 bg-base-app border-r border-zinc-900 flex flex-col h-full select-none text-xs text-zinc-300 z-20 flex-shrink-0 animate-slide-in-left">
      {/* Search + New Session */}
      <div className="h-10 px-2 flex items-center gap-1.5 flex-shrink-0">
        <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 min-w-0">
          <Search size={12} className="text-zinc-500 flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tabs..."
            className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
        </div>

        <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setNewMenuOpen(!newMenuOpen)}
            className="p-1.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            title="New Session"
          >
            <Plus size={13} />
          </button>

          {newMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-base-elevated border border-zinc-800 shadow-2xl p-1.5 z-50 text-xs font-sans animate-slide-in-up">
              <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                Start Terminal CLI
              </div>

              {(['claude', 'agy', 'shell', 'codex'] as SessionType[]).map((type) => {
                const meta = typeMeta[type];
                return (
                  <button
                    key={type}
                    onClick={() => {
                      onNewSession(type);
                      setNewMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition-colors group"
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center ${meta.chip}`}>
                      {meta.icon}
                    </div>
                    <span className="text-xs font-medium text-zinc-200">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Flat Session List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 font-sans">
        {/* Pinned "new agent conversation" entry */}
        <button
          onClick={() => setNewMenuOpen(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-all text-left"
        >
          <div className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
            <Plus size={11} className="text-zinc-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium truncate">New agent conversation</div>
          </div>
        </button>

        {filteredTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const firstSession = tab.sessions[0];
          const sessionType = firstSession?.type || 'shell';
          const meta = typeMeta[sessionType];

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                isActive ? 'bg-zinc-900 border border-zinc-800' : 'border border-transparent hover:bg-zinc-900/50'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${meta.chip}`}>
                {meta.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] truncate ${isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`}>
                  {tab.title}
                </div>
                <div className="text-[10px] text-zinc-600 truncate font-mono">~</div>
              </div>
            </div>
          );
        })}

        {/* Additional past sessions from history */}
        {pastRuns.slice(0, 4).map((run) => (
          <div
            key={run.runId}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 cursor-pointer transition-all"
          >
            <div className="w-5 h-5 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
              <Clock size={10} className="text-zinc-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] truncate">{run.prompt || run.runId}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Profile / Settings Bar */}
      <div className="p-2.5 border-t border-zinc-900 flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-300">
            <User size={11} />
          </div>
          <span className="text-zinc-500 truncate text-[11px] font-mono">
            {cwd ? cwd.split(/[\\/]/).pop() : '~'}
          </span>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          title="Settings (Ctrl+,)"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
};
