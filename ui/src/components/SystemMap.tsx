import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, History, Loader2, Pause, Play, TriangleAlert, X } from 'lucide-react';
import { AgentLogo } from './AgentLogo.js';
import { MONO } from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

/**
 * A live map of how a feature's agents work together: each agent (or step) is a
 * node, each hand-off an edge. Work moving along an edge is drawn as dots
 * flowing in its direction, so you can see who is working and who is next.
 */

export type MapState = 'idle' | 'active' | 'done' | 'warn' | 'failed';

export interface MapNode {
  id: string;
  /** Centre of the node, as a fraction of the map's inner area (0 and 1 keep the node inside the edges). */
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  /** Agent id for the logo; `icon` is used when there is none. */
  agent?: string;
  agentName?: string;
  icon?: React.ReactNode;
  state?: MapState;
  /** Narrow nodes for many tasks in one column. */
  compact?: boolean;
  /** Rough token count of what this agent has written so far, when known. */
  tokens?: number;
}

export interface MapEdge {
  from: string;
  to: string;
  state?: MapState;
  /** Sideways bow of the curve in pixels, e.g. for a loop going back. */
  bend?: number;
  label?: string;
  /** A path taken only sometimes, e.g. "tests failed, back to the writer". */
  dashed?: boolean;
}

const EDGE_COLOR: Record<MapState, string> = {
  idle: 'var(--map-line)',
  active: 'var(--flow-accent, var(--primary))',
  done: 'rgb(52 211 153 / 0.55)',
  warn: 'rgb(251 191 36 / 0.7)',
  failed: 'rgb(248 113 113 / 0.7)',
};

const NODE_FRAME: Record<MapState, string> = {
  idle: 'border-zinc-800 bg-base-elevated',
  active: 'border-[color:var(--flow-accent)] bg-base-elevated shadow-[0_0_0_4px_color-mix(in_oklab,var(--flow-accent)_16%,transparent)]',
  done: 'border-emerald-500/40 bg-base-elevated',
  warn: 'border-amber-500/50 bg-base-elevated',
  failed: 'border-red-500/50 bg-base-elevated',
};

/** One remembered moment of a run: every node's and edge's state. */
interface Snapshot {
  at: number;
  nodes: Record<string, MapState>;
  edges: Record<string, MapState>;
}

const edgeKey = (edge: MapEdge, i: number) => `${edge.from}-${edge.to}-${i}`;

/** "12s", "3m 05s", "1h 02m". */
export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

/** Rough token count of a text: about four characters per token. */
export const estimateTokens = (...texts: (string | undefined)[]) =>
  Math.round(texts.reduce((sum, text) => sum + (text?.length ?? 0), 0) / 4);

const StateBadge: React.FC<{ state: MapState }> = ({ state }) =>
  state === 'active' ? (
    <Loader2 size={11} className="animate-spin text-[color:var(--flow-accent)]" />
  ) : state === 'done' ? (
    <Check size={12} className="text-emerald-400" />
  ) : state === 'warn' ? (
    <TriangleAlert size={11} className="text-amber-400" />
  ) : state === 'failed' ? (
    <X size={12} className="text-red-400" />
  ) : null;

