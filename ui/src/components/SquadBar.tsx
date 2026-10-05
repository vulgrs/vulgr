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
  Users,
  Wrench,
  Eye,
  XCircle,
  GitCompare,
} from 'lucide-react';
import { squadAgentLabel } from '../hooks/useSquadOrchestrator.js';
import type { SquadSession } from '../types/warp.js';

interface SquadBarProps {
  squad: SquadSession;
  onPauseToggle: () => void;
  onStopSquad: () => void;
  onOpenChanges?: () => void;
}

const PHASE_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  building: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Sparkles size={13} className="text-zinc-400" /> },
  verifying: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Shield size={13} className="text-zinc-400" /> },
  handing_off: { color: 'bg-amber-500/15 border-amber-500/40 text-amber-200', icon: <ArrowRight size={13} className="text-amber-400" /> },
  repairing: { color: 'bg-amber-500/15 border-amber-500/40 text-amber-200', icon: <Wrench size={13} className="text-amber-400" /> },
  reviewing: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Eye size={13} className="text-zinc-400" /> },
  consensus: { color: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200', icon: <CheckCircle2 size={13} className="text-emerald-400" /> },
  failed: { color: 'bg-red-500/15 border-red-500/40 text-red-200', icon: <XCircle size={13} className="text-red-400" /> },
};

export const SquadBar: React.FC<SquadBarProps> = ({ squad, onPauseToggle, onStopSquad, onOpenChanges }) => {
  if (!squad.active) return null;

  const finished = squad.phase === 'consensus' || squad.phase === 'failed';
  const style = squad.paused
    ? { color: 'bg-zinc-900 border-zinc-700 text-zinc-300', icon: <Pause size={13} className="text-zinc-400" /> }
    : PHASE_STYLE[squad.phase] ?? PHASE_STYLE.building;
  const statusText = squad.paused
    ? 'Duraklatıldı — şu anki adım bitince bekliyor. Panellere kendiniz yazabilirsiniz.'
    : squad.statusText || '';

  return (
    <div className="mx-2 mt-2 px-3.5 py-2 rounded-lg surface-panel border flex items-center justify-between gap-3 select-none z-10 shadow-card animate-slide-in-up">
      {/* Left: who is on which side, and the goal */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex size-5 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-primary">
            <Users size={11} />
          </div>
          <span className="font-semibold text-xs text-zinc-100 font-sans">İkili Ajan</span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800 flex-shrink-0" />

        <div className="flex items-center gap-1.5 text-[11px] flex-shrink-0">
          <span
            className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300"
            title="Sol panel: kodu yazan ajan"
          >
            ◧ {squadAgentLabel(squad.builderType)} yazar
          </span>
          <span className="text-zinc-600">⇄</span>
          <span
            className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300"
            title={
              squad.verifierType === 'shell'
                ? 'Sağ panel: test komutu çalışır'
                : 'Sağ panel: test komutu çalışır, ajan hataları inceler ve kodu gözden geçirir'
            }
          >
            ◨ {squad.verifierType === 'shell' ? 'test' : `${squadAgentLabel(squad.verifierType)} kontrol eder`}
          </span>
          <span className="font-mono text-zinc-500 ml-1">
            tur {squad.round}/{squad.maxRounds}
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800 flex-shrink-0" />

        <span className="text-xs text-zinc-400 font-sans truncate" title={squad.goal}>
          "{squad.goal}"
        </span>
      </div>

      {/* Right: current step and controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium max-w-md ${style.color}`}
          title={squad.error || statusText}
        >
          {style.icon}
          <span className="truncate">{statusText}</span>
          {squad.phase === 'failed' && squad.lastErrorSnippet && (
            <AlertTriangle size={12} className="text-red-300 flex-shrink-0" />
          )}
        </div>

        {finished ? (
          onOpenChanges && (
            <button
              onClick={onOpenChanges}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-primary/40 bg-primary/10 text-xs font-medium text-primary"
              title="Ajanların yaptığı değişiklikleri inceleyin ve commit edin"
            >
              <GitCompare size={11} />
              <span>Değişiklikleri incele</span>
            </button>
          )
        ) : (
          <button
            onClick={onPauseToggle}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
              squad.paused
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : 'btn-ghost'
            }`}
            title={squad.paused ? 'Kaldığı yerden devam et' : 'Şu anki adım bitince beklesin; araya girip kendiniz yazabilirsiniz'}
          >
            {squad.paused ? <Play size={11} /> : <Pause size={11} />}
            <span>{squad.paused ? 'Devam et' : 'Duraklat'}</span>
          </button>
        )}

        <button
          onClick={onStopSquad}
          className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title={finished ? 'Bu çubuğu kapat' : 'İkili ajanı durdur (çalışan komutlar Ctrl+C ile kesilir)'}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
