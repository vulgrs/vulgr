import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import duoLoopIcon from '../assets/sidebar/duo-loop.svg';
import { SystemMap, ViewToggle } from './SystemMap.js';
import { duoMap } from './flowMaps.js';
import {
  ACCENT,
  ACCENT_BUTTON,
  FLOW_DIALOG,
  FlowFooter,
  FlowHeader,
  FlowInput,
  GoalInput,
  Kbd,
  LoopRing,
  MissingAgents,
  PaneFrame,
  RoleCard,
  SectionLabel,
  Segmented,
  SettingRow,
  SettingsDisclosure,
  accentStyle,
  isMac,
  closeOnlyOnRequest,
  type AgentOption,
} from './FlowParts.js';
import type { SessionType } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';
import { useProjectTestCommand } from '../hooks/useProjectTestCommand.js';

interface LiveSquadModalProps {
  isOpen: boolean;
  /** The project folder, for its own test command from Settings. */
  cwd?: string;
  onClose: () => void;
  onLaunchSquad: (config: {
    goal: string;
    builder: SessionType;
    verifier: SessionType;
    verifyCmd: string;
    maxRounds: number;
  }) => void;
  /** Opens the agent installer, offered when some agents aren't installed. */
  onInstallAgents?: () => void;
}

const AGENT_ITEMS: AgentOption[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'agy', label: 'Antigravity' },
  { value: 'codex', label: 'Codex CLI' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'cursor', label: 'Cursor Agent' },
];

const ROUND_VALUES = ['2', '3', '5'];

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

export const LiveSquadModal: React.FC<LiveSquadModalProps> = ({ isOpen, cwd, onClose, onLaunchSquad, onInstallAgents }) => {
  const { t } = useI18n();
  const f = t.flow;
  const d = t.modals.duo;
  const [goal, setGoal] = useState('');
  const [builder, setBuilder] = useState(() => load('builder', 'claude'));
  const [verifier, setVerifier] = useState(() => load('verifier', 'agy'));
  // Empty by default: the checker writes tests from the goal. Earlier versions
  // saved 'npm test' under 'verifyCmd', so the optional override uses a new key.
  const [verifyCmd, setVerifyCmd] = useState(() => load('testCommand', ''));
  useProjectTestCommand(isOpen, cwd, verifyCmd, setVerifyCmd);
  const [maxRounds, setMaxRounds] = useState(() => load('maxRounds', '3'));
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);
  const [view, setView] = useState<'list' | 'map'>(() => (load('view', 'list') === 'map' ? 'map' : 'list'));

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
  const verifierItems: AgentOption[] = [...installed, { value: 'shell', label: f.terminalOnly }];
  const missing = available ? AGENT_ITEMS.filter((a) => !available[a.value]).map((a) => a.label) : [];
  const noBuilder = available !== null && installed.length === 0;
  const cmd = verifyCmd.trim();

  const handleSubmit = () => {
    if (!goal.trim() || noBuilder) return;
    save('builder', builder);
    save('verifier', verifier);
    save('testCommand', cmd);
    save('maxRounds', maxRounds);

    onLaunchSquad({
      goal: goal.trim(),
      builder: builder as SessionType,
      verifier: verifier as SessionType,
      verifyCmd: cmd,
      maxRounds: Number(maxRounds) || 3,
    });
    setGoal('');
    onClose();
  };

  const checkerDuty = verifier === 'shell' ? f.dutyShell : cmd ? f.dutyCheckerCmd : f.dutyCheckerAuto;
  const summary = [cmd ? f.testCmd(cmd) : f.autoTests, f.rounds(Number(maxRounds))].join(' · ');

  return (
    <Dialog open={isOpen} onOpenChange={closeOnlyOnRequest(onClose)}>
      <DialogContent className={`${FLOW_DIALOG} sm:max-w-[600px]`} style={accentStyle(ACCENT.duo)}>
        <FlowHeader
          icon={duoLoopIcon}
          title="Duo Loop"
          subtitle={f.duoSubtitle}
          actions={
            <ViewToggle
              value={view}
              labels={{ list: f.viewList, map: f.viewMap }}
              onChange={(v) => {
                setView(v);
                save('view', v);
              }}
            />
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <div>
            <SectionLabel htmlFor="squad-goal">{f.goal}</SectionLabel>
            <GoalInput
              id="squad-goal"
              value={goal}
              placeholder={d.goalPlaceholder}
              onChange={setGoal}
              onSubmit={handleSubmit}
            />
          </div>

          <div>
            <SectionLabel>{f.flow}</SectionLabel>
            {noBuilder ? (
              <p className="rounded-[11px] border border-dashed border-zinc-800 px-3.5 py-4 text-center text-[12px] text-zinc-500">
                {f.noAgents}
              </p>
            ) : view === 'map' ? (
              <>
                <SystemMap {...duoMap({ builder, verifier, verifyCmd: cmd }, f, verifierItems)} height={230} demo />
                <p className="mt-2 text-[11px] text-zinc-500">{f.mapIntro}</p>
              </>
            ) : (
              <div className="flex items-stretch gap-2">
                <PaneFrame title={f.leftPane}>
                  <RoleCard step={f.writer} duty={f.dutyWriter} value={builder} options={installed} onChange={setBuilder} />
                </PaneFrame>
                <LoopRing label={`×${maxRounds}`} />
                <PaneFrame title={f.rightPane}>
                  <RoleCard step={f.checker} duty={checkerDuty} value={verifier} options={verifierItems} onChange={setVerifier} />
                </PaneFrame>
              </div>
            )}
          </div>

          <SettingsDisclosure label={f.settings} summary={summary}>
            <SettingRow
              stacked
              htmlFor="squad-verify"
              label={f.testLabel}
              hint={f.testHint}
              control={
                <FlowInput
                  id="squad-verify"
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
          </SettingsDisclosure>
        </div>

        <FlowFooter
          left={
            missing.length > 0 ? (
              <MissingAgents names={missing} text={f.notInstalled} action={f.install} onInstall={onInstallAgents && (() => { onClose(); onInstallAgents(); })} />
            ) : (
              <>
                <Kbd>{isMac ? '⌘' : 'Ctrl'} ↵</Kbd>
              </>
            )
          }
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            {f.cancel}
          </Button>
          <Button size="sm" className={ACCENT_BUTTON} disabled={!goal.trim() || noBuilder} onClick={handleSubmit}>
            <Play data-icon="inline-start" />
            {f.start}
          </Button>
        </FlowFooter>
      </DialogContent>
    </Dialog>
  );
};
