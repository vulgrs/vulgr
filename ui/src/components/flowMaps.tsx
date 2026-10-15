import React from 'react';
import { Flag, FlaskConical, User } from 'lucide-react';
import type { MapEdge, MapNode, MapState } from './SystemMap.js';
import type { Messages } from '../i18n/index.js';

/**
 * The system maps of the three flows: where each agent sits and which way
 * the work moves at the current step. Pure functions of the run's state.
 */

type Flow = Messages['flow'];
type Graph = { nodes: MapNode[]; edges: MapEdge[] };

const labelOf = (agents: { value: string; label: string }[], id: string) => agents.find((a) => a.value === id)?.label ?? id;

// ── Duo Loop ────────────────────────────────────────────────────────────────

export interface DuoMapInput {
  builder: string;
  verifier: string;
  /** SquadPhase, or undefined before a run. */
  phase?: string;
  round?: number;
  maxRounds?: number;
  verifyCmd?: string;
}

export function duoMap(input: DuoMapInput, f: Flow, agents: { value: string; label: string }[]): Graph {
  const { builder, verifier, phase } = input;
  const shell = verifier === 'shell';
  const failed = phase === 'failed';
  const done = phase === 'consensus';
  const is = (...p: string[]) => !!phase && p.includes(phase);

  const writerState: MapState = is('building', 'repairing') ? 'active' : done ? 'done' : 'idle';
  const testState: MapState = is('verifying') ? 'active' : done ? 'done' : 'idle';
  const checkerState: MapState = is('planning', 'handing_off', 'reviewing') ? 'active' : done ? 'done' : 'idle';

  const nodes: MapNode[] = [
    {
      id: 'writer',
      x: 0,
      y: 0.45,
      title: labelOf(agents, builder),
      subtitle: `${f.leftPane} · ${f.writer}`,
      agent: builder,
      agentName: labelOf(agents, builder),
      state: writerState,
    },
    {
      id: 'tests',
      x: 0.5,
      y: 0,
      title: f.testsNode,
      subtitle: input.verifyCmd || f.autoTests,
      icon: <FlaskConical size={11} />,
      state: testState,
    },
    {
      id: 'done',
      x: 0.5,
      y: 1,
      title: f.doneNode,
      icon: <Flag size={11} />,
      state: done ? 'done' : failed ? 'failed' : 'idle',
    },
  ];
  if (!shell) {
    nodes.push({
      id: 'checker',
      x: 1,
      y: 0.45,
      title: labelOf(agents, verifier),
      subtitle: `${f.rightPane} · ${f.checker}`,
      agent: verifier,
      agentName: labelOf(agents, verifier),
      state: checkerState,
    });
  }

  const edge = (from: string, to: string, active: boolean, extra: Partial<MapEdge> = {}): MapEdge => ({
    from,
    to,
    state: active ? 'active' : 'idle',
    ...extra,
  });

  const edges: MapEdge[] = shell
    ? [
        edge('writer', 'tests', is('verifying'), { label: f.edgeCode, bend: -30 }),
        edge('tests', 'writer', is('repairing'), { label: f.edgeFail, bend: -30, dashed: true }),
        edge('tests', 'done', done, { label: f.edgePass, bend: 0 }),
      ]
    : [
        edge('checker', 'writer', is('building') && (input.round ?? 1) === 1 && !!phase, { label: f.edgeTestsReady, bend: 0, dashed: true }),
        edge('writer', 'tests', is('verifying'), { label: f.edgeCode, bend: -30 }),
        edge('tests', 'checker', is('handing_off', 'reviewing'), { label: f.edgeResult, bend: -30 }),
        edge('checker', 'writer', is('repairing'), { label: f.edgeFeedback, bend: -60, dashed: true }),
        edge('checker', 'done', done, { bend: 30 }),
      ];
  if (done) edges.forEach((e) => (e.to === 'done' ? (e.state = 'done') : undefined));
  return { nodes, edges };
}

// ── Agent Swarm ─────────────────────────────────────────────────────────────

export interface SwarmMapInput {
  verifier: string;
  builder: string;
  auditor: string;
  /** MeshStatus stage, or undefined before a run. */
  stage?: string;
  /** Message types seen so far. */
  seen: Set<string>;
  result?: { success: boolean; audit?: string } | null;
}

