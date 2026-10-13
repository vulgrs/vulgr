import React, { useState } from 'react';
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
  Network,
} from 'lucide-react';
import { SystemMap } from './SystemMap.js';
import { duoMap } from './flowMaps.js';
import { ACCENT, MONO, accentStyle } from './FlowParts.js';
import { squadAgentLabel } from '../hooks/useSquadOrchestrator.js';

const MAP_AGENTS = ['claude', 'agy', 'codex', 'opencode', 'cursor', 'shell'].map((id) => ({
  value: id,
  label: squadAgentLabel(id as SquadSession['builderType']),
}));
import type { SquadSession } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface SquadBarProps {
  squad: SquadSession;
  onPauseToggle: () => void;
  onStopSquad: () => void;
  onOpenChanges?: () => void;
  /** Bring one of the squad's terminal panes to the front. */
  onFocusPane?: (sessionId: string) => void;
}

/** Which pane each node of the Duo Loop map stands for. */
const NODE_PANE: Record<string, 'builder' | 'verifier'> = { writer: 'builder', tests: 'verifier', checker: 'verifier' };

const PHASE_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  planning: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Shield size={13} className="text-zinc-400" /> },
  building: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Sparkles size={13} className="text-zinc-400" /> },
  verifying: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Shield size={13} className="text-zinc-400" /> },
  handing_off: { color: 'bg-amber-500/15 border-amber-500/40 text-amber-200', icon: <ArrowRight size={13} className="text-amber-400" /> },
  repairing: { color: 'bg-amber-500/15 border-amber-500/40 text-amber-200', icon: <Wrench size={13} className="text-amber-400" /> },
  reviewing: { color: 'bg-zinc-800 border-zinc-700 text-zinc-200', icon: <Eye size={13} className="text-zinc-400" /> },
  consensus: { color: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200', icon: <CheckCircle2 size={13} className="text-emerald-400" /> },
  failed: { color: 'bg-red-500/15 border-red-500/40 text-red-200', icon: <XCircle size={13} className="text-red-400" /> },
};

