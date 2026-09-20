import React, { useState } from 'react';
import {
  Folder,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  Settings,
  Binary,
} from 'lucide-react';
import { relativeTime, type Session } from './types.js';

interface SessionSidebarProps {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onOpenSystemOne: () => void;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions,
  activeId,
  onSelect,
  onGoHome,
  onOpenSettings,
  onOpenSystemOne,
}) => {
  const [sessionsOpen, setSessionsOpen] = useState(true);

  return (
    <div className="w-64 flex-shrink-0 h-full flex flex-col bg-[#0a0a0b] border-r border-white/[0.06] select-none">
      {/* Projects header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between group">
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 text-[13px] text-zinc-200 hover:text-white transition-colors min-w-0"
          >
            <Folder size={14} className="text-zinc-400 flex-shrink-0" />
            <span className="font-medium truncate">All projects</span>
            <ChevronDown size={13} className="text-zinc-500 flex-shrink-0" />
          </button>
          <button
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
            title="Filter"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>
      </div>

      {/* Sessions section */}
      <div className="px-2 flex-1 min-h-0 overflow-y-auto">
        <button
          onClick={() => setSessionsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-1.5 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <span className="uppercase tracking-wide">Sessions</span>
          {sessionsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <button
          onClick={onOpenSystemOne}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.04] transition-colors mb-0.5"
        >
          <Binary size={13} className="text-emerald-400 flex-shrink-0" />
          <span className="flex-1 text-[12.5px] text-zinc-300">System 1</span>
          <span className="text-[9px] font-mono text-zinc-600 border border-white/10 rounded px-1">JSON</span>
        </button>

        {sessionsOpen && (
          <div className="space-y-0.5 mt-0.5">
            {sessions.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-zinc-600">No sessions yet</div>
            )}
            {sessions.map((s) => {
              const active = s.id === activeId;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                    active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* status dot */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      s.running ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`}
                  />
                  {/* agent icon */}
                  <Sparkles size={13} className="text-amber-400/90 flex-shrink-0" />
                  {/* origin tag */}
                  <span className="text-[9px] font-mono text-zinc-500 border border-white/10 rounded px-1 leading-tight flex-shrink-0">
                    D
                  </span>
                  <span
                    className={`flex-1 min-w-0 truncate text-[12.5px] ${
                      active ? 'text-zinc-100' : 'text-zinc-300'
                    }`}
                  >
                    {s.title}
                  </span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0 font-mono">
                    {relativeTime(s.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Account footer */}
      <div className="px-3 py-3 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-semibold text-zinc-200">
            L
          </div>
          <span className="text-[12.5px] text-zinc-300">Local only</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          title="Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </div>
  );
};
