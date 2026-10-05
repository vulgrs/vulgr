import React, { useState, useEffect, useRef } from 'react';
import {
  SparklesIcon,
  ShieldIcon,
  BotIcon,
  TerminalIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  SendIcon,
  RefreshCwIcon,
  ZapIcon,
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.js';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Separator } from '@/components/ui/separator.js';
import { Spinner } from '@/components/ui/spinner.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';

export interface AgentMessage {
  id: string;
  runId: string;
  from: 'claude' | 'agy' | 'gemini' | 'codex' | 'orchestrator';
  to: 'claude' | 'agy' | 'gemini' | 'codex' | 'broadcast';
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

interface AgentMeshModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BUILDER_ITEMS: OptionItem[] = [
  { value: 'claude', label: 'Claude Code (Official)' },
  { value: 'agy', label: 'AGY Engine (Official)' },
  { value: 'gemini', label: 'Gemini (Official)' },
  { value: 'codex', label: 'Codex CLI (Official)' },
  { value: 'mock', label: 'Mock Simulator' },
];

const VERIFIER_ITEMS: OptionItem[] = [
  { value: 'agy', label: 'AGY Engine (Official)' },
  { value: 'claude', label: 'Claude Code (Official)' },
  { value: 'codex', label: 'Codex CLI (Official)' },
  { value: 'mock', label: 'Mock Simulator' },
];

const AUDITOR_ITEMS: OptionItem[] = [
  { value: 'gemini', label: 'Gemini (Official)' },
  { value: 'codex', label: 'Codex CLI (Official)' },
  { value: 'claude', label: 'Claude Code (Official)' },
  { value: 'mock', label: 'Mock Simulator' },
];

const AGENT_META: Record<string, { icon: LucideIcon; label: string }> = {
  claude: { icon: SparklesIcon, label: 'Claude Code' },
  agy: { icon: ShieldIcon, label: 'AGY Engine' },
  gemini: { icon: BotIcon, label: 'Gemini CLI' },
  codex: { icon: BotIcon, label: 'Codex CLI' },
  orchestrator: { icon: TerminalIcon, label: 'Orchestrator' },
  broadcast: { icon: TerminalIcon, label: 'Broadcast' },
};

const AgentBadge: React.FC<{ agent: string }> = ({ agent }) => {
  const meta = AGENT_META[agent] ?? { icon: TerminalIcon, label: agent };
  const Icon = meta.icon;
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" />
      {meta.label}
    </Badge>
  );
};

export const AgentMeshModal: React.FC<AgentMeshModalProps> = ({ isOpen, onClose }) => {
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState('claude');
  const [verifier, setVerifier] = useState('agy');
  const [auditor, setAuditor] = useState('gemini');
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!window.warpApi) return;

    const unsubscribe = window.warpApi.onMeshEvent((msg: AgentMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.type === 'CONSENSUS_APPROVED') {
        setIsCompleted(true);
        setIsRunning(false);
        toast.success('Autonomous consensus achieved');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleStartMesh = async () => {
    if (!goal.trim() || isRunning) return;

    setIsRunning(true);
    setMessages([]);
    setIsCompleted(false);
    setError(null);

    try {
      await window.warpApi.runAgentMesh({
        goal: goal.trim(),
        builder,
        verifier,
        auditor,
      });
    } catch (err: any) {
      const message = err.message || String(err);
      setError(message);
      setIsRunning(false);
      toast.error(message);
    }
  };

  const lastSender = messages.length > 0 ? messages[messages.length - 1].from : null;

  const pipeline = [
    { id: 'orchestrator', label: 'Orchestrator', icon: <TerminalIcon data-icon="inline-start" /> },
    { id: builder, label: builder, icon: <SparklesIcon data-icon="inline-start" />, role: 'Builder' },
    { id: verifier, label: verifier, icon: <ShieldIcon data-icon="inline-start" />, role: 'Verifier' },
    { id: auditor, label: auditor, icon: <BotIcon data-icon="inline-start" />, role: 'Auditor' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <ZapIcon data-icon="inline-start" />
              Agent Mesh
            </Badge>
            <Badge variant="outline">Zero Human Intervention</Badge>
          </div>
          <DialogTitle>Autonomous Multi-CLI Agent Mesh</DialogTitle>
          <DialogDescription className="font-mono">
            Asynchronous Inter-CLI Protocol · .ai-bridge/bus/messages.jsonl
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="text-xs text-muted-foreground">Pipeline</span>
          {pipeline.map((node, index) => (
            <React.Fragment key={`${node.role ?? 'lead'}-${node.id}`}>
              {index > 0 && <ArrowRightIcon className="size-3 text-muted-foreground" />}
              <Badge variant={lastSender === node.id ? 'default' : 'secondary'} className="capitalize">
                {node.icon}
                {node.label}
                {node.role ? <span className="text-muted-foreground">({node.role})</span> : null}
              </Badge>
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-b px-4 py-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mesh-goal">Goal</FieldLabel>
              <div className="flex items-center gap-2">
                <InputGroup className="flex-1">
                  <InputGroupAddon>
                    <InputGroupText className="font-mono">❯</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="mesh-goal"
                    value={goal}
                    disabled={isRunning}
                    placeholder="Assign high-level goal (e.g. 'JWT refresh token servisi ekle ve test et')..."
                    className="font-mono"
                    onChange={(e) => setGoal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStartMesh()}
                  />
                </InputGroup>
                <Button disabled={!goal.trim() || isRunning} onClick={handleStartMesh}>
                  {isRunning ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
                  {isRunning ? 'Mesh Running...' : 'Start Autonomous Mesh'}
                </Button>
              </div>
            </Field>
          </FieldGroup>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
            <Field>
              <FieldLabel htmlFor="mesh-builder">Builder</FieldLabel>
              <OptionSelect id="mesh-builder" value={builder} items={BUILDER_ITEMS} disabled={isRunning} onValueChange={setBuilder} />
            </Field>
            <ArrowRightIcon className="mb-2 hidden size-3 text-muted-foreground sm:block" />
            <Field>
              <FieldLabel htmlFor="mesh-verifier">Verifier</FieldLabel>
              <OptionSelect id="mesh-verifier" value={verifier} items={VERIFIER_ITEMS} disabled={isRunning} onValueChange={setVerifier} />
            </Field>
            <ArrowRightIcon className="mb-2 hidden size-3 text-muted-foreground sm:block" />
            <Field>
              <FieldLabel htmlFor="mesh-auditor">Auditor</FieldLabel>
              <OptionSelect id="mesh-auditor" value={auditor} items={AUDITOR_ITEMS} disabled={isRunning} onValueChange={setAuditor} />
            </Field>
          </div>
        </div>

        {error && (
          <div className="px-4 pt-4">
            <Alert variant="destructive">
              <AlertTitle>Mesh failed to start</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <ScrollArea className="min-h-80 flex-1">
          <div className="flex flex-col gap-3 p-4">
            {messages.length === 0 ? (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <RefreshCwIcon className={isRunning ? 'animate-spin' : ''} />
                  </EmptyMedia>
                  <EmptyTitle>Autonomous Inter-CLI Bus Ready</EmptyTitle>
                  <EmptyDescription>
                    Assign a goal above to start the loop. Builder writes code, Verifier executes tests, and Auditor inspects the git diff. If tests fail, patches are sent automatically.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              messages.map((msg) => {
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
                          {msg.type}
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
                  </div>
                );
              })
            )}
            <div ref={feedEndRef} />
          </div>
        </ScrollArea>

        {isCompleted && (
          <>
            <Separator />
            <DialogFooter className="mx-0 mb-0 rounded-none">
              <div className="mr-auto flex items-center gap-2 text-sm">
                <CheckCircle2Icon className="size-4 text-primary" />
                Autonomous consensus achieved. All tests passed and the code was audited.
              </div>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
