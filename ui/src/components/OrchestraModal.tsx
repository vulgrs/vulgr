import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Loader2, Play, RotateCcw, Square, TriangleAlert, X, XCircle, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import orchestratorIcon from '../assets/sidebar/orchestrator.svg';
import { AgentLogo } from './AgentLogo.js';
import { DiffViewer } from './DiffViewer.js';
import {
  FLOW_DIALOG,
  FlowArrow,
  FlowFooter,
  FlowHeader,
  FlowInput,
  GoalInput,
  Kbd,
  MONO,
  MissingAgents,
  RoleCard,
  SectionLabel,
  Segmented,
  SettingRow,
  SettingsDisclosure,
  isMac,
  closeOnlyOnRequest,
  type AgentOption,
} from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

type TaskState = 'waiting' | 'running' | 'testing' | 'fixing' | 'merging' | 'done' | 'failed' | 'skipped';
type Phase = 'checking' | 'planning' | 'working' | 'integrating' | 'reviewing' | 'awaiting-review' | 'done' | 'failed' | 'stopped';

interface Task {
  id: string;
  title: string;
  description: string;
  files: string[];
  dependsOn: string[];
  agent: string;
  state: TaskState;
  note?: string;
  output?: string;
}

interface Result {
  success: boolean;
  stopped?: boolean;
  tasks: Task[];
  testsPassed?: boolean;
  testCommand?: string;
  review?: 'approved' | 'rejected' | 'skipped';
  reviewNotes?: string;
  applied: boolean;
  sandbox?: unknown;
  pendingReview?: boolean;
  files?: string[];
  error?: string;
}

interface OrchestraModalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
  onOpenChanges?: () => void;
  onOpenSandboxes?: () => void;
  onInstallAgents?: () => void;
}

const AGENTS: AgentOption[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'agy', label: 'Antigravity' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'cursor', label: 'Cursor Agent' },
];
const agentLabel = (id: string) => AGENTS.find((a) => a.value === id)?.label ?? id;

const PHASES = ['planning', 'working', 'integrating', 'reviewing', 'awaiting-review'] as const;
const ACTIVE_STATES: TaskState[] = ['running', 'testing', 'fixing', 'merging'];

const load = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`vulgaris.orchestra.${key}`) || fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(`vulgaris.orchestra.${key}`, value);
  } catch {}
};

const STATE_ICON: Record<TaskState, React.ReactNode> = {
  waiting: <span className="size-1.5 rounded-full bg-zinc-600" />,
  running: <Loader2 size={12} className="animate-spin text-primary" />,
  testing: <Loader2 size={12} className="animate-spin text-primary" />,
  fixing: <Loader2 size={12} className="animate-spin text-amber-400" />,
  merging: <Loader2 size={12} className="animate-spin text-primary" />,
  done: <Check size={13} className="text-emerald-400" />,
  failed: <X size={13} className="text-red-400" />,
  skipped: <Minus size={13} className="text-zinc-500" />,
};

/** Agents picked as workers: logo chips that toggle on and off. */
const WorkerPicker: React.FC<{
  step: string;
  duty: string;
  options: AgentOption[];
  value: string[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
}> = ({ step, duty, options, value, disabled, onChange }) => (
  <div className="min-w-0 flex-[1.4] rounded-[11px] border border-zinc-800 bg-base-elevated/60 px-3 py-2.5">
    <span className={`text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{step}</span>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            title={o.label}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`flex items-center gap-1.5 rounded-[8px] border py-1 pr-2 pl-1 text-[12px] transition-colors ${
              on ? 'border-zinc-600 bg-zinc-800/80 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <AgentLogo id={o.value} name={o.label} size={20} dim={!on} />
            {o.label}
          </button>
        );
      })}
    </div>
    <p className="mt-2 text-[11px] leading-snug text-zinc-500">{duty}</p>
  </div>
);

