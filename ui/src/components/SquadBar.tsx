import React from 'react';
import {
  Sparkles,
  Shield,
  Play,
  Pause,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  X,
  FastForward,
  Users,
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
          color: 'bg-zinc-800 border-zinc-700 text-zinc-200',
          icon: <Sparkles size={13} className="text-zinc-400" />,
        };
      case 'handing_off':
        return {
          label: `Handing off to ${getAgentLabel(squad.verifierType)}...`,
          color: 'bg-zinc-800 border-zinc-700 text-zinc-200',
          icon: <ArrowRight size={13} className="text-zinc-400" />,
        };
      case 'verifying':
        return {
          label: `${getAgentLabel(squad.verifierType)} running verification...`,
          color: 'bg-zinc-800 border-zinc-700 text-zinc-200',
          icon: <Shield size={13} className="text-zinc-400" />,
        };
      case 'repairing':
        return {
          label: `Auto-repairing errors (Round ${squad.round}/${squad.maxRounds})...`,
          color: 'bg-amber-500/20 border-amber-500/40 text-amber-200',
          icon: <AlertTriangle size={13} className="text-amber-400" />,
        };
      case 'consensus':
        return {
          label: `Consensus Approved! All tests passed.`,
          color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
        };
      case 'paused':
      default:
        return {
          label: `Squad Paused (User Intervening)`,
          color: 'bg-zinc-900 border-zinc-800 text-zinc-300',
          icon: <Pause size={13} className="text-zinc-400" />,
        };
    }
  };

  const badge = getPhaseBadge();

  return (
    <div className="mx-2 mt-2 px-3.5 py-2 rounded-lg surface-panel border flex items-center justify-between select-none z-10 shadow-card animate-slide-in-up">
      {/* Left: Squad Branding & Goal */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-2">
          <div className="flex size-5 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-primary">
            <Users size={11} />
          </div>
          <span
            className="font-semibold text-xs text-zinc-100 font-sans tracking-wide"
            title="Two agents cooperating: the Builder writes code, the Verifier tests it and sends fixes back until tests pass"
          >
            Squad running
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800" />

        {/* Builder <-> Verifier Pair */}
        <div className="flex items-center space-x-1.5 font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
            {getAgentLabel(squad.builderType)} (Builder)
          </span>
          <span className="text-zinc-600">⇄</span>
          <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
            {getAgentLabel(squad.verifierType)} (Verifier)
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800" />

        {/* Goal snippet */}
        <span className="text-xs text-zinc-400 font-sans truncate max-w-sm" title={squad.goal}>
          "{squad.goal}"
        </span>
      </div>

      {/* Right: Phase Badge & Action Controls */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        {/* Phase Indicator */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${badge.color}`}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </div>

        {/* Action Buttons */}
        <button
          onClick={onPauseToggle}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
 squad.phase === 'paused'
 ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
 : 'btn-ghost'
 }`}
          title={squad.phase === 'paused' ? 'Resume Autonomous Loop' : 'Pause Loop to Intervene'}
        >
          {squad.phase === 'paused' ? <Play size={11} /> : <Pause size={11} />}
          <span>{squad.phase === 'paused' ? 'Resume' : 'Pause to type'}</span>
        </button>

        {squad.phase !== 'consensus' && (
          <button
            onClick={onForceHandoff}
            className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-all"
            title="Don't wait — pass the work to the other agent right now"
          >
            <FastForward size={11} />
            <span>Pass to {getAgentLabel(squad.phase === 'building' ? squad.verifierType : squad.builderType)}</span>
          </button>
        )}

        <button
          onClick={onStopSquad}
          className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Stop the squad and close this bar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