export function swarmMap(input: SwarmMapInput, f: Flow, agents: { value: string; label: string }[]): Graph {
  const { stage, seen, result } = input;
  const is = (...s: string[]) => !!stage && !result && s.includes(stage);
  const finished = !!result;

  const testsState: MapState = is('planning', 'verifying', 'diagnosing')
    ? 'active'
    : seen.has('VERIFICATION_PASSED') || seen.has('TESTS_WRITTEN')
      ? 'done'
      : 'idle';
  const codeState: MapState = is('building', 'repairing')
    ? 'active'
    : seen.has('VERIFICATION_PASSED')
      ? 'done'
      : finished && !result?.success
        ? 'failed'
        : 'idle';
  const reviewState: MapState = is('auditing')
    ? 'active'
    : result?.audit === 'rejected'
      ? 'warn'
      : seen.has('CONSENSUS_APPROVED')
        ? 'done'
        : 'idle';

  const nodes: MapNode[] = [
    { id: 'goal', x: 0, y: 0.5, title: f.goalNode, icon: <User size={11} />, state: stage ? 'done' : 'idle' },
    {
      id: 'tests',
      x: 0.34,
      y: 0,
      title: labelOf(agents, input.verifier),
      subtitle: `1 · ${f.stepTests}`,
      agent: input.verifier,
      agentName: labelOf(agents, input.verifier),
      state: testsState,
    },
    {
      id: 'code',
      x: 0.34,
      y: 1,
      title: labelOf(agents, input.builder),
      subtitle: `2 · ${f.stepCode}`,
      agent: input.builder,
      agentName: labelOf(agents, input.builder),
      state: codeState,
    },
    {
      id: 'review',
      x: 0.7,
      y: 0.5,
      title: labelOf(agents, input.auditor),
      subtitle: `3 · ${f.stepReview}`,
      agent: input.auditor,
      agentName: labelOf(agents, input.auditor),
      state: reviewState,
    },
    {
      id: 'done',
      x: 1,
      y: 0.5,
      title: f.doneNode,
      icon: <Flag size={11} />,
      state: finished ? (result?.success ? (result.audit === 'rejected' ? 'warn' : 'done') : 'failed') : 'idle',
    },
  ];

  const on = (active: boolean, done = false): MapState => (active ? 'active' : done ? 'done' : 'idle');
  const edges: MapEdge[] = [
    { from: 'goal', to: 'tests', state: on(is('checking', 'planning'), testsState !== 'idle'), label: f.edgeTask, bend: 20 },
    { from: 'tests', to: 'code', state: on(is('building', 'repairing')), label: f.edgeTestsReady, bend: 40 },
    { from: 'code', to: 'tests', state: on(is('verifying')), label: f.edgeCode, bend: 40 },
    { from: 'tests', to: 'review', state: on(is('auditing'), reviewState !== 'idle'), label: f.edgePass, bend: -20 },
    { from: 'review', to: 'code', state: on(false), label: f.edgeChanges, bend: -20, dashed: true },
    { from: 'review', to: 'done', state: on(false, finished && !!result?.success), bend: 0 },
  ];
  return { nodes, edges };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface OrchestraMapTask {
  id: string;
  title: string;
  agent: string;
  state: string;
}

export interface OrchestraMapInput {
  planner: string;
  reviewer: string;
  /** Worker agents chosen, drawn as placeholder tasks until the plan exists. */
  workers: string[];
  tasks: OrchestraMapTask[];
  phase?: string | null;
  review?: 'approved' | 'rejected' | 'skipped';
  /** Waiting for the developer, or what they decided. */
  pending?: boolean;
  decision?: 'applied' | 'discarded' | 'pr' | null;
}

const BUSY = ['running', 'testing', 'fixing', 'merging'];

export function orchestraMap(
  input: OrchestraMapInput,
  f: Flow,
  o: Messages['orchestra'],
  agents: { value: string; label: string }[]
): Graph {
  const { phase, tasks } = input;
  const order = ['checking', 'planning', 'working', 'integrating', 'reviewing', 'awaiting-review', 'done'];
  const at = phase ? order.indexOf(phase) : -1;
  const past = (p: string) => at > order.indexOf(p) || phase === 'done';
  const ended = phase === 'failed' || phase === 'stopped';

  const plannerState: MapState = phase === 'planning' || phase === 'checking' ? 'active' : past('planning') ? 'done' : ended && at < 0 ? 'failed' : 'idle';
  const reviewerState: MapState =
    phase === 'integrating' || phase === 'reviewing'
      ? 'active'
      : past('reviewing')
        ? input.review === 'rejected'
          ? 'warn'
          : 'done'
        : 'idle';
  const youState: MapState = input.decision ? 'done' : input.pending ? 'active' : 'idle';

  const shown: OrchestraMapTask[] = tasks.length
    ? tasks
    : input.workers.map((w, i) => ({ id: `w${i}`, title: o.taskNode(i + 1), agent: w, state: 'waiting' }));
  const n = shown.length;
  const many = n > 4;
  const ys = shown.map((_, i) => (n === 1 ? 0.5 : i / (n - 1)));

  const nodes: MapNode[] = [
    {
      id: 'planner',
      x: 0,
      y: 0.5,
      title: labelOf(agents, input.planner),
      subtitle: o.plannerNode,
      agent: input.planner,
      agentName: labelOf(agents, input.planner),
      state: plannerState,
    },
    ...shown.map(
      (task, i): MapNode => ({
        id: task.id,
        x: 0.36,
        y: ys[i],
        title: task.title,
        subtitle: labelOf(agents, task.agent),
        agent: task.agent,
        agentName: labelOf(agents, task.agent),
        compact: many,
        state: BUSY.includes(task.state) ? 'active' : task.state === 'done' ? 'done' : task.state === 'failed' ? 'failed' : 'idle',
      })
    ),
    {
      id: 'reviewer',
      x: 0.72,
      y: 0.5,
      title: labelOf(agents, input.reviewer),
      subtitle: o.reviewerNode,
      agent: input.reviewer,
      agentName: labelOf(agents, input.reviewer),
      state: reviewerState,
    },
    { id: 'you', x: 1, y: 0.5, title: f.you, icon: <User size={11} />, state: youState },
  ];

  const edges: MapEdge[] = [];
  shown.forEach((task, i) => {
    const bend = (0.5 - ys[i]) * 60;
    edges.push({
      from: 'planner',
      to: task.id,
      state: phase === 'planning' ? 'active' : past('planning') ? 'done' : 'idle',
      bend,
      label: i === 0 && !many ? f.edgeSplit : undefined,
    });
    edges.push({
      from: task.id,
      to: 'reviewer',
      state: task.state === 'merging' ? 'active' : task.state === 'done' ? 'done' : task.state === 'failed' ? 'failed' : 'idle',
      bend: -bend,
      label: i === n - 1 && !many ? f.edgeMerge : undefined,
    });
  });
  edges.push({
    from: 'reviewer',
    to: 'you',
    state: phase === 'reviewing' || phase === 'awaiting-review' ? 'active' : input.decision ? 'done' : 'idle',
  });
  return { nodes, edges };
}
