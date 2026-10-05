import { useState, useRef, useCallback } from 'react';
import type { SquadSession, SessionType, SquadPhase } from '../types/warp.js';

/** Result of one command run in a squad pane (from the shell's exit marker). */
export interface PaneRunResult {
  exitCode: number;
  output: string;
}

export interface SquadDeps {
  /** Run a command in a shell pane and resolve when it has finished. */
  runInPane: (sessionId: string, command: string) => Promise<PaneRunResult>;
  /** Shell command that runs `agent` once, non-interactively, on `prompt`. */
  buildAgentRun: (agent: SessionType, prompt: string, opts: { allowEdits: boolean }) => Promise<string>;
  /** Current uncommitted changes of the project, for the reviewer. */
  getDiff: () => Promise<string>;
  /** Interrupt whatever is running in a pane (Ctrl+C). */
  interrupt: (sessionId: string) => void;
}

export interface SquadConfig {
  goal: string;
  builder: SessionType;
  verifier: SessionType;
  verifyCmd: string;
  maxRounds: number;
}

const AGENT_LABELS: Partial<Record<SessionType, string>> = {
  claude: 'Claude',
  agy: 'AGY',
  codex: 'Codex',
  shell: 'Terminal',
};
export const squadAgentLabel = (type: SessionType) => AGENT_LABELS[type] ?? type;

const tail = (text: string, max: number) => (text.length > max ? `...\n${text.slice(-max)}` : text);

class SquadStopped extends Error {}

/**
 * Two panes, one loop:
 *   builder agent writes code (left) -> verify command runs (right)
 *   -> tests fail: the verifier agent diagnoses, builder fixes, repeat
 *   -> tests pass: the verifier agent reviews the diff; requested changes go
 *      back to the builder, approval ends the squad.
 * Every step waits for the command's real exit code (the shell prompt marker),
 * so nothing depends on guessing when an agent has gone quiet.
 */