export const SquadBar: React.FC<SquadBarProps> = ({ squad, onPauseToggle, onStopSquad, onOpenChanges, onFocusPane }) => {
  const { t } = useI18n();
  const [showMap, setShowMap] = useState(false);
  if (!squad.active) return null;

  const finished = squad.phase === 'consensus' || squad.phase === 'failed';
  const style = squad.paused
    ? { color: 'bg-zinc-900 border-zinc-700 text-zinc-300', icon: <Pause size={13} className="text-zinc-400" /> }
    : PHASE_STYLE[squad.phase] ?? PHASE_STYLE.building;
  const statusText = squad.paused
    ? t.workspace.squadPaused
    : squad.statusText || '';

  return (
    <div className="mx-2 mt-2 rounded-lg surface-panel border select-none z-10 shadow-card animate-slide-in-up" style={accentStyle(ACCENT.duo)}>
    <div className="px-3.5 py-2 flex items-center justify-between gap-3">
      {/* Left: who is on which side, and the goal */}
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex size-5 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-[color:var(--flow-accent)]">
            <Users size={11} />
          </div>
          <span className="font-semibold text-xs text-zinc-100 font-sans">{t.workspace.squadTitle}</span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800 flex-shrink-0" />

        <div className="flex items-center gap-1.5 text-[11px] flex-shrink-0">
          <span
            className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300"
            title={t.workspace.builderHint}
          >
            ◧ {t.workspace.builderLabel(squadAgentLabel(squad.builderType))}
          </span>
          <span className="text-zinc-600">⇄</span>
          <span
            className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300"
            title={
              squad.verifierType === 'shell'
                ? t.workspace.verifierShellHint
                : t.workspace.verifierAgentHint
            }
          >
            ◨ {squad.verifierType === 'shell' ? t.workspace.verifierShellLabel : t.workspace.verifierAgentLabel(squadAgentLabel(squad.verifierType))}
          </span>
          <span className="font-mono text-zinc-500 ml-1">
            {t.workspace.round(squad.round, squad.maxRounds)}
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800 flex-shrink-0" />

        <span className="text-xs text-zinc-400 font-sans truncate" title={squad.goal}>
          "{squad.goal}"
        </span>
      </div>

      {/* Right: current step and controls */}
      <div className="flex items-center gap-2 min-w-0 max-w-[55%]">
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium min-w-0 ${style.color}`}
          title={squad.error || statusText}
        >
          {style.icon}
          <span className="truncate">{statusText}</span>
          {squad.phase === 'failed' && squad.lastErrorSnippet && (
            <AlertTriangle size={12} className="text-red-300 flex-shrink-0" />
          )}
        </div>

        <button
          onClick={() => setShowMap((v) => !v)}
          className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
            showMap
              ? 'border-[color:var(--flow-accent)] text-zinc-100 bg-[color-mix(in_oklab,var(--flow-accent)_12%,transparent)]'
              : 'btn-ghost'
          }`}
          title={showMap ? t.flow.hideSystem : t.flow.mapLive}
          aria-expanded={showMap}
        >
          <Network size={11} />
          <span>{t.flow.showSystem}</span>
        </button>

        {finished ? (
          onOpenChanges && (
            <button
              onClick={onOpenChanges}
              className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-md border border-primary/40 bg-primary/10 text-xs font-medium text-primary"
              title={t.workspace.reviewChangesHint}
            >
              <GitCompare size={11} />
              <span>{t.workspace.reviewChanges}</span>
            </button>
          )
        ) : (
          <button
            onClick={onPauseToggle}
            className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
              squad.paused
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : 'btn-ghost'
            }`}
            title={squad.paused ? t.workspace.resumeHint : t.workspace.pauseHint}
          >
            {squad.paused ? <Play size={11} /> : <Pause size={11} />}
            <span>{squad.paused ? t.workspace.resume : t.workspace.pause}</span>
          </button>
        )}

        <button
          onClick={onStopSquad}
          className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title={finished ? t.workspace.closeBar : t.workspace.stopSquad}
        >
          <X size={14} />
        </button>
      </div>
    </div>

    {showMap && (
      <div className="grid gap-3 border-t border-zinc-900 p-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <SystemMap
            {...duoMap(
              {
                builder: squad.builderType,
                verifier: squad.verifierType,
                phase: squad.paused ? undefined : squad.phase,
                round: squad.round,
                maxRounds: squad.maxRounds,
                verifyCmd: squad.verifyCmd,
              },
              t.flow,
              MAP_AGENTS
            )}
            height={210}
            selectHint={onFocusPane ? t.flow.openPaneHint : undefined}
            onSelect={
              onFocusPane
                ? (id) => {
                    const pane = NODE_PANE[id];
                    if (pane) onFocusPane(pane === 'builder' ? squad.builderSessionId : squad.verifierSessionId);
                  }
                : undefined
            }
          />
          <p className="mt-1.5 text-[11px] text-zinc-500">{t.flow.mapLiveShort}</p>
        </div>
        <div className="min-w-0">
          <div className={`mb-1.5 text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{t.flow.stepsSoFar}</div>
          <ol className="max-h-[210px] overflow-y-auto border-l border-zinc-800 pl-3">
            {(squad.log ?? []).map((entry, i, all) => {
              const current = i === all.length - 1 && !finished;
              return (
                <li key={entry.at + ':' + i} className="relative pb-2 last:pb-0">
                  <span
                    className={`absolute -left-[16.5px] top-[5px] size-2 rounded-full ${
                      current
                        ? 'animate-pulse bg-[color:var(--flow-accent)]'
                        : entry.phase === 'failed'
                          ? 'bg-red-400'
                          : entry.phase === 'consensus'
                            ? 'bg-emerald-400'
                            : 'bg-zinc-600'
                    }`}
                  />
                  <p className={`text-[11.5px] leading-snug ${current ? 'text-zinc-100' : 'text-zinc-400'}`}>{entry.text}</p>
                  <span className={`text-[9.5px] text-zinc-600 ${MONO}`}>
                    {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    )}
    </div>
  );
};
