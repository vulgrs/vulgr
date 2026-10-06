import React, { useState, useEffect, useRef } from 'react';
import {
  SparklesIcon,
  ShieldIcon,
  BotIcon,
  TerminalIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  SendIcon,
  ZapIcon,
  AlertTriangleIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Spinner } from '@/components/ui/spinner.js';
import { Switch } from '@/components/ui/switch.js';
import { Textarea } from '@/components/ui/textarea.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import { useI18n } from '../i18n/index.js';

export interface AgentMessage {
  id: string;
  runId: string;
  from: 'claude' | 'agy' | 'gemini' | 'codex' | 'orchestrator';
  to: 'claude' | 'agy' | 'gemini' | 'codex' | 'broadcast' | 'orchestrator';
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
  stage: 'checking' | 'building' | 'verifying' | 'diagnosing' | 'repairing' | 'auditing' | 'done' | 'failed';
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
}

const AGENTS: OptionItem[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'agy', label: 'AGY' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'gemini', label: 'Gemini CLI' },
];

const ROUND_VALUES = [1, 2, 3, 5];

const AGENT_META: Record<string, { icon: LucideIcon; label: string }> = {
  claude: { icon: SparklesIcon, label: 'Claude' },
  agy: { icon: ShieldIcon, label: 'AGY' },
  gemini: { icon: BotIcon, label: 'Gemini' },
  codex: { icon: BotIcon, label: 'Codex' },
  orchestrator: { icon: TerminalIcon, label: 'Vulgr' },
  broadcast: { icon: TerminalIcon, label: '' },
};

const AgentBadge: React.FC<{ agent: string }> = ({ agent }) => {
  const { t } = useI18n();
  const meta = AGENT_META[agent] ?? { icon: TerminalIcon, label: agent };
  const name = agent === 'broadcast' ? t.mesh.everyone : meta.label;
  const Icon = meta.icon;
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" />
      {name}
    </Badge>
  );
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

