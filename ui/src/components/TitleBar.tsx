import React from 'react';
import { Terminal, Shield, Sparkles, FolderGit2, RefreshCw, PanelLeftClose, PanelLeft } from 'lucide-react';
import type { DoctorStatus } from '../types/warp.js';

interface TitleBarProps {
  doctor: DoctorStatus | null;
  onRefreshDoctor: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  cwd: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  doctor,
  onRefreshDoctor,
  sidebarOpen,
  onToggleSidebar,
  cwd,
}) => {
  return (
    <div className="h-10 bg-warp-bg border-b border-warp-border flex items-center justify-between px-3 select-none flex-shrink-0">
      {/* Left: Window Controls space & Sidebar toggle & App title */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-warp-card transition-colors"
          title="Toggle Sidebar"
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>

        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-xs text-black shadow-sm">
            ⚡
          </div>
          <span className="font-semibold text-xs text-slate-200 tracking-wide">
            WARP <span className="text-cyan-400 font-normal">ORCHESTRATOR</span>
          </span>
        </div>

        {/* Tab pill */}
        <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-warp-surface border border-warp-border text-[11px] text-slate-300 font-mono">
          <Terminal size={12} className="text-cyan-400" />
          <span className="max-w-[200px] truncate">{cwd || 'workspace'}</span>
        </div>
      </div>

      {/* Right: Doctor Status Badges */}
      <div className="flex items-center space-x-2">
        {doctor && (
          <div className="flex items-center space-x-2 text-[11px]">
            {/* Claude Status */}
            <div
              className={`flex items-center space-x-1 px-2 py-0.5 rounded border ${
                doctor.claude.ok
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}
              title={doctor.claude.ok ? `Claude Code: ${doctor.claude.version}` : 'Claude Code not found in PATH'}
            >
              <Sparkles size={11} />
              <span>Claude</span>
              <span className={`w-1.5 h-1.5 rounded-full ${doctor.claude.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </div>

            {/* Gemini Status */}
            <div
              className={`flex items-center space-x-1 px-2 py-0.5 rounded border ${
                doctor.gemini.ok
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
              }`}
              title={doctor.gemini.ok ? `Gemini CLI: ${doctor.gemini.version}` : 'Gemini CLI not found (Mock fallback ready)'}
            >
              <Shield size={11} />
              <span>Gemini</span>
              <span className={`w-1.5 h-1.5 rounded-full ${doctor.gemini.ok ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            </div>

            {/* Git Status */}
            <div
              className={`flex items-center space-x-1 px-2 py-0.5 rounded border ${
                doctor.git.isRepo
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}
              title={doctor.git.isRepo ? 'Git repo ready' : 'Not a git repo'}
            >
              <FolderGit2 size={11} />
              <span>Git</span>
              <span className={`w-1.5 h-1.5 rounded-full ${doctor.git.isRepo ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </div>

            <button
              onClick={onRefreshDoctor}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-warp-card transition-colors"
              title="Refresh System Health"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
