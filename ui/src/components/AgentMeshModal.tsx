import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Play, RotateCcw, TriangleAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import { Spinner } from '@/components/ui/spinner.js';
import { Switch } from '@/components/ui/switch.js';
import agentSwarmIcon from '../assets/sidebar/agent-swarm.svg';
import appLogo from '../assets/sidebar/logo.svg';
import { AgentLogo } from './AgentLogo.js';
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
  type RoleState,
} from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

export interface AgentMessage {
  id: string;
  runId: string;
  from: string;
  to: string;
  type: string;
  payload: {
    summary: string;
    details?: string;
    gitDiff?: string;
    errorTrace?: string;
    filesChanged?: string[];
  };
  timestamp: string;
}

interface MeshStatus {
  stage: 'checking' | 'planning' | 'building' | 'verifying' | 'diagnosing' | 'repairing' | 'auditing' | 'done' | 'failed';
  agent?: string;
  round: number;
  maxRounds: number;
  text: string;
}

interface MeshResult {
  success: boolean;
  rounds: number;
  audit?: 'approved' | 'rejected' | 'skipped';
  error?: string;
  sandbox?: { worktreePath: string; branchName: string };
}

interface AgentMeshModalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
  onOpenChanges?: () => void;
  onOpenSandboxes?: () => void;
  /** Opens the agent installer, offered when some agents aren't installed. */
  onInstallAgents?: () => void;
}

const AGENTS: AgentOption[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'agy', label: 'Antigravity' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'cursor', label: 'Cursor Agent' },
  { value: 'gemini', label: 'Gemini CLI' },
];

const ROUND_VALUES = ['1', '2', '3', '5'];

type Role = 'tests' | 'code' | 'review';

/** Which card a running stage belongs to. */
const STAGE_ROLE: Partial<Record<MeshStatus['stage'], Role>> = {
  planning: 'tests',
  verifying: 'tests',
  diagnosing: 'tests',
  building: 'code',
  repairing: 'code',
  auditing: 'review',
};

const loadSetting = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`vulgaris.mesh.${key}`) || fallback;
  } catch {
    return fallback;
  }
};
const saveSetting = (key: string, value: string) => {
  try {
    localStorage.setItem(`vulgaris.mesh.${key}`, value);
  } catch {}
};

/** Sender of a feed entry: the agent's logo, or Vulgr's mark for the orchestrator. */
const Sender: React.FC<{ id: string }> = ({ id }) =>
  id === 'orchestrator' ? (
    <span className="flex size-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border border-white/10 bg-[#18181b]">
      <img src={appLogo} alt="Vulgr" className="h-[10px] w-auto" draggable={false} />
    </span>
  ) : (
    <AgentLogo id={id} name={AGENTS.find((a) => a.value === id)?.label ?? id} size={18} />
  );

const TONE: Record<string, string> = {
  VERIFICATION_FAILED: 'bg-red-400',
  SECURITY_CONCERN: 'bg-amber-400',
  VERIFICATION_PASSED: 'bg-emerald-400',
  CONSENSUS_APPROVED: 'bg-emerald-400',
};

