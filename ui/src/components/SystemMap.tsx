import React, { useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2, TriangleAlert, X } from 'lucide-react';
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
}> = ({ nodes, edges, height = 240, selected, onSelect, demo }) => {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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
        return (
          <button
            key={node.id}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(node.id)}
            title={node.subtitle ? `${node.title} · ${node.subtitle}` : node.title}
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
            </span>
            <span className="flex-shrink-0">
              <StateBadge state={state} />
            </span>
          </button>
        );
      })}
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
