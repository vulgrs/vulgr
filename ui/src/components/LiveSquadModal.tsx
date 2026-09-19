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
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center p-4 select-none animate-overlay-in">
      <div className="w-[640px] modal-surface overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="h-14 px-5 modal-header flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center text-accent">
              <Users size={15} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-zinc-100 font-sans tracking-wide">
                  Live Autonomous Squad
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                  2-Way Split Screen
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">
                Interactive real-time terminal handoff & self-repair loop
              </p>
            </div>
          </div>

          <button onClick={onClose} className="modal-close-btn p-1.5">
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Goal Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5">
              <span>Task / Engineering Goal:</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs select-none">❯</span>
              <input
                type="text"
                autoFocus
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Implement JWT refresh token service and run tests..."
                className="w-full glass-input pl-7 pr-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Model Roles */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-base-surface border border-zinc-900">
            {/* Builder Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center space-x-1.5">
                <Sparkles size={12} className="text-zinc-400" />
                <span>Builder (Code Generator)</span>
              </label>
              <select
                value={builder}
                onChange={(e) => setBuilder(e.target.value as SessionType)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-300 font-mono text-xs focus:outline-none focus:border-accent-border"
              >
                <option value="claude">Claude Code (Official)</option>
                <option value="agy">AGY Engine (Official)</option>
                <option value="codex">Codex CLI (Official)</option>
              </select>
              <p className="text-[10px] text-zinc-500">Writes code in Left Terminal Pane</p>
            </div>

            {/* Verifier Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center space-x-1.5">
                <Shield size={12} className="text-zinc-400" />
                <span>Verifier (Test & Audit)</span>
              </label>
              <select
                value={verifier}
                onChange={(e) => setVerifier(e.target.value as SessionType)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-300 font-mono text-xs focus:outline-none focus:border-accent-border"
              >
                <option value="agy">AGY Engine (Official)</option>
                <option value="claude">Claude Code (Official)</option>
                <option value="codex">Codex CLI (Official)</option>
                <option value="shell">Native Shell (Bash / PTY)</option>
              </select>
              <p className="text-[10px] text-zinc-500">Runs tests in Right Terminal Pane</p>
            </div>
          </div>

          {/* Verification Command & Rounds */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Verification Command</label>
              <input
                type="text"
                value={verifyCmd}
                onChange={(e) => setVerifyCmd(e.target.value)}
                placeholder="npm test"
                className="w-full glass-input px-2.5 py-1.5 text-zinc-200 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Max Auto-Fix Rounds</label>
              <select
                value={maxRounds}
                onChange={(e) => setMaxRounds(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-accent-border"
              >
                <option value={2}>2 Rounds</option>
                <option value={3}>3 Rounds</option>
                <option value={5}>5 Rounds</option>
              </select>
            </div>
          </div>

          {/* Workflow Summary Explanation */}
          <div className="p-3 rounded-lg bg-accent-muted border border-accent-border text-zinc-300 text-xs flex items-start space-x-2.5">
            <CheckCircle2 size={15} className="text-accent flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-semibold text-zinc-200">How the live loop works: </span>
              A split-view tab opens. Claude receives the task and types code live. When done, AGY triggers the tests on the right. If any test fails, the stack trace is automatically piped back to Claude to self-repair. You can intervene or pause at any second.
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost px-4 py-2 text-xs font-medium border-transparent hover:border-zinc-800"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!goal.trim()}
              className="btn-accent flex items-center space-x-2 px-5 py-2 font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