export const OrchestraModal: React.FC<OrchestraModalProps> = ({
  isOpen,
  onClose,
  cwd,
  onOpenChanges,
  onOpenSandboxes,
  onInstallAgents,
}) => {
  const { t, lang } = useI18n();
  const o = t.orchestra;
  const f = t.flow;
  const [goal, setGoal] = useState('');
  const [planner, setPlanner] = useState(() => load('planner', 'claude'));
  const [workers, setWorkers] = useState<string[]>(() => load('workers', 'claude,agy').split(',').filter(Boolean));
  const [reviewer, setReviewer] = useState(() => load('reviewer', 'claude'));
  const [verifyCmd, setVerifyCmd] = useState(() => load('testCommand', ''));
  const [parallel, setParallel] = useState(() => load('parallel', '3'));
  const [rounds, setRounds] = useState(() => load('rounds', '2'));
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);

  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [runGoal, setRunGoal] = useState('');
  const [phase, setPhase] = useState<Phase | null>(null);
  const [statusText, setStatusText] = useState('');
  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Live view: the task whose code is shown, and what its agent has written so far.
  const [watching, setWatching] = useState<string | null>(null);
  const [liveDiff, setLiveDiff] = useState('');
  // Review: the combined change waits until the developer applies, revises or discards it.
  const [reviewDiff, setReviewDiff] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState<'applied' | 'discarded' | null>(null);
  const [applyFailed, setApplyFailed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [revising, setRevising] = useState(false);
  const busy = running || revising;
  const pending = !!result?.pendingReview && !decision;

  useEffect(() => {
    if (!isOpen || !window.warpApi?.getAvailableAgents) return;
    window.warpApi.getAvailableAgents().then((map: Record<string, boolean>) => {
      setAvailable(map);
      const first = AGENTS.find((a) => map[a.value])?.value;
      if (!first) return;
      if (!map[planner]) setPlanner(first);
      if (!map[reviewer]) setReviewer(first);
      setWorkers((w) => {
        const kept = w.filter((id) => map[id]);
        return kept.length ? kept : [first];
      });
    }).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!window.warpApi?.onOrchestraEvent) return;
    return window.warpApi.onOrchestraEvent((e: any) => {
      if (e.type === 'status') {
        setPhase(e.phase);
        setStatusText(e.text);
      } else if (e.type === 'plan') {
        setSummary(e.summary);
        setTasks(e.tasks);
      } else if (e.type === 'task') {
        setTasks((prev) => prev.map((t) => (t.id === e.id ? { ...t, state: e.state, note: e.note } : t)));
      } else if (e.type === 'output') {
        setTasks((prev) => prev.map((t) => (t.id === e.id ? { ...t, output: e.text } : t)));
      }
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [result, decision]);

  // Follow the first task that starts, so there is code to watch right away.
  useEffect(() => {
    if (!running) return;
    const current = tasks.find((t) => t.id === watching);
    if (current && ACTIVE_STATES.includes(current.state)) return;
    const next = tasks.find((t) => ACTIVE_STATES.includes(t.state));
    if (next && (!current || !ACTIVE_STATES.includes(current.state))) setWatching(next.id);
  }, [tasks, running]);

  useEffect(() => {
    if (!running || !watching || !window.warpApi?.orchestraDiff) return;
    let live = true;
    const poll = () => window.warpApi.orchestraDiff(watching).then((d: string) => live && d && setLiveDiff(d)).catch(() => {});
    setLiveDiff('');
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running, watching]);

  // The combined change to review once the run is waiting for the developer.
  const loadReview = async (files?: string[]) => {
    const d = (await window.warpApi?.orchestraDiff?.().catch(() => '')) || '';
    setReviewDiff(d);
    if (files) setSelected(files);
  };
  useEffect(() => {
    if (result?.pendingReview) void loadReview(result.files ?? []);
  }, [result?.pendingReview]);

  const installed = AGENTS.filter((a) => !available || available[a.value]);
  const missing = available ? AGENTS.filter((a) => !available[a.value]).map((a) => a.label) : [];
  const noneInstalled = available !== null && installed.length === 0;
  const started = running || result !== null;
  const canStart = !!goal.trim() && workers.length > 0 && !noneInstalled;

  const start = async () => {
    if (!canStart || running) return;
    save('planner', planner);
    save('workers', workers.join(','));
    save('reviewer', reviewer);
    save('testCommand', verifyCmd.trim());
    save('parallel', parallel);
    save('rounds', rounds);
    setRunning(true);
    setStopping(false);
    setRunGoal(goal.trim());
    setTasks([]);
    setSummary('');
    setResult(null);
    setDecision(null);
    setApplyFailed(false);
    setFeedback('');
    setFeedbackOpen(false);
    setWatching(null);
    setLiveDiff('');
    setReviewDiff('');
    setPhase('checking');
    try {
      const res: Result = await window.warpApi.runOrchestra({
        goal: goal.trim(),
        planner,
        workers,
        reviewer,
        verifyCmd: verifyCmd.trim(),
        maxParallel: Number(parallel) || 3,
        maxRounds: Number(rounds) || 2,
        cwd,
        lang,
      });
      setResult(res);
      if (res.tasks?.length) setTasks((prev) => res.tasks.map((t) => ({ ...t, output: prev.find((p) => p.id === t.id)?.output })));
    } catch (err: any) {
      setResult({ success: false, tasks: [], applied: false, error: err?.message || String(err) });
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    setStopping(true);
    window.warpApi?.stopOrchestra?.();
  };

  const reset = () => {
    setResult(null);
    setTasks([]);
    setPhase(null);
    setSummary('');
    setDecision(null);
    setReviewDiff('');
    setWatching(null);
  };

  const applySelected = async () => {
    const res = await window.warpApi.applyOrchestra(selected.length === (result?.files?.length ?? 0) ? undefined : selected);
    if (res?.applied) {
      setDecision('applied');
      setPhase('done');
      onOpenChanges?.();
    } else setApplyFailed(true);
  };

  const discard = async () => {
    await window.warpApi.discardOrchestra();
    setDecision('discarded');
    setPhase('done');
  };

  const revise = async () => {
    if (!feedback.trim()) return;
    setRevising(true);
    setFeedbackOpen(false);
    try {
      const res = await window.warpApi.reviseOrchestra(feedback.trim());
      if (res) {
        setResult((r) => (r ? { ...r, ...res } : r));
        await loadReview(res.files ?? []);
      }
      setFeedback('');
    } finally {
      setRevising(false);
    }
  };

  const phaseIndex = phase ? PHASES.indexOf(phase as (typeof PHASES)[number]) : -1;
  const phaseState = (i: number) => {
    if (phase === 'done') return 'done';
    if ((phase === 'failed' || phase === 'stopped') && i >= Math.max(phaseIndex, 0)) return i === Math.max(phaseIndex, 0) ? 'failed' : 'idle';
    if (i < phaseIndex) return 'done';
    if (i === phaseIndex) return 'active';
    return 'idle';
  };

  const settingsSummary = [verifyCmd.trim() ? f.testCmd(verifyCmd.trim()) : '', o.parallel(Number(parallel)), f.rounds(Number(rounds))]
    .filter(Boolean)
    .join(' · ');

  const resultBox = (() => {
    if (!result) return null;
    if (result.stopped) {
      return { tone: 'border-zinc-700 bg-zinc-800/30', icon: <Square size={14} className="text-zinc-400" />, title: o.stoppedTitle, body: o.stoppedBody };
    }
    if (!result.success) {
      return { tone: 'border-red-500/30 bg-red-500/[0.06]', icon: <XCircle size={15} className="text-red-400" />, title: o.failedTitle, body: result.error ?? '' };
    }
    const done = result.tasks.filter((t) => t.state === 'done').length;
    const tests = result.testsPassed === undefined ? o.testsNone : result.testsPassed ? o.testsPassed : o.testsFailed;
    const review = result.review === 'approved' ? o.approved : result.review === 'rejected' ? o.rejected : o.notReviewed;
    const clean = done === result.tasks.length && result.testsPassed !== false && result.review === 'approved';
    if (decision === 'discarded') {
      return { tone: 'border-zinc-700 bg-zinc-800/30', icon: <Square size={14} className="text-zinc-400" />, title: o.discardedTitle, body: o.discardedBody };
    }
    if (decision === 'applied') {
      return {
        tone: 'border-emerald-500/30 bg-emerald-500/[0.06]',
        icon: <CheckCircle2 size={15} className="text-emerald-400" />,
        title: o.appliedTitle,
        body: o.appliedBody(selected.length),
      };
    }
    if (result.pendingReview) {
      return {
        tone: clean ? 'border-primary/40 bg-primary/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]',
        icon: clean ? <CheckCircle2 size={15} className="text-primary" /> : <TriangleAlert size={15} className="text-amber-400" />,
        title: o.readyTitle(done, result.tasks.length, tests, review),
        body: applyFailed ? o.applyFailed : o.reviewHint,
      };
    }
    return {
      tone: clean ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]',
      icon: clean ? <CheckCircle2 size={15} className="text-emerald-400" /> : <TriangleAlert size={15} className="text-amber-400" />,
      title: `${o.resultDone(done, result.tasks.length)} · ${tests} · ${review}`,
      body: result.applied ? o.applied : o.notApplied,
    };
  })();

  return (
    <Dialog open={isOpen} onOpenChange={closeOnlyOnRequest(onClose)}>
      <DialogContent className={`${FLOW_DIALOG} sm:max-w-[720px]`}>
        <FlowHeader icon={orchestratorIcon} title={o.title} subtitle={o.subtitle} />

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {started ? (
            <div>
              <SectionLabel>{f.goalLabel}</SectionLabel>
              <p className="rounded-[11px] border border-zinc-800 bg-base-app px-3.5 py-2.5 text-[12.5px] leading-relaxed text-zinc-200">
                {runGoal}
              </p>
            </div>
          ) : (
            <div>
              <SectionLabel htmlFor="orchestra-goal">{f.goal}</SectionLabel>
              <GoalInput id="orchestra-goal" value={goal} placeholder={o.goalPlaceholder} onChange={setGoal} onSubmit={start} />
            </div>
          )}

          {!started && (
            <>
              <div>
                <SectionLabel>{f.flow}</SectionLabel>
                {noneInstalled ? (
                  <p className="rounded-[11px] border border-dashed border-zinc-800 px-3.5 py-4 text-center text-[12px] text-zinc-500">
                    {f.noAgents}
                  </p>
                ) : (
                  <div className="flex items-stretch gap-2">
                    <RoleCard step={`1 · ${o.stepPlan}`} duty={o.dutyPlan} value={planner} options={installed} onChange={setPlanner} />
                    <FlowArrow />
                    <WorkerPicker
                      step={`2 · ${o.stepWork}`}
                      duty={workers.length ? o.dutyWork : o.pickWorkers}
                      options={installed}
                      value={workers}
                      onChange={setWorkers}
                    />
                    <FlowArrow />
                    <RoleCard step={`3 · ${o.stepReview}`} duty={o.dutyReview} value={reviewer} options={installed} onChange={setReviewer} />
                  </div>
                )}
              </div>

              <SettingsDisclosure label={f.settings} summary={settingsSummary}>
                <SettingRow
                  stacked
                  htmlFor="orchestra-verify"
                  label={f.testLabel}
                  hint={o.testHint}
                  control={
                    <FlowInput
                      id="orchestra-verify"
                      value={verifyCmd}
                      placeholder={f.testPlaceholder}
                      onChange={(e) => setVerifyCmd(e.target.value)}
                    />
                  }
                />
                <SettingRow
                  label={o.parallelLabel}
                  hint={o.parallelHint}
                  control={<Segmented value={parallel} items={['2', '3', '4'].map((v) => ({ value: v, label: v }))} onChange={setParallel} />}
                />
                <SettingRow
                  label={o.roundsLabel}
                  hint={o.roundsHint}
                  control={<Segmented value={rounds} items={['1', '2', '3'].map((v) => ({ value: v, label: v }))} onChange={setRounds} />}
                />
              </SettingsDisclosure>
            </>
          )}

          {started && (
            <>
              <div className="grid grid-cols-5 gap-1.5">
                {PHASES.map((p, i) => {
                  const s = phaseState(i);
                  return (
                    <div key={p} className="flex flex-col gap-1.5">
                      <div
                        className={`h-1 rounded-full ${
                          s === 'done' ? 'bg-emerald-400/70' : s === 'active' ? 'animate-pulse bg-primary' : s === 'failed' ? 'bg-red-400/70' : 'bg-zinc-800'
                        }`}
                      />
                      <span className={`text-[10px] ${s === 'active' ? 'text-zinc-200' : 'text-zinc-500'} ${MONO}`}>{o.phases[p]}</span>
                    </div>
                  );
                })}
              </div>

              {tasks.length > 0 && (
                <div>
                  <SectionLabel>{o.tasks}</SectionLabel>
                  {summary && <p className="mb-2.5 text-[12px] leading-relaxed text-zinc-400">{summary}</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tasks.map((task) => {
                      const deps = task.dependsOn.map((d) => tasks.find((x) => x.id === d)?.title).filter(Boolean) as string[];
                      const active = ['running', 'testing', 'fixing', 'merging'].includes(task.state);
                      return (
                        <button
                          type="button"
                          key={task.id}
                          onClick={() => setWatching(task.id === watching ? null : task.id)}
                          className={`flex min-w-0 flex-col rounded-[11px] border px-3 py-2.5 text-left transition-colors ${
                            watching === task.id && running ? 'ring-1 ring-primary/60 ' : ''
                          }${
                            active
                              ? 'border-primary/50 bg-primary/[0.05]'
                              : task.state === 'failed'
                                ? 'border-red-500/30 bg-red-500/[0.04]'
                                : 'border-zinc-800 bg-base-elevated/60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <AgentLogo id={task.agent} name={agentLabel(task.agent)} size={20} />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-100" title={task.description}>
                              {task.title}
                            </span>
                            <span className="flex size-4 items-center justify-center">{STATE_ICON[task.state]}</span>
                          </div>
                          <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-500 ${MONO}`}>
                            <span className={active ? 'text-zinc-300' : ''}>{o.states[task.state]}</span>
                            {deps.length > 0 && task.state === 'waiting' && <span>· {o.after(deps.join(', '))}</span>}
                            {task.files.length > 0 && <span className="truncate">· {task.files.slice(0, 3).join(', ')}</span>}
                          </div>
                          {(task.note || (active && task.output)) && (
                            <p className={`mt-1.5 line-clamp-2 text-[10.5px] leading-snug ${task.state === 'failed' ? 'text-red-300' : 'text-zinc-500'} ${MONO}`}>
                              {task.note || task.output}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {running && !watching && <p className="mt-2 text-[11px] text-zinc-500">{o.watchHint}</p>}
                </div>
              )}

              {running && watching && tasks.find((t) => t.id === watching) && (() => {
                const task = tasks.find((t) => t.id === watching)!;
                return (
                  <div>
                    <SectionLabel>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                        {o.live} · {task.title}
                      </span>
                    </SectionLabel>
                    <div className="max-h-[360px] overflow-y-auto rounded-[11px] border border-zinc-800 bg-base-app p-2">
                      {liveDiff ? (
                        <DiffViewer diff={liveDiff} />
                      ) : (
                        <p className="px-2 py-6 text-center text-[11.5px] text-zinc-500">{o.watchEmpty}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {running && (
                <div className="flex items-center gap-2 text-[12px] text-zinc-300">
                  <Loader2 size={12} className="animate-spin text-primary" />
                  <span>{stopping ? o.stopping : statusText}</span>
                </div>
              )}

              {revising && (
                <div className="flex items-center gap-2 text-[12px] text-zinc-300">
                  <Loader2 size={12} className="animate-spin text-primary" />
                  <span>{statusText || o.revising}</span>
                </div>
              )}

              {resultBox && (
                <div className={`flex gap-2.5 rounded-[11px] border px-3.5 py-3 ${resultBox.tone}`}>
                  <span className="mt-px">{resultBox.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-zinc-100">{resultBox.title}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-400">{resultBox.body}</p>
                    {result?.reviewNotes && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer list-none text-[11px] text-zinc-500 hover:text-zinc-300">{o.reviewNotes}</summary>
                        <pre className={`mt-1.5 max-h-56 overflow-y-auto rounded-[8px] border border-zinc-800 bg-base-app p-2.5 text-[10.5px] whitespace-pre-wrap text-zinc-300 ${MONO}`}>
                          {result.reviewNotes}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}
              {pending && !revising && (
                <div>
                  <SectionLabel>{o.reviewTitle} · {o.filesLabel(result?.files?.length ?? 0)}</SectionLabel>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {(result?.files ?? []).map((file) => {
                      const on = selected.includes(file);
                      return (
                        <button
                          key={file}
                          type="button"
                          onClick={() => setSelected(on ? selected.filter((x) => x !== file) : [...selected, file])}
                          className={`flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[11px] transition-colors ${MONO} ${
                            on ? 'border-zinc-600 bg-zinc-800/70 text-zinc-100' : 'border-zinc-800 text-zinc-500 line-through'
                          }`}
                        >
                          <span className={`flex size-3 items-center justify-center rounded-[3px] border ${on ? 'border-primary bg-primary' : 'border-zinc-600'}`}>
                            {on && <Check size={9} className="text-white" />}
                          </span>
                          {file}
                        </button>
                      );
                    })}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto rounded-[11px] border border-zinc-800 bg-base-app p-2">
                    <DiffViewer diff={reviewDiff} />
                  </div>
                  {feedbackOpen && (
                    <div className="mt-3">
                      <textarea
                        autoFocus
                        rows={3}
                        value={feedback}
                        placeholder={o.feedbackPlaceholder}
                        onChange={(e) => setFeedback(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void revise();
                        }}
                        className="w-full resize-none rounded-[11px] border border-zinc-800 bg-base-app px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
                      />
                    </div>
                  )}
                </div>
              )}

              <div ref={endRef} />
            </>
          )}
        </div>

        <FlowFooter
          left={
            !started && missing.length > 0 ? (
              <MissingAgents
                names={missing}
                text={f.notInstalled}
                action={f.install}
                onInstall={onInstallAgents && (() => { onClose(); onInstallAgents(); })}
              />
            ) : !started ? (
              <Kbd>{isMac ? '⌘' : 'Ctrl'} ↵</Kbd>
            ) : null
          }
        >
          {!started && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {f.cancel}
              </Button>
              <Button size="sm" disabled={!canStart} onClick={start}>
                <Play data-icon="inline-start" />
                {f.start}
              </Button>
            </>
          )}
          {running && (
            <Button variant="outline" size="sm" disabled={stopping} onClick={stop}>
              <Square data-icon="inline-start" />
              {stopping ? o.stopping : o.stop}
            </Button>
          )}
          {pending && (
            <>
              <Button variant="ghost" size="sm" disabled={revising} onClick={discard}>
                {o.discard}
              </Button>
              {feedbackOpen ? (
                <Button variant="outline" size="sm" disabled={revising || !feedback.trim()} onClick={revise}>
                  {o.sendFeedback}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled={revising} onClick={() => setFeedbackOpen(true)}>
                  {o.requestChanges}
                </Button>
              )}
              <Button size="sm" disabled={revising || selected.length === 0} onClick={applySelected}>
                <Check data-icon="inline-start" />
                {o.applySelected(selected.length)}
              </Button>
            </>
          )}
          {result && !pending && (
            <>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw data-icon="inline-start" />
                {f.newTask}
              </Button>
              {result.success && !result.applied && !result.pendingReview && onOpenSandboxes && (
                <Button variant="outline" size="sm" onClick={() => { onClose(); onOpenSandboxes(); }}>
                  {t.mesh.openSandbox}
                </Button>
              )}
              {result.success && (result.applied || decision === 'applied') && onOpenChanges && (
                <Button variant="outline" size="sm" onClick={() => { onClose(); onOpenChanges(); }}>
                  {t.mesh.reviewChanges}
                </Button>
              )}
              <Button size="sm" onClick={onClose}>
                {t.mesh.close}
              </Button>
            </>
          )}
        </FlowFooter>
      </DialogContent>
    </Dialog>
  );
};