export const useSquadOrchestrator = (deps: SquadDeps) => {
  const [squad, setSquad] = useState<SquadSession | null>(null);
  const squadRef = useRef<SquadSession | null>(null);
  squadRef.current = squad;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const runIdRef = useRef(0);
  const pausedRef = useRef(false);

  const update = (patch: Partial<SquadSession>) => setSquad((prev) => (prev ? { ...prev, ...patch } : prev));

  const startSquad = useCallback(
    (config: SquadConfig, tabId: string, builderSessionId: string, verifierSessionId: string) => {
      const runId = ++runIdRef.current;
      pausedRef.current = false;
      const label = squadAgentLabel;
      const verifierIsAgent = config.verifier !== 'shell';

      setSquad({
        active: true,
        tabId,
        builderSessionId,
        verifierSessionId,
        builderType: config.builder,
        verifierType: config.verifier,
        goal: config.goal,
        verifyCmd: config.verifyCmd,
        phase: 'building',
        round: 1,
        maxRounds: config.maxRounds,
        statusText: `${label(config.builder)} kodu yazıyor...`,
      });

      // Throws once this run was stopped or replaced; holds while paused.
      const checkpoint = async () => {
        while (pausedRef.current && runIdRef.current === runId) {
          await new Promise((r) => setTimeout(r, 300));
        }
        if (runIdRef.current !== runId) throw new SquadStopped();
      };
      const step = async (phase: SquadPhase, statusText: string, round?: number) => {
        await checkpoint();
        update({ phase, statusText, ...(round ? { round } : {}) });
      };
      const run = async (sessionId: string, command: string) => {
        const res = await depsRef.current.runInPane(sessionId, command);
        if (runIdRef.current !== runId) throw new SquadStopped();
        return res;
      };
      const runAgent = async (sessionId: string, agent: SessionType, prompt: string, allowEdits: boolean) =>
        run(sessionId, await depsRef.current.buildAgentRun(agent, prompt, { allowEdits }));
      const fail = (error: string) => update({ phase: 'failed', statusText: error, error });

      const builderPrompt = (feedback?: string) =>
        [
          `Goal: ${config.goal}`,
          '',
          feedback
            ? `Your previous attempt is not done yet. Feedback from the reviewer / test run:\n${feedback}\n\nFix these problems.`
            : 'Implement this goal by editing the code in this repository.',
          'Do not ask questions; make reasonable assumptions. Do not run long-lived servers.',
          `Your work will be checked with: ${config.verifyCmd}`,
          'Finish with a short summary of what you changed.',
        ].join('\n');

      void (async () => {
        let feedback: string | undefined;
        let reviewSkipped = false;
        try {
          for (let round = 1; ; round++) {
            // 1. Builder writes / repairs the code.
            if (round > 1) {
              await step('repairing', `${label(config.builder)} geri bildirime göre düzeltiyor (tur ${round}/${config.maxRounds})...`, round);
            }
            const built = await runAgent(builderSessionId, config.builder, builderPrompt(feedback), true);
            if (built.exitCode !== 0) {
              fail(`${label(config.builder)} hata ile durdu. Sol paneldeki çıktıya bakın (kurulu ve giriş yapılmış olmalı).`);
              return;
            }

            // 2. Verify command in the right pane.
            await step('verifying', `"${config.verifyCmd}" çalıştırılıyor (tur ${round}/${config.maxRounds})...`);
            const verified = await run(verifierSessionId, config.verifyCmd);

            if (verified.exitCode === 0) {
              if (!verifierIsAgent) break;

              // 3a. Tests pass: the verifier agent reviews the change.
              await step('reviewing', `Testler geçti. ${label(config.verifier)} değişiklikleri inceliyor...`);
              const diff = tail(await depsRef.current.getDiff(), 20000);
              const review = await runAgent(
                verifierSessionId,
                config.verifier,
                [
                  `Another agent implemented this goal: ${config.goal}`,
                  `The check "${config.verifyCmd}" passes. Review the change below for bugs and missed requirements.`,
                  'Everything you need is included in this message: do not run any commands and do not read or modify any files, answer directly.',
                  '',
                  'git diff:',
                  diff || '(no changes)',
                  '',
                  'End your reply with exactly one line: "VERDICT: APPROVED" or "VERDICT: CHANGES" followed by the changes needed.',
                ].join('\n'),
                false
              );
              // Only an explicit verdict counts; no verdict is reported as "no result",
              // never as an approval.
              const verdicts = [...review.output.matchAll(/VERDICT:\s*(APPROVED|CHANGES)/gi)];
              const verdict = verdicts.length ? verdicts[verdicts.length - 1][1].toUpperCase() : null;
              if (review.exitCode !== 0 || !verdict) {
                reviewSkipped = true;
                break;
              }
              if (verdict === 'APPROVED') break;
              feedback = `Code review from ${label(config.verifier)}:\n${tail(review.output, 6000)}`;
            } else {
              // 3b. Tests fail: diagnose (verifier agent) and hand back to the builder.
              feedback = `"${config.verifyCmd}" failed:\n${tail(verified.output, 6000)}`;
              if (verifierIsAgent && round < config.maxRounds) {
                await step('handing_off', `Test başarısız. ${label(config.verifier)} hatayı inceliyor...`);
                const diagnosis = await runAgent(
                  verifierSessionId,
                  config.verifier,
                  [
                    `Another agent is implementing: ${config.goal}`,
                    `The check "${config.verifyCmd}" failed with this output:`,
                    tail(verified.output, 8000),
                    '',
                    'Everything you need is included in this message: do not run any commands and do not read or modify any files, answer directly. Explain the root cause briefly and list the concrete fixes needed.',
                  ].join('\n'),
                  false
                );
                if (diagnosis.exitCode === 0 && diagnosis.output.trim()) {
                  feedback += `\n\nDiagnosis from ${label(config.verifier)}:\n${tail(diagnosis.output, 4000)}`;
                }
              }
              update({ lastErrorSnippet: tail(verified.output, 1500) });
            }

            if (round >= config.maxRounds) {
              fail(`${config.maxRounds} turda tamamlanamadı. Son durumu sağdaki panelde görebilir, devam etmek için kendiniz komut yazabilirsiniz.`);
              return;
            }
          }

          update({
            phase: 'consensus',
            statusText: !verifierIsAgent
              ? 'Tamamlandı: testler geçti.'
              : reviewSkipped
                ? `Testler geçti. ${label(config.verifier)} incelemesi net bir sonuç vermedi; değişiklikleri kendiniz gözden geçirin (sağ panele bakın).`
                : `Tamamlandı: testler geçti ve ${label(config.verifier)} onayladı.`,
          });
        } catch (err) {
          if (err instanceof SquadStopped) return;
          fail(`Beklenmeyen hata: ${(err as Error)?.message || String(err)}`);
        }
      })();
    },
    []
  );

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    update({ paused: pausedRef.current });
  }, []);

  const stopSquad = useCallback(() => {
    const current = squadRef.current;
    runIdRef.current++;
    pausedRef.current = false;
    if (current && (current.phase !== 'consensus' && current.phase !== 'failed')) {
      depsRef.current.interrupt(current.builderSessionId);
      depsRef.current.interrupt(current.verifierSessionId);
    }
    setSquad(null);
  }, []);

  return {
    squad,
    startSquad,
    togglePause,
    stopSquad,
  };
};