export const AgentMeshModal: React.FC<AgentMeshModalProps> = ({
  isOpen,
  onClose,
  cwd,
  onOpenChanges,
  onOpenSandboxes,
}) => {
  const { t, lang } = useI18n();
  const m = t.mesh;
  const roundItems: OptionItem[] = ROUND_VALUES.map((n) => ({ value: String(n), label: m.rounds(n) }));
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState(() => loadSetting('builder', 'claude'));
  const [verifier, setVerifier] = useState(() => loadSetting('verifier', 'agy'));
  const [auditor, setAuditor] = useState(() => loadSetting('auditor', 'claude'));
  const [verifyCmd, setVerifyCmd] = useState(() => loadSetting('verifyCmd', 'npm test'));
  const [maxRounds, setMaxRounds] = useState(() => loadSetting('maxRounds', '3'));
  const [useSandbox, setUseSandbox] = useState(false);
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<MeshStatus | null>(null);
  const [result, setResult] = useState<MeshResult | null>(null);

  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

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

  const handleStartMesh = async () => {
    if (!goal.trim() || isRunning || noneInstalled) return;

    saveSetting('builder', builder);
    saveSetting('verifier', verifier);
    saveSetting('auditor', auditor);
    saveSetting('verifyCmd', verifyCmd);
    saveSetting('maxRounds', maxRounds);

    setIsRunning(true);
    setMessages([]);
    setResult(null);
    setStatus(null);

    try {
      const res: MeshResult = await window.warpApi.runAgentMesh({
        goal: goal.trim(),
        builder,
        verifier,
        auditor,
        verifyCmd: verifyCmd.trim() || 'npm test',
        maxRounds: Number(maxRounds) || 3,
        useSandbox,
        cwd,
        lang,
      });
      setResult(res);
      if (res.success) toast.success(res.audit === 'rejected' ? m.toastWarned : m.toastDone);
      else toast.error(m.toastFailed);
    } catch (err: any) {
      const message = err?.message || String(err);
      setResult({ success: false, rounds: 0, error: message });
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  const roleField = (
    id: string,
    title: string,
    help: string,
    value: string,
    onChange: (v: string) => void
  ) => (
    <Field>
      <FieldLabel htmlFor={id}>{title}</FieldLabel>
      <OptionSelect id={id} value={value} items={installedItems} disabled={isRunning || noneInstalled} onValueChange={onChange} />
      <FieldDescription>{help}</FieldDescription>
    </Field>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <ZapIcon data-icon="inline-start" />
              {m.badge}
            </Badge>
            <Badge variant="outline">{m.background}</Badge>
          </div>
          <DialogTitle>{m.title}</DialogTitle>
          <DialogDescription>
            {m.descBefore} <b>{m.descWriter}</b> {m.descMiddle1} <b>{m.descChecker}</b> {m.descMiddle2}{' '}
            <b>{m.descAuditor}</b> {m.descAfter}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 border-b px-4 py-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="mesh-goal">{m.goal}</FieldLabel>
                <Textarea
                  id="mesh-goal"
                  value={goal}
                  disabled={isRunning}
                  rows={2}
                  placeholder={m.goalPlaceholder}
                  onChange={(e) => setGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleStartMesh();
                  }}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                {roleField('mesh-builder', m.builder, m.builderHint, builder, setBuilder)}
                {roleField('mesh-verifier', m.verifier, m.verifierHint, verifier, setVerifier)}
                {roleField('mesh-auditor', m.auditor, m.auditorHint, auditor, setAuditor)}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="mesh-verify">{m.verifyCmd}</FieldLabel>
                  <Input
                    id="mesh-verify"
                    value={verifyCmd}
                    disabled={isRunning}
                    placeholder="npm test"
                    className="font-mono"
                    onChange={(e) => setVerifyCmd(e.target.value)}
                  />
                  <FieldDescription>{m.verifyCmdHint}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="mesh-rounds">{m.maxRounds}</FieldLabel>
                  <OptionSelect id="mesh-rounds" value={maxRounds} items={roundItems} disabled={isRunning} onValueChange={setMaxRounds} />
                </Field>
              </div>

              <Field orientation="horizontal">
                <Switch id="mesh-sandbox" checked={useSandbox} disabled={isRunning} onCheckedChange={setUseSandbox} />
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="mesh-sandbox">{m.sandbox}</FieldLabel>
                  <FieldDescription>
                    {m.sandboxHint}
                  </FieldDescription>
                </div>
              </Field>
            </FieldGroup>

            {missing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {m.missing(missing.join(', '))}
              </p>
            )}
            {noneInstalled && (
              <Alert variant="destructive">
                <XCircleIcon />
                <AlertTitle>{m.noAgentTitle}</AlertTitle>
                <AlertDescription>
                  {m.noAgentHint}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground">{m.ctrlEnter}</span>
              <Button disabled={!goal.trim() || isRunning || noneInstalled} onClick={handleStartMesh}>
                {isRunning ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
                {isRunning ? m.running : m.start}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {messages.length === 0 && !isRunning && !result && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {m.feedEmpty}
              </p>
            )}

            {messages.map((msg) => {
              const isError = msg.type === 'VERIFICATION_FAILED' || msg.type === 'SECURITY_CONCERN';
              const isSuccess = msg.type === 'CONSENSUS_APPROVED' || msg.type === 'VERIFICATION_PASSED';
              return (
                <div key={msg.id} className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AgentBadge agent={msg.from} />
                      <ArrowRightIcon className="size-3 text-muted-foreground" />
                      <AgentBadge agent={msg.to} />
                      <Badge variant={isError ? 'destructive' : isSuccess ? 'default' : 'secondary'}>
                        {m.types[msg.type] ?? msg.type}
                      </Badge>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{msg.payload.summary}</p>
                  {msg.payload.errorTrace && (
                    <pre className="max-h-36 overflow-y-auto rounded-lg bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap text-destructive">
                      {msg.payload.errorTrace}
                    </pre>
                  )}
                  {msg.payload.details && msg.type !== 'USER_TASK' && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">{m.showReply}</summary>
                      <pre className="mt-1.5 max-h-48 overflow-y-auto rounded-lg bg-muted p-2.5 font-mono whitespace-pre-wrap">
                        {msg.payload.details}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}

            {isRunning && status && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                <Spinner />
                <span>{status.text}</span>
                {status.round > 0 && (
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {m.round(status.round, status.maxRounds)}
                  </span>
                )}
              </div>
            )}

            {result && !result.success && (
              <Alert variant="destructive">
                <XCircleIcon />
                <AlertTitle>{m.failedTitle}</AlertTitle>
                <AlertDescription>{result.error || m.unknownError}</AlertDescription>
              </Alert>
            )}
            {result?.success && (
              <Alert>
                {result.audit === 'rejected' ? <AlertTriangleIcon /> : <CheckCircle2Icon />}
                <AlertTitle>
                  {result.audit === 'rejected'
                    ? m.rejectedTitle
                    : m.doneTitle(result.rounds)}
                </AlertTitle>
                <AlertDescription>
                  {result.sandbox
                    ? m.inSandbox
                    : m.inProject}
                  {result.audit === 'rejected' && m.auditorNotes}
                </AlertDescription>
              </Alert>
            )}
            <div ref={feedEndRef} />
          </div>
        </div>

        {result && (
          <DialogFooter className="m-0 rounded-none border-t px-4 py-3">
            {result.sandbox ? (
              onOpenSandboxes && (
                <Button variant="outline" onClick={() => { onClose(); onOpenSandboxes(); }}>
                  {m.openSandbox}
                </Button>
              )
            ) : (
              onOpenChanges && (
                <Button variant="outline" onClick={() => { onClose(); onOpenChanges(); }}>
                  {m.reviewChanges}
                </Button>
              )
            )}
            <Button onClick={onClose}>{m.close}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
