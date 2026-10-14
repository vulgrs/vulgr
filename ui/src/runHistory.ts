import { useEffect, useRef } from 'react';
import { edgeKey, type MapEdge, type MapNode, type Snapshot } from './components/SystemMap.js';
import type { Messages } from './i18n/index.js';

export type RunKind = 'duo' | 'swarm' | 'orchestra';
export type RunOutcome = 'success' | 'failed' | 'stopped';

/** The map of a run as saved: nodes without their React icons, plus every change of state. */
export interface SavedMap {
  nodes: Omit<MapNode, 'icon'>[];
  edges: MapEdge[];
  snapshots: Snapshot[];
}

/** Same shape as RunRecord in src/engine/runHistory.ts. */
export interface RunRecord {
  id: string;
  kind: RunKind;
  goal: string;
  cwd: string;
  startedAt: number;
  endedAt: number;
  outcome: RunOutcome;
  summary?: string;
  agents?: string[];
  log?: { at?: number; who?: string; text: string }[];
  map?: SavedMap;
  tokens?: number;
  tokensExact?: boolean;
  costUsd?: number;
  /** The team setup it ran with (agents, test command, rounds...), to run it again. */
  settings?: Record<string, string | number | boolean | string[]>;
}

/** What the CLIs reported for a run (see AgentUsage in src/types). */
export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

/** The token and cost fields of a run record: the reported usage when there is one, else the map's estimate. */
export function runTokens(usage: RunUsage | undefined, map: SavedMap): Pick<RunRecord, 'tokens' | 'tokensExact' | 'costUsd'> {
  if (usage) {
    const tokens =
      usage.totalTokens ?? usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
    if (tokens > 0) return { tokens, tokensExact: true, costUsd: usage.costUsd };
  }
  const estimate = map.nodes.reduce((sum, n) => sum + (n.tokens ?? 0), 0);
  return { tokens: estimate || undefined };
}
export type RunSummary = Omit<RunRecord, 'log' | 'map'>;

export const newRunId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const KIND_LABEL: Record<RunKind, string> = { duo: 'Duo Loop', swarm: 'Agent Swarm', orchestra: 'Orchestrator' };

/** The system notification for a finished run: "Agent Swarm finished" with the goal. */
export function runNotice(t: Messages, record: Pick<RunRecord, 'kind' | 'outcome' | 'goal'>, awaitingReview = false) {
  const kind = KIND_LABEL[record.kind];
  const title = awaitingReview
    ? t.notify.awaitingReview
    : record.outcome === 'success'
      ? t.notify.runDone(kind)
      : record.outcome === 'failed'
        ? t.notify.runFailed(kind)
        : t.notify.runStopped(kind);
  return { title, body: record.goal };
}

/**
 * Saves a finished run; failing to save never interrupts the app. With a
 * notice, the user also gets a system notification if Vulgr is in the background.
 */
export async function saveRun(record: RunRecord, notice?: { title: string; body?: string }): Promise<void> {
  if (notice) void window.warpApi?.notify?.({ ...notice, kind: 'run' }).catch(() => {});
  try {
    await window.warpApi?.saveRun?.(record);
    window.dispatchEvent(new Event('vulgr:runs-changed'));
  } catch (err) {
    console.warn('Could not save the run to history:', err);
  }
}

/**
 * Remembers every change of a run's map while `running`, whichever view is on
 * screen, and returns a function that gives the map to save once it is over.
 * A run that starts again begins a new recording.
 */
export function useRunRecorder(graph: { nodes: MapNode[]; edges: MapEdge[] }, running: boolean) {
  const frames = useRef<Snapshot[]>([]);
  const wasRunning = useRef(false);
  // The last map that had nodes: a run that is closed leaves an empty one behind.
  const latest = useRef(graph);
  if (graph.nodes.length > 0) latest.current = graph;

  useEffect(() => {
    if (running && !wasRunning.current) frames.current = [];
    wasRunning.current = running;
    if ((!running && frames.current.length === 0) || graph.nodes.length === 0) return;
    const snap: Snapshot = {
      at: Date.now(),
      nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, n.state ?? 'idle'])),
      edges: Object.fromEntries(graph.edges.map((e, i) => [edgeKey(e, i), e.state ?? 'idle'])),
    };
    const last = frames.current[frames.current.length - 1];
    if (last && JSON.stringify(last.nodes) === JSON.stringify(snap.nodes) && JSON.stringify(last.edges) === JSON.stringify(snap.edges)) return;
    frames.current.push(snap);
  });

  return (): SavedMap => ({
    nodes: latest.current.nodes.map(({ icon: _icon, ...node }) => node),
    edges: latest.current.edges,
    snapshots: frames.current.slice(-400),
  });
}