export const AgentMeshModal: React.FC<AgentMeshModalProps> = ({
  isOpen,
  onClose,
  cwd,
  onOpenChanges,
  onOpenSandboxes,
  onInstallAgents,
}) => {
  const { t, lang } = useI18n();
  const m = t.mesh;
  const f = t.flow;
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState(() => loadSetting('builder', 'claude'));
  const [verifier, setVerifier] = useState(() => loadSetting('verifier', 'agy'));
  const [auditor, setAuditor] = useState(() => loadSetting('auditor', 'claude'));
  // Empty by default: the checker writes tests from the goal. Earlier versions
  // saved 'npm test' under 'verifyCmd', so the optional override uses a new key.
  const [verifyCmd, setVerifyCmd] = useState(() => loadSetting('testCommand', ''));
  const [maxRounds, setMaxRounds] = useState(() => loadSetting('maxRounds', '3'));
  const [useSandbox, setUseSandbox] = useState(false);
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runGoal, setRunGoal] = useState('');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<MeshStatus | null>(null);
  const [result, setResult] = useState<MeshResult | null>(null);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, result]);

  // Only offer agents that are installed; fall back to the first installed
  // one when a remembered choice isn't available on this machine.
  useEffect(() => {
    if (!isOpen || !window.warpApi?.getAvailableAgents) return;
    window.warpApi.getAvailableAgents().then((map: Record<string, boolean>) => {
      setAvailable(map);
      const firstInstalled = AGENTS.find((a) => map[a.value])?.value;
      if (!firstInstalled) return;
      const fix = (value: string, set: (v: string) => void) => {
        if (!map[value]) set(firstInstalled);
      };
      fix(builder, setBuilder);
      fix(verifier, setVerifier);
      fix(auditor, setAuditor);
    }).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!window.warpApi) return;
    const offEvent = window.warpApi.onMeshEvent((msg: AgentMessage) => setMessages((prev) => [...prev, msg]));
    const offStatus = window.warpApi.onMeshStatus?.((s: MeshStatus) => setStatus(s));
    return () => {
      offEvent?.();
      offStatus?.();
    };
  }, []);

  const installedItems = AGENTS.filter((a) => !available || available[a.value]);
  const missing = available ? AGENTS.filter((a) => !available[a.value]).map((a) => a.label) : [];
  const noneInstalled = available !== null && installedItems.length === 0;
  const cmd = verifyCmd.trim();
  const started = isRunning || result !== null;

  const handleStartMesh = async () => {
    if (!goal.trim() || isRunning || noneInstalled) return;

    saveSetting('builder', builder);
    saveSetting('verifier', verifier);
    saveSetting('auditor', auditor);
    saveSetting('testCommand', cmd);
    saveSetting('maxRounds', maxRounds);

    setIsRunning(true);
    setRunGoal(goal.trim());
    setMessages([]);
    setResult(null);
    setStatus(null);

    try {
      const res: MeshResult = await window.warpApi.runAgentMesh({
        goal: goal.trim(),
        builder,
        verifier,
        auditor,
        verifyCmd: cmd,
        maxRounds: Number(maxRounds) || 3,
        useSandbox,
        cwd,
        lang,
      });
      setResult(res);
      // The dialog shows the result itself; the toast is for when it was closed meanwhile.
      if (!openRef.current) {
        if (res.success) toast.success(res.audit === 'rejected' ? m.toastWarned : m.toastDone);
        else toast.error(m.toastFailed);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      setResult({ success: false, rounds: 0, error: message });
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const newTask = () => {
    setResult(null);
    setMessages([]);
    setStatus(null);
  };

  // Card states while running and after: the active role spins, finished ones get a check.
  const types = new Set(messages.map((msg) => msg.type));
  const activeRole = isRunning && status ? STAGE_ROLE[status.stage] : undefined;
  const roleState = (role: Role): RoleState => {
    if (!started) return 'idle';
    if (activeRole === role) return 'active';
    if (role === 'tests') return types.has('TESTS_WRITTEN') || types.has('VERIFICATION_PASSED') ? 'done' : 'idle';
    if (role === 'code') {
      if (types.has('VERIFICATION_PASSED')) return 'done';
      return result && !result.success ? 'failed' : 'idle';
    }
    if (result?.audit === 'rejected') return 'warn';
    return types.has('CONSENSUS_APPROVED') ? 'done' : 'idle';
  };

  const summary = [cmd ? f.testCmd(cmd) : f.autoTests, f.rounds(Number(maxRounds)), useSandbox ? f.sandboxOn : '']
    .filter(Boolean)
    .join(' · ');

  const resultBox = result && (() => {
    const tone = !result.success
      ? { box: 'border-red-500/30 bg-red-500/[0.06]', icon: <XCircle size={15} className="text-red-400" />, title: m.failedTitle }
      : result.audit === 'rejected'
        ? { box: 'border-amber-500/30 bg-amber-500/[0.06]', icon: <TriangleAlert size={15} className="text-amber-400" />, title: m.rejectedTitle }
        : { box: 'border-emerald-500/30 bg-emerald-500/[0.06]', icon: <CheckCircle2 size={15} className="text-emerald-400" />, title: m.doneTitle(result.rounds) };
    const body = !result.success
      ? result.error || m.unknownError
      : `${result.sandbox ? m.inSandbox : m.inProject}${result.audit === 'rejected' ? m.auditorNotes : ''}`;
    return (
      <div className={`flex gap-2.5 rounded-[11px] border px-3.5 py-3 ${tone.box}`}>
        <span className="mt-px">{tone.icon}</span>
        <div className="min-w-0">
          <p className="text-[12.5px] text-zinc-100">{tone.title}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-400">{body}</p>
        </div>
      </div>
    );
  })();

  return (
    <Dialog open={isOpen} onOpenChange={closeOnlyOnRequest(onClose)}>
      <DialogContent className={`${FLOW_DIALOG} sm:max-w-[680px]`}>
        <FlowHeader icon={agentSwarmIcon} title="Agent Swarm" subtitle={f.swarmSubtitle} />

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
              <SectionLabel htmlFor="mesh-goal">{f.goal}</SectionLabel>
              <GoalInput
                id="mesh-goal"
                value={goal}
                placeholder={m.goalPlaceholder}
                onChange={setGoal}
                onSubmit={handleStartMesh}
              />
            </div>
          )}

          <div>
            <SectionLabel>{f.flow}</SectionLabel>
            {noneInstalled ? (
              <p className="rounded-[11px] border border-dashed border-zinc-800 px-3.5 py-4 text-center text-[12px] text-zinc-500">
                {f.noAgents}
              </p>
            ) : (
              <div className="flex items-stretch gap-2">
                <RoleCard
                  step={`1 · ${f.stepTests}`}
                  duty={cmd ? f.dutyRunTests : f.dutyWriteTests}
                  value={verifier}
                  options={installedItems}
                  disabled={started}
                  state={roleState('tests')}
                  onChange={setVerifier}
                />
                <FlowArrow />
                <RoleCard
                  step={`2 · ${f.stepCode}`}
                  duty={f.dutyCode}
                  value={builder}
                  options={installedItems}
                  disabled={started}
                  state={roleState('code')}
                  onChange={setBuilder}
                />
                <FlowArrow />
                <RoleCard
                  step={`3 · ${f.stepReview}`}
                  duty={f.dutyReview}
                  value={auditor}
                  options={installedItems}
                  disabled={started}
                  state={roleState('review')}
                  onChange={setAuditor}
                />
              </div>
            )}
          </div>

          {!started && (
            <SettingsDisclosure label={f.settings} summary={summary}>
              <SettingRow
                stacked
                htmlFor="mesh-verify"
                label={f.testLabel}
                hint={f.testHint}
                control={
                  <FlowInput
                    id="mesh-verify"
                    value={verifyCmd}
                    placeholder={f.testPlaceholder}
                    onChange={(e) => setVerifyCmd(e.target.value)}
                  />
                }
              />
              <SettingRow
                label={f.roundsLabel}
                hint={f.roundsHint}
                control={
                  <Segmented
                    value={maxRounds}
                    items={ROUND_VALUES.map((v) => ({ value: v, label: v }))}
                    onChange={setMaxRounds}
                  />
                }
              />
              <SettingRow
                htmlFor="mesh-sandbox"
                label={f.sandboxLabel}
                hint={f.sandboxHint}
                control={<Switch id="mesh-sandbox" checked={useSandbox} onCheckedChange={setUseSandbox} />}
              />
            </SettingsDisclosure>
          )}

          {started && (
            <div>
              <SectionLabel>{f.activity}</SectionLabel>
              <ol className="relative ml-[8px] border-l border-zinc-800">
                {messages.map((msg) => (
                  <li key={msg.id} className="relative pb-3.5 pl-4 last:pb-1">
                    <span
                      className={`absolute -left-[4.5px] top-[7px] size-2 rounded-full ring-4 ring-[var(--base-surface)] ${TONE[msg.type] ?? 'bg-zinc-600'}`}
                    />
                    <div className="flex items-center gap-2">
                      <Sender id={msg.from} />
                      <span className={`text-[10.5px] text-zinc-400 ${MONO}`}>{m.types[msg.type] ?? msg.type}</span>
                      <span className={`ml-auto text-[10px] text-zinc-600 ${MONO}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-200">{msg.payload.summary}</p>
                    {msg.payload.errorTrace && (
                      <pre className={`mt-1.5 max-h-32 overflow-y-auto rounded-[8px] border border-zinc-800 bg-base-app p-2.5 text-[10.5px] whitespace-pre-wrap text-red-300 ${MONO}`}>
                        {msg.payload.errorTrace}
                      </pre>
                    )}
                    {msg.payload.details && msg.type !== 'USER_TASK' && (
                      <details className="group mt-1">
                        <summary className="cursor-pointer list-none text-[11px] text-zinc-500 hover:text-zinc-300">
                          {m.showReply}
                        </summary>
                        <pre className={`mt-1.5 max-h-48 overflow-y-auto rounded-[8px] border border-zinc-800 bg-base-app p-2.5 text-[10.5px] whitespace-pre-wrap text-zinc-300 ${MONO}`}>
                          {msg.payload.details}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
                {isRunning && (
                  <li className="relative pl-4">
                    <span className="absolute -left-[4.5px] top-[7px] size-2 animate-pulse rounded-full bg-primary ring-4 ring-[var(--base-surface)]" />
                    <div className="flex items-center gap-2 text-[12px] text-zinc-300">
                      <span>{status?.text ?? m.running}</span>
                      {status && status.round > 0 && (
                        <span className={`ml-auto text-[10px] text-zinc-600 ${MONO}`}>
                          {m.round(status.round, status.maxRounds)}
                        </span>
                      )}
                    </div>
                  </li>
                )}
              </ol>
            </div>
          )}

          {resultBox}
          <div ref={feedEndRef} />
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
              <Button size="sm" disabled={!goal.trim() || noneInstalled} onClick={handleStartMesh}>
                <Play data-icon="inline-start" />
                {f.start}
              </Button>
            </>
          )}
          {isRunning && (
            <Button size="sm" disabled>
              <Spinner data-icon="inline-start" />
              {m.running}
            </Button>
          )}
          {result && (
            <>
              <Button variant="ghost" size="sm" onClick={newTask}>
                <RotateCcw data-icon="inline-start" />
                {f.newTask}
              </Button>
              {result.sandbox
                ? onOpenSandboxes && (
                    <Button variant="outline" size="sm" onClick={() => { onClose(); onOpenSandboxes(); }}>
                      {m.openSandbox}
                    </Button>
                  )
                : onOpenChanges && (
                    <Button variant="outline" size="sm" onClick={() => { onClose(); onOpenChanges(); }}>
                      {m.reviewChanges}
                    </Button>
                  )}
              <Button size="sm" onClick={onClose}>
                {m.close}
              </Button>
            </>
          )}
        </FlowFooter>
      </DialogContent>
    </Dialog>
  );
};
