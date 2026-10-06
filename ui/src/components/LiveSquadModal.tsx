import React, { useEffect, useState } from 'react';
import { UsersIcon, PlayIcon, InfoIcon, XCircleIcon } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import type { SessionType } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

interface LiveSquadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSquad: (config: {
    goal: string;
    builder: SessionType;
    verifier: SessionType;
    verifyCmd: string;
    maxRounds: number;
  }) => void;
}

const AGENT_ITEMS: OptionItem[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'agy', label: 'AGY' },
  { value: 'codex', label: 'Codex CLI' },
];

const ROUND_VALUES = [2, 3, 5];

const load = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`vulgaris.squad.${key}`) || fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(`vulgaris.squad.${key}`, value);
  } catch {}
};

export const LiveSquadModal: React.FC<LiveSquadModalProps> = ({ isOpen, onClose, onLaunchSquad }) => {
  const { t } = useI18n();
  const d = t.modals.duo;
  const roundItems: OptionItem[] = ROUND_VALUES.map((n) => ({ value: String(n), label: d.rounds(n) }));
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState(() => load('builder', 'claude'));
  const [verifier, setVerifier] = useState(() => load('verifier', 'agy'));
  const [verifyCmd, setVerifyCmd] = useState(() => load('verifyCmd', 'npm test'));
  const [maxRounds, setMaxRounds] = useState(() => load('maxRounds', '3'));
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!isOpen || !window.warpApi?.getAvailableAgents) return;
    window.warpApi.getAvailableAgents().then((map: Record<string, boolean>) => {
      setAvailable(map);
      const first = AGENT_ITEMS.find((a) => map[a.value])?.value;
      if (first && !map[builder]) setBuilder(first);
      if (verifier !== 'shell' && !map[verifier]) setVerifier(first ?? 'shell');
    }).catch(() => {});
  }, [isOpen]);

  const installed = AGENT_ITEMS.filter((a) => !available || available[a.value]);
  const verifierItems: OptionItem[] = [...installed, { value: 'shell', label: d.verifierShellOnly }];
  const missing = available ? AGENT_ITEMS.filter((a) => !available[a.value]).map((a) => a.label) : [];
  const noBuilder = available !== null && installed.length === 0;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim() || noBuilder) return;
    save('builder', builder);
    save('verifier', verifier);
    save('verifyCmd', verifyCmd);
    save('maxRounds', maxRounds);

    onLaunchSquad({
      goal: goal.trim(),
      builder: builder as SessionType,
      verifier: verifier as SessionType,
      verifyCmd: verifyCmd.trim() || 'npm test',
      maxRounds: Number(maxRounds) || 3,
    });
    setGoal('');
    onClose();
  };

  const builderLabel = AGENT_ITEMS.find((a) => a.value === builder)?.label ?? builder;
  const verifierLabel = AGENT_ITEMS.find((a) => a.value === verifier)?.label;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <UsersIcon data-icon="inline-start" />
              {d.badge}
            </Badge>
            <Badge variant="outline">{d.live}</Badge>
          </div>
          <DialogTitle>{d.title}</DialogTitle>
          <DialogDescription>
            {d.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="squad-goal">{d.goal}</FieldLabel>
              <Textarea
                id="squad-goal"
                autoFocus
                rows={2}
                value={goal}
                placeholder={d.goalPlaceholder}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
                }}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="squad-builder">{d.builder}</FieldLabel>
                <OptionSelect id="squad-builder" value={builder} items={installed} disabled={noBuilder} onValueChange={setBuilder} />
                <FieldDescription>{d.builderHint}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="squad-verifier">{d.verifier}</FieldLabel>
                <OptionSelect id="squad-verifier" value={verifier} items={verifierItems} onValueChange={setVerifier} />
                <FieldDescription>{d.verifierHint}</FieldDescription>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="squad-verify">{d.verifyCmd}</FieldLabel>
                <Input
                  id="squad-verify"
                  value={verifyCmd}
                  placeholder="npm test"
                  className="font-mono"
                  onChange={(e) => setVerifyCmd(e.target.value)}
                />
                <FieldDescription>{d.verifyCmdHint}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="squad-rounds">{d.maxRounds}</FieldLabel>
                <OptionSelect id="squad-rounds" value={maxRounds} items={roundItems} onValueChange={setMaxRounds} />
              </Field>
            </div>
          </FieldGroup>

          {missing.length > 0 && !noBuilder && (
            <p className="text-xs text-muted-foreground">{d.missing(missing.join(', '))}</p>
          )}
          {noBuilder && (
            <Alert variant="destructive">
              <XCircleIcon />
              <AlertTitle>{d.noAgentTitle}</AlertTitle>
              <AlertDescription>{d.noAgentHint}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <InfoIcon />
            <AlertTitle>{d.howTitle}</AlertTitle>
            <AlertDescription>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>{d.step1(builderLabel)}</li>
                <li>{d.step2(verifyCmd || 'npm test')}</li>
                <li>
                  {verifierLabel
                    ? d.step3Agent(verifierLabel, builderLabel)
                    : d.step3Shell(builderLabel)}
                </li>
                <li>{d.step4}</li>
              </ol>
            </AlertDescription>
          </Alert>

          <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {d.cancel}
            </Button>
            <Button type="submit" disabled={!goal.trim() || noBuilder}>
              <PlayIcon data-icon="inline-start" />
              {d.start}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
