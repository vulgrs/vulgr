import React, { useState } from 'react';
import { UsersIcon, PlayIcon, CheckCircle2Icon } from 'lucide-react';
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group.js';
import { Input } from '@/components/ui/input.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import type { SessionType } from '../types/warp.js';

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

const BUILDER_ITEMS: OptionItem[] = [
  { value: 'claude', label: 'Claude Code (Official)' },
  { value: 'agy', label: 'AGY Engine (Official)' },
  { value: 'codex', label: 'Codex CLI (Official)' },
];

const VERIFIER_ITEMS: OptionItem[] = [
  { value: 'agy', label: 'AGY Engine (Official)' },
  { value: 'claude', label: 'Claude Code (Official)' },
  { value: 'codex', label: 'Codex CLI (Official)' },
  { value: 'shell', label: 'Native Shell (Bash / PTY)' },
];

const ROUND_ITEMS: OptionItem[] = [
  { value: '2', label: '2 Rounds' },
  { value: '3', label: '3 Rounds' },
  { value: '5', label: '5 Rounds' },
];

export const LiveSquadModal: React.FC<LiveSquadModalProps> = ({
  isOpen,
  onClose,
  onLaunchSquad,
}) => {
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState<SessionType>('claude');
  const [verifier, setVerifier] = useState<SessionType>('agy');
  const [verifyCmd, setVerifyCmd] = useState('npm test');
  const [maxRounds, setMaxRounds] = useState(3);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim()) return;

    onLaunchSquad({
      goal: goal.trim(),
      builder,
      verifier,
      verifyCmd: verifyCmd.trim() || 'npm test',
      maxRounds,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-2 border-b px-4 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <UsersIcon data-icon="inline-start" />
              Squad
            </Badge>
            <Badge variant="outline">2-Way Split Screen</Badge>
          </div>
          <DialogTitle>Live Autonomous Squad</DialogTitle>
          <DialogDescription>
            Interactive real-time terminal handoff and self-repair loop
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="squad-goal">Task / Engineering Goal</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText className="font-mono">❯</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="squad-goal"
                  autoFocus
                  value={goal}
                  placeholder="e.g. Implement JWT refresh token service and run tests..."
                  className="font-mono"
                  onChange={(e) => setGoal(e.target.value)}
                />
              </InputGroup>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="squad-builder">Builder</FieldLabel>
                <OptionSelect
                  id="squad-builder"
                  value={builder}
                  items={BUILDER_ITEMS}
                  onValueChange={(value) => setBuilder(value as SessionType)}
                />
                <FieldDescription>Writes code in the left terminal pane</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="squad-verifier">Verifier</FieldLabel>
                <OptionSelect
                  id="squad-verifier"
                  value={verifier}
                  items={VERIFIER_ITEMS}
                  onValueChange={(value) => setVerifier(value as SessionType)}
                />
                <FieldDescription>Runs tests in the right terminal pane</FieldDescription>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="squad-verify">Verification Command</FieldLabel>
                <Input
                  id="squad-verify"
                  value={verifyCmd}
                  placeholder="npm test"
                  className="font-mono"
                  onChange={(e) => setVerifyCmd(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="squad-rounds">Max Auto-Fix Rounds</FieldLabel>
                <OptionSelect
                  id="squad-rounds"
                  value={String(maxRounds)}
                  items={ROUND_ITEMS}
                  onValueChange={(value) => setMaxRounds(Number(value))}
                />
              </Field>
            </div>
          </FieldGroup>

          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>How the live loop works</AlertTitle>
            <AlertDescription>
              A split-view tab opens. The builder types code live. When it finishes, the verifier runs tests on the right. If a test fails, the stack trace is piped back for self-repair. You can intervene or pause at any moment.
            </AlertDescription>
          </Alert>

          <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!goal.trim()}>
              <PlayIcon data-icon="inline-start" />
              Launch Live Squad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