export const SystemMap: React.FC<{
  nodes: MapNode[];
  edges: MapEdge[];
  height?: number;
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** Draws every edge as moving, to explain the flow before a run. */
  demo?: boolean;
  /** Hover text for clickable nodes, e.g. "Open its terminal". */
  selectHint?: string;
}> = ({ nodes: liveNodes, edges: liveEdges, height = 240, selected, onSelect, demo, selectHint }) => {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // How long each node has been working: summed over every time it was active.
  const timing = useRef<Record<string, { start?: number; total: number }>>({});
  // Every change of state during the run, for playing it back once it is over.
  const history = useRef<Snapshot[]>([]);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const anyActive = liveNodes.some((n) => n.state === 'active');

  useEffect(() => {
    if (demo) {
      timing.current = {};
      history.current = [];
      return;
    }
    const at = Date.now();
    for (const n of liveNodes) {
      const entry = (timing.current[n.id] ??= { total: 0 });
      if (n.state === 'active' && entry.start === undefined) entry.start = at;
      else if (n.state !== 'active' && entry.start !== undefined) {
        entry.total += at - entry.start;
        entry.start = undefined;
      }
    }
    const snap: Snapshot = {
      at,
      nodes: Object.fromEntries(liveNodes.map((n) => [n.id, n.state ?? 'idle'])),
      edges: Object.fromEntries(liveEdges.map((e, i) => [edgeKey(e, i), e.state ?? 'idle'])),
    };
    const last = history.current[history.current.length - 1];
    const same = last && JSON.stringify(last.nodes) === JSON.stringify(snap.nodes) && JSON.stringify(last.edges) === JSON.stringify(snap.edges);
    if (!same) {
      // A new run starting from scratch clears the last one's record.
      if (last && !Object.values(last.nodes).includes('active') && Object.values(snap.nodes).every((s) => s === 'idle')) {
        history.current = [];
        timing.current = {};
      }
      history.current.push(snap);
    }
  });

  // Tick the timers while someone is working.
  useEffect(() => {
    if (demo || !anyActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [demo, anyActive]);

  // A run that starts again leaves the replay.
  useEffect(() => {
    if (anyActive) {
      setReplayAt(null);
      setPlaying(false);
    }
  }, [anyActive]);

  // Step through the recorded moments while playing.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setReplayAt((i) => {
        const next = (i ?? -1) + 1;
        if (next >= history.current.length - 1) {
          setPlaying(false);
          return history.current.length - 1;
        }
        return next;
      });
    }, 700);
    return () => window.clearInterval(id);
  }, [playing]);

  const snap = replayAt !== null ? history.current[replayAt] : undefined;
  const nodes = snap ? liveNodes.map((n) => ({ ...n, state: snap.nodes[n.id] ?? 'idle' })) : liveNodes;
  const edges = snap ? liveEdges.map((e, i) => ({ ...e, state: snap.edges[edgeKey(e, i)] ?? 'idle' })) : liveEdges;
  const canReplay = !demo && !anyActive && history.current.length >= 3;
  const runStart = history.current[0]?.at ?? 0;

  const elapsed = (id: string) => {
    const entry = timing.current[id];
    if (!entry) return 0;
    return entry.total + (entry.start !== undefined ? now - entry.start : 0);
  };

  // While running, say in words who is working (or where it stopped), not only with the glow.
  const titlesIn = (state: MapState) =>
    nodes
      .filter((n) => n.state === state)
      .map((n) => n.title)
      .join(', ');
  const working = demo ? '' : titlesIn('active');
  const stopped = demo || working ? '' : titlesIn('failed');

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Node centres stay far enough from the edges that the widest node fits.
  const PAD_X = Math.min(92, width / 6);
  const PAD_Y = 30;
  const px = (x: number) => PAD_X + x * (width - 2 * PAD_X);
  const py = (y: number) => PAD_Y + y * (height - 2 * PAD_Y);
  const pos = (id: string) => {
    const n = nodes.find((node) => node.id === id);
    return n ? { x: px(n.x), y: py(n.y) } : null;
  };

  return (
    <div
      ref={boxRef}
      className="relative overflow-hidden rounded-[12px] border border-zinc-900 bg-base-app [--map-line:var(--color-zinc-800)] bg-[radial-gradient(circle,var(--map-dot)_1px,transparent_1px)] [--map-dot:rgb(255_255_255/0.05)] [.light_&]:[--map-dot:rgb(0_0_0/0.06)] [background-size:16px_16px]"
      style={{ height }}
    >
      {width > 0 && (
        <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
          {edges.map((edge, i) => {
            const a = pos(edge.from);
            const b = pos(edge.to);
            if (!a || !b) return null;
            const state = edge.state ?? 'idle';
            const moving = state === 'active' || (demo && state === 'idle');
            // Bow the curve sideways around the straight line between the two nodes.
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const bend = edge.bend ?? 0;
            const cx = mx + (-(b.y - a.y) / len) * bend;
            const cy = my + ((b.x - a.x) / len) * bend;
            const d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
            const color = moving && demo && state === 'idle' ? 'color-mix(in oklab, var(--flow-accent) 55%, transparent)' : EDGE_COLOR[state];
            return (
              <g key={`${edge.from}-${edge.to}-${i}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={moving ? 'var(--map-line)' : color}
                  strokeWidth={1.5}
                  strokeDasharray={edge.dashed && !moving ? '4 5' : undefined}
                />
                {moving && (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeDasharray="1 11"
                    className="animate-map-flow"
                  />
                )}
                {/* A label needs room between the two nodes, which are up to ~170px wide. */}
                {edge.label && len > 200 && (
                  <text
                    x={(a.x + 2 * cx + b.x) / 4}
                    y={(a.y + 2 * cy + b.y) / 4 - 6}
                    textAnchor="middle"
                    className="fill-zinc-500 text-[9.5px]"
                    style={{ fontFamily: 'Geist Mono, ui-monospace, monospace' }}
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {(working || stopped) && (
        <div
          role="status"
          className={`absolute left-2.5 top-2.5 z-10 flex max-w-[60%] items-center gap-1.5 rounded-full border bg-base-elevated/90 px-2.5 py-1 text-[10.5px] backdrop-blur ${
            working ? 'border-[color:var(--flow-accent)]/40 text-zinc-200' : 'border-red-500/40 text-red-300'
          }`}
        >
          <span
            className={`size-1.5 flex-shrink-0 rounded-full ${working ? 'animate-pulse bg-[color:var(--flow-accent)]' : 'bg-red-400'}`}
          />
          <span className="truncate">{working ? t.flow.mapWorking(working) : t.flow.mapStopped(stopped)}</span>
        </div>
      )}

      {nodes.map((node) => {
        const state = node.state ?? 'idle';
        const clickable = !!onSelect;
        const time = elapsed(node.id);
        return (
          <button
            key={node.id}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(node.id)}
            title={[node.title, node.subtitle, clickable ? selectHint : undefined].filter(Boolean).join(' · ')}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[10px] border text-left transition-[border-color,box-shadow] duration-300 ${
              node.compact ? 'max-w-[150px] px-2 py-1.5' : 'max-w-[170px] px-2.5 py-2'
            } ${NODE_FRAME[state]} ${selected === node.id ? 'ring-1 ring-zinc-400' : ''} ${
              clickable ? 'cursor-pointer hover:border-zinc-600' : 'cursor-default'
            }`}
            style={{ left: width ? px(node.x) : `${node.x * 100}%`, top: py(node.y) }}
          >
            {node.agent ? (
              <AgentLogo id={node.agent} name={node.agentName ?? node.agent} size={node.compact ? 16 : 20} dim={state === 'idle' && !demo} />
            ) : (
              node.icon && (
                <span
                  className={`flex flex-shrink-0 items-center justify-center rounded-[6px] border border-zinc-800 bg-base-app text-zinc-400 ${
                    node.compact ? 'size-4' : 'size-5'
                  }`}
                >
                  {node.icon}
                </span>
              )
            )}
            <span className="min-w-0">
              <span className={`block truncate text-zinc-100 ${node.compact ? 'text-[11px]' : 'text-[12px]'}`}>{node.title}</span>
              {node.subtitle && (
                <span className={`block truncate text-[9.5px] text-zinc-500 ${MONO}`}>{node.subtitle}</span>
              )}
              {!demo && (time >= 1000 || !!node.tokens) && (
                <span
                  className={`block truncate text-[9px] tabular-nums text-zinc-500 ${MONO}`}
                  title={node.tokens ? t.flow.tokensHint : undefined}
                >
                  {[time >= 1000 ? formatDuration(time) : '', node.tokens ? t.flow.tokensEstimate(formatTokens(node.tokens)) : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </span>
            <span className="flex-shrink-0">
              <StateBadge state={state} />
            </span>
          </button>
        );
      })}

      {canReplay && (
        <div className="absolute bottom-2 right-2.5 z-10 flex items-center gap-2 rounded-full border border-zinc-800 bg-base-elevated/90 px-2 py-1 text-[10.5px] text-zinc-400 backdrop-blur">
          {replayAt === null ? (
            <button
              type="button"
              onClick={() => {
                setReplayAt(0);
                setPlaying(true);
              }}
              className="flex items-center gap-1 rounded px-1 transition-colors hover:text-zinc-100"
            >
              <History size={11} />
              {t.flow.replay}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!playing && replayAt >= history.current.length - 1) setReplayAt(0);
                  setPlaying((p) => !p);
                }}
                className="rounded p-0.5 transition-colors hover:text-zinc-100"
                aria-label={playing ? t.flow.replayPause : t.flow.replay}
              >
                {playing ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <input
                type="range"
                min={0}
                max={history.current.length - 1}
                value={replayAt}
                onChange={(e) => {
                  setPlaying(false);
                  setReplayAt(Number(e.target.value));
                }}
                aria-label={t.flow.replayStep(replayAt + 1, history.current.length)}
                className="h-1 w-24 cursor-pointer accent-[color:var(--flow-accent,var(--primary))]"
              />
              <span className={`tabular-nums ${MONO}`}>+{formatDuration((snap?.at ?? runStart) - runStart)}</span>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setReplayAt(null);
                }}
                className="rounded p-0.5 transition-colors hover:text-zinc-100"
                aria-label={t.flow.replayExit}
                title={t.flow.replayExit}
              >
                <X size={11} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** List / System switch for a flow dialog's header. */
export const ViewToggle: React.FC<{
  value: 'list' | 'map';
  onChange: (value: 'list' | 'map') => void;
  labels: { list: string; map: string };
}> = ({ value, onChange, labels }) => (
  <div className="flex rounded-[8px] border border-zinc-800 bg-base-app p-0.5">
    {(['list', 'map'] as const).map((v) => (
      <button
        key={v}
        type="button"
        onClick={() => onChange(v)}
        className={`rounded-[6px] px-2.5 py-1 text-[11px] transition-colors ${
          value === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {labels[v]}
      </button>
    ))}
  </div>
);
