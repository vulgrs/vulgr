import React, { useState } from 'react';
import {
  Users,
  Sparkles,
  Shield,
  Bot,
  ArrowRight,
  Terminal,
  X,
  Play,
  CheckCircle2,
} from 'lucide-react';
import type { SessionType } from '../types/warp.js';

interface LiveSquadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSquad: (config: {
    goal: string;
    builder: SessionType;
    verifier: SessionType;
    verifyCmd: string;
    maxRounds: number;
  }) => void;
}

export const LiveSquadModal: React.FC<LiveSquadModalProps> = ({
  isOpen,
  onClose,
  onLaunchSquad,
}) => {
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState<SessionType>('claude');
  const [verifier, setVerifier] = useState<SessionType>('agy');
  const [verifyCmd, setVerifyCmd] = useState('npm test');
  const [maxRounds, setMaxRounds] = useState(3);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim()) return;

    onLaunchSquad({
      goal: goal.trim(),
      builder,
      verifier,
      verifyCmd: verifyCmd.trim() || 'npm test',
      maxRounds,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="w-[640px] glass-modal rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/[0.1] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 px-5 bg-white/[0.03] border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-sm text-black shadow-[0_0_15px_rgba(0,216,255,0.3)]">
              👥
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-slate-100 font-sans tracking-wide">
                  Live Autonomous Squad
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  2-Way Split Screen
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Interactive real-time terminal handoff & self-repair loop
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Goal Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <span>Task / Engineering Goal:</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-cyan-400 font-mono text-xs select-none">❯</span>
              <input
                type="text"
                autoFocus
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Implement JWT refresh token service and run tests..."
                className="w-full glass-input rounded-xl pl-7 pr-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Model Roles */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            {/* Builder Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-purple-300 flex items-center space-x-1.5">
                <Sparkles size={12} className="text-purple-400" />
                <span>Builder (Code Generator)</span>
              </label>
              <select
                value={builder}
                onChange={(e) => setBuilder(e.target.value as SessionType)}
                className="w-full bg-[#0c0d16] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-purple-300 font-mono text-xs focus:outline-none focus:border-purple-500/50"
              >
                <option value="claude">Claude Code (Official)</option>
                <option value="agy">AGY Engine (Official)</option>
                <option value="codex">Codex CLI (Official)</option>
              </select>
              <p className="text-[10px] text-slate-500">Writes code in Left Terminal Pane</p>
            </div>

            {/* Verifier Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-cyan-300 flex items-center space-x-1.5">
                <Shield size={12} className="text-cyan-400" />
                <span>Verifier (Test & Audit)</span>
              </label>
              <select
                value={verifier}
                onChange={(e) => setVerifier(e.target.value as SessionType)}
                className="w-full bg-[#0c0d16] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500/50"
              >
                <option value="agy">AGY Engine (Official)</option>
                <option value="claude">Claude Code (Official)</option>
                <option value="codex">Codex CLI (Official)</option>
                <option value="shell">Native Shell (Bash / PTY)</option>
              </select>
              <p className="text-[10px] text-slate-500">Runs tests in Right Terminal Pane</p>
            </div>
          </div>

          {/* Verification Command & Rounds */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-slate-400">Verification Command</label>
              <input
                type="text"
                value={verifyCmd}
                onChange={(e) => setVerifyCmd(e.target.value)}
                placeholder="npm test"
                className="w-full glass-input rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-400">Max Auto-Fix Rounds</label>
              <select
                value={maxRounds}
                onChange={(e) => setMaxRounds(Number(e.target.value))}
                className="w-full bg-[#0c0d16] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none"
              >
                <option value={2}>2 Rounds</option>
                <option value={3}>3 Rounds</option>
                <option value={5}>5 Rounds</option>
              </select>
            </div>
          </div>

          {/* Workflow Summary Explanation */}
          <div className="p-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20 text-slate-300 text-xs flex items-start space-x-2.5">
            <CheckCircle2 size={15} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-semibold text-slate-200">How the live loop works: </span>
              A split-view tab opens. Claude receives the task and types code live. When done, AGY triggers the tests on the right. If any test fails, the stack trace is automatically piped back to Claude to self-repair. You can intervene or pause at any second.
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all text-xs font-medium"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!goal.trim()}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:via-indigo-500 hover:to-purple-500 text-white font-semibold text-xs transition-all shadow-[0_0_20px_rgba(0,216,255,0.25)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={13} className="fill-current" />
              <span>Launch Live Squad</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
