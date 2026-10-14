import { useEffect, useRef } from 'react';
import type { SquadSession } from '../types/warp.js';
import { duoMap } from '../components/flowMaps.js';
import { MAP_AGENTS } from '../components/SquadBar.js';
import { useI18n } from '../i18n/index.js';
import { newRunId, runNotice, saveRun, useRunRecorder, type RunRecord } from '../runHistory.js';

const EMPTY = { nodes: [], edges: [] };
const isOver = (s: SquadSession) => s.phase === 'consensus' || s.phase === 'failed';

/**
 * Saves each Duo Loop run to the history when it ends: approved, failed, or
 * closed by the user while still working (stopped).
 */
export function useDuoHistory(squad: SquadSession | null, cwd: string) {
  const { t } = useI18n();
  const graph = squad
    ? duoMap(
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
      )
    : EMPTY;
  const running = !!squad?.active && !isOver(squad);
  const recordMap = useRunRecorder(graph, running);

  const current = useRef<{ squad: SquadSession; startedAt: number; saved: boolean } | null>(null);
  const cwdRef = useRef(cwd);

  useEffect(() => {
    const prev = current.current;
    const save = (s: SquadSession, startedAt: number, outcome: 'success' | 'failed' | 'stopped') => {
      const record: RunRecord = {
        id: newRunId(),
        kind: 'duo',
        goal: s.goal,
        cwd: cwdRef.current,
        startedAt,
        endedAt: Date.now(),
        outcome,
        summary: s.error || s.statusText,
        agents: [...new Set([s.builderType, s.verifierType])],
        settings: { builder: s.builderType, verifier: s.verifierType, verifyCmd: s.verifyCmd, maxRounds: String(s.maxRounds) },
        log: (s.log ?? []).map((entry) => ({ at: entry.at, text: entry.text })),
        map: recordMap(),
      };
      // Closing the bar yourself is not news; only a loop that ended on its own notifies.
      void saveRun(record, outcome === 'stopped' ? undefined : runNotice(t, record));
    };

    // Closed (or replaced by a new run) before it ended: stopped by the user.
    const replaced = prev && (!squad || squad.builderSessionId !== prev.squad.builderSessionId || squad.goal !== prev.squad.goal);
    if (prev && replaced && !prev.saved) save(prev.squad, prev.startedAt, 'stopped');

    if (!squad?.active) {
      current.current = null;
      return;
    }
    if (!prev || replaced) {
      cwdRef.current = cwd;
      current.current = { squad, startedAt: squad.log?.[0]?.at ?? Date.now(), saved: false };
    } else {
      current.current = { ...prev, squad };
    }
    const entry = current.current;
    if (isOver(squad) && !entry.saved) {
      entry.saved = true;
      save(squad, entry.startedAt, squad.phase === 'consensus' ? 'success' : 'failed');
    }
  }, [squad]);
}
