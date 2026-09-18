import React from 'react';
import {
  Sparkles,
  Shield,
  Bot,
  Play,
  Pause,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  X,
  FastForward,
  Terminal,
} from 'lucide-react';
import type { SquadSession, SessionType } from '../types/warp.js';

interface SquadBarProps {
  squad: SquadSession;
  onPauseToggle: () => void;
  onForceHandoff: () => void;
  onStopSquad: () => void;
}

export const SquadBar: React.FC<SquadBarProps> = ({
  squad,
  onPauseToggle,
  onForceHandoff,
  onStopSquad,
}) => {
  if (!squad.active) return null;

  const getAgentLabel = (type: SessionType) => {
    switch (type) {
      case 'claude':
        return 'Claude';
      case 'agy':
        return 'AGY Engine';
      case 'codex':
        return 'Codex';
      default:
        return 'Shell';
    }
  };

  const getPhaseBadge = () => {
    switch (squad.phase) {
      case 'building':
        return {
          label: `${getAgentLabel(squad.builderType)} is writing code...`,
          color: 'bg-zinc-500/20 border-zinc-500/40 text-zinc-200 shadow-[0_0_15px_rgba(168,85,247,0.2)]',
          icon: <Sparkles size={13} className="text-zinc-400" />,
        };
      case 'handing_off':
        return {
          label: `Handing off to ${getAgentLabel(squad.verifierType)}...`,
          color: 'bg-zinc-500/20 border-zinc-500/40 text-zinc-200 shadow-[0_0_15px_rgba(99,102,241,0.2)]',
          icon: <ArrowRight size={13} className="text-zinc-400" />,
        };
      case 'verifying':
        return {
          label: `${getAgentLabel(squad.verifierType)} running verification...`,
          color: 'bg-zinc-500/20 border-zinc-500/40 text-zinc-200 shadow-[0_0_15px_rgba(0,216,255,0.2)]',
          icon: <Shield size={13} className="text-zinc-400" />,
        };
      case 'repairing':
        return {
          label: `Auto-repairing errors (Round ${squad.round}/${squad.maxRounds})...`,
          color: 'bg-amber-500/20 border-amber-500/40 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]',
          icon: <AlertTriangle size={13} className="text-amber-400" />,
        };
      case 'consensus':
        return {
          label: `Consensus Approved! All tests passed.`,
          color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 shadow-[0_0_15px_rgba(34,197,94,0.25)]',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
        };
      case 'paused':
      default:
        return {
          label: `Squad Paused (User Intervening)`,
          color: 'bg-slate-800/60 border-slate-700 text-slate-300',
          icon: <Pause size={13} className="text-slate-400" />,
        };
    }
  };

  const badge = getPhaseBadge();

  return (
    <div className="mx-2 mt-2 px-3.5 py-2 rounded-xl glass-surface border border-zinc-500/20 flex items-center justify-between select-none z-10 shadow-lg animate-in slide-in-from-top-1 duration-150">
      {/* Left: Squad Branding & Goal */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-zinc-400 via-zinc-500 to-zinc-500 flex items-center justify-center font-bold text-[10px] text-black">
            👥
          </div>
          <span className="font-bold text-xs text-white font-sans tracking-wide">
            LIVE SQUAD
          </span>
        </div>

        <div className="h-3.5 w-[1px] bg-white/[0.1]" />

        {/* Builder <-> Verifier Pair */}
        <div className="flex items-center space-x-1.5 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded-md bg-zinc-500/10 border border-zinc-500/30 text-zinc-300">
            {getAgentLabel(squad.builderType)} (Builder)
          </span>
          <span className="text-slate-500">⇄</span>
          <span className="px-2 py-0.5 rounded-md bg-zinc-500/10 border border-zinc-500/30 text-zinc-300">
            {getAgentLabel(squad.verifierType)} (Verifier)
          </span>
        </div>

        <div className="h-3.5 w-[1px] bg-white/[0.1]" />

        {/* Goal snippet */}
        <span className="text-xs text-slate-300 font-sans truncate max-w-sm" title={squad.goal}>
          "{squad.goal}"
        </span>
      </div>

      {/* Right: Phase Badge & Action Controls */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        {/* Phase Indicator */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl border text-xs font-semibold transition-all ${badge.color}`}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </div>

        {/* Action Buttons */}
        <button
          onClick={onPauseToggle}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
 squad.phase === 'paused'
 ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
 : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white'
 }`}
          title={squad.phase === 'paused' ? 'Resume Autonomous Loop' : 'Pause Loop to Intervene'}
        >
          {squad.phase === 'paused' ? <Play size={11} /> : <Pause size={11} />}
          <span>{squad.phase === 'paused' ? 'Resume' : 'Pause'}</span>
        </button>

        {squad.phase !== 'consensus' && (
          <button
            onClick={onForceHandoff}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/30 text-zinc-200 text-xs font-medium transition-all"
            title="Force immediate handoff to partner CLI"
          >
            <FastForward size={11} />
            <span>Handoff</span>
          </button>
        )}

        <button
          onClick={onStopSquad}
          className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Exit Squad Mode"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
