import React from 'react';
import { History, ShieldAlert, Cpu, Settings, RotateCcw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { DoctorStatus } from '../types/warp.js';

interface SidebarProps {
  pastRuns: any[];
  doctor: DoctorStatus | null;
  onRevertGit: () => void;
  primaryModel: string;
  setPrimaryModel: (val: string) => void;
  reviewerModel: string;
  setReviewerModel: (val: string) => void;
  verifyCmd: string;
  setVerifyCmd: (val: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pastRuns,
  doctor,
  onRevertGit,
  primaryModel,
  setPrimaryModel,
  reviewerModel,
  setReviewerModel,
  verifyCmd,
  setVerifyCmd,
}) => {
  return (
    <div className="w-68 bg-[#090b12]/95 backdrop-blur-xl border-r border-white/[0.08] flex flex-col h-full select-none text-xs text-slate-300 shadow-xl z-20">
      {/* Runs History */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-3.5 border-b border-white/[0.06] flex items-center justify-between text-slate-400 font-semibold tracking-wider text-[11px] uppercase font-sans">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded bg-cyan-500/10 text-cyan-400">
              <History size={13} />
            </div>
            <span>.ai-bridge Runs</span>
          </div>
          <span className="text-[10px] bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded-full text-slate-300 font-mono">
            {pastRuns.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {pastRuns.length === 0 ? (
            <div className="text-slate-500 italic p-4 text-center text-xs">
              No past runs in .ai-bridge/ yet
            </div>
          ) : (
            pastRuns.map((run) => (
              <div
                key={run.runId}
                className="p-2.5 rounded-xl glass-card hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-cyan-400 font-semibold truncate max-w-[130px]">
                    {run.runId.slice(4, 18)}
                  </span>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      run.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : run.status === 'DISCARDED'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                  {run.prompt}
                </div>
                <div className="flex items-center space-x-2 mt-2 text-[10px] text-slate-500 font-mono">
                  <span>{run.primaryAdapter}</span>
                  {run.reviewerAdapter && <span>→ {run.reviewerAdapter}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Model Config Section */}
      <div className="p-3.5 border-t border-white/[0.08] bg-white/[0.02] space-y-3">
        <div className="flex items-center space-x-2 text-slate-400 font-semibold tracking-wider text-[11px] uppercase font-sans">
          <div className="p-1 rounded bg-indigo-500/10 text-indigo-400">
            <Settings size={13} />
          </div>
          <span>Orchestrator Config</span>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-medium">Primary CLI (Builder)</label>
          <select
            value={primaryModel}
            onChange={(e) => setPrimaryModel(e.target.value)}
            className="w-full bg-[#0c0d16] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-purple-300 font-mono text-xs focus:outline-none focus:border-purple-500/50 transition-colors"
          >
            <option value="claude">Claude Code (Official)</option>
            <option value="gemini">Gemini CLI (Official)</option>
            <option value="codex">Codex CLI (Official)</option>
            <option value="mock">Mock Simulator</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-medium">Reviewer CLI (Adversarial)</label>
          <select
            value={reviewerModel}
            onChange={(e) => setReviewerModel(e.target.value)}
            className="w-full bg-[#0c0d16] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500/50 transition-colors"
          >
            <option value="gemini">Gemini CLI (Official)</option>
            <option value="claude">Claude Code (Official)</option>
            <option value="codex">Codex CLI (Official)</option>
            <option value="mock">Mock Simulator</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-medium">Verify Command</label>
          <input
            type="text"
            value={verifyCmd}
            onChange={(e) => setVerifyCmd(e.target.value)}
            placeholder="npm test or npm run build"
            className="w-full glass-input rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <button
          onClick={onRevertGit}
          className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-medium transition-all text-[11px]"
        >
          <RotateCcw size={12} />
          <span>Git Rollback (Reset --hard)</span>
        </button>
      </div>
    </div>
  );
};
