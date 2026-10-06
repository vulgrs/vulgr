import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { AgentMessageBus, type AgentMessage, type AgentRole } from '../bus/agentMessageBus.js';
import { AdapterFactory } from '../adapters/factory.js';
import { GitUtils } from '../git/gitUtils.js';
import { WorktreeManager, type SandboxSession } from '../git/worktreeManager.js';
import { logger } from '../utils/logger.js';
import { ContextOptimizer } from './contextOptimizer.js';
import { MemoryStore } from './memoryStore.js';
import type { ICliAdapter, CliExecutionResult } from '../types/index.js';

const execAsync = promisify(exec);

/** Where a run currently is, for a live progress line in the UI. */
export interface AgentMeshStatus {
  stage: 'checking' | 'building' | 'verifying' | 'diagnosing' | 'repairing' | 'auditing' | 'done' | 'failed';
  agent?: string;
  round: number;
  maxRounds: number;
  text: string;
}

export interface AgentMeshOptions {
  builder?: string;     // e.g. 'claude'
  verifier?: string;    // e.g. 'agy'
  auditor?: string;     // e.g. 'claude'
  verifyCmd?: string;
  maxRounds?: number;   // default: 3
  timeoutMs?: number;   // per agent call
  cwd?: string;
  useSandbox?: boolean; // Run agents in isolated git worktree
  lang?: MeshLang;      // language of the status lines and message summaries shown in the UI
  onMessage?: (message: AgentMessage) => void;
  onStatus?: (status: AgentMeshStatus) => void;
}

export interface AgentMeshResult {
  runId: string;
  success: boolean;
  rounds: number;
  messages: AgentMessage[];
  diff: string;
  durationMs: number;
  sandbox?: SandboxSession;
  /** The auditor's verdict on the final diff (skipped when it couldn't run). */
  audit?: 'approved' | 'rejected' | 'skipped';
  auditNotes?: string;
  error?: string;
}

const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude',
  agy: 'AGY',
  codex: 'Codex',
  gemini: 'Gemini',
  mock: 'Mock',
};

const label = (name: string) => AGENT_LABELS[name] ?? name;

export type MeshLang = 'en' | 'tr';

/** UI-facing texts (status lines, message summaries, errors). Agent prompts stay in English. */
const MESH_TEXT = {
  en: {
    timedOut: 'timed out',
    exitCode: (code: number | null) => `exit code ${code}`,
    checking: 'Checking that the selected agents are installed...',
    missingAgents: (names: string) =>
      `Agent not installed: ${names}. Choose an agent installed on this computer or install that tool first.`,
    taskGiven: (agent: string, goal: string) => `Task given to ${agent}: "${goal}"`,
    building: (agent: string) => `${agent} is writing the code...`,
    buildFailed: (agent: string, tail: string) => `${agent} could not complete the task: ${tail}`,
    codeWritten: (agent: string, files: number) => `${agent} wrote the code (${files} files changed).`,
    verifying: (cmd: string, round: number, max: number) => `Running "${cmd}" (round ${round}/${max})...`,
    verifyPassed: (cmd: string, round: number) => `"${cmd}" passed (round ${round}).`,
    diagnosing: (agent: string) => `${agent} is investigating the error...`,
    verifyFailed: (cmd: string, code: number | null) => `"${cmd}" failed (exit code ${code}).`,
    repairing: (agent: string, round: number, max: number) => `${agent} is fixing the error (round ${round}/${max})...`,
    repairFailed: (agent: string, tail: string) => `${agent} could not apply a fix: ${tail}`,
    patchApplied: (agent: string) => `${agent} applied the fix, testing again.`,
    outOfRounds: (max: number) =>
      `Tests did not pass in ${max} rounds. The last error is above; the changes are still in place, review them in the "Changes" panel.`,
    auditing: (agent: string) => `${agent} is auditing the final changes...`,
    auditNoVerdict: 'gave no clear verdict',
    auditCouldNotRun: (tail: string) => `could not run: ${tail}`,
    auditRejected: (agent: string) => `${agent} found problems in the changes.`,
    auditSkipped: (agent: string, reason: string) =>
      `Tests passed. ${agent}'s audit ${reason}; review the changes yourself.`,
    auditApproved: (agent: string) => `Tests passed and ${agent} approved the changes.`,
    doneRejected: 'Tests passed, but the auditor found problems.',
    done: 'Done: tests passed.',
  },
  tr: {
    timedOut: 'zaman aşımı',
    exitCode: (code: number | null) => `çıkış kodu ${code}`,
    checking: 'Seçilen ajanların kurulu olduğu kontrol ediliyor...',
    missingAgents: (names: string) =>
      `Kurulu olmayan ajan: ${names}. Bu bilgisayarda kurulu bir ajan seçin ya da önce o aracı kurun.`,
    taskGiven: (agent: string, goal: string) => `Görev ${agent}'a verildi: "${goal}"`,
    building: (agent: string) => `${agent} kodu yazıyor...`,
    buildFailed: (agent: string, tail: string) => `${agent} görevi tamamlayamadı: ${tail}`,
    codeWritten: (agent: string, files: number) => `${agent} kodu yazdı (${files} dosya değişti).`,
    verifying: (cmd: string, round: number, max: number) => `"${cmd}" çalıştırılıyor (tur ${round}/${max})...`,
    verifyPassed: (cmd: string, round: number) => `"${cmd}" başarılı (tur ${round}).`,
    diagnosing: (agent: string) => `${agent} hatayı inceliyor...`,
    verifyFailed: (cmd: string, code: number | null) => `"${cmd}" başarısız (çıkış kodu ${code}).`,
    repairing: (agent: string, round: number, max: number) => `${agent} hatayı düzeltiyor (tur ${round}/${max})...`,
    repairFailed: (agent: string, tail: string) => `${agent} düzeltme yapamadı: ${tail}`,
    patchApplied: (agent: string) => `${agent} düzeltmeyi uyguladı, tekrar test ediliyor.`,
    outOfRounds: (max: number) =>
      `${max} turda testler geçmedi. Son hata yukarıda; değişiklikler yerinde duruyor, "Değişiklikler" panelinden inceleyebilirsiniz.`,
    auditing: (agent: string) => `${agent} son değişiklikleri denetliyor...`,
    auditNoVerdict: 'net bir karar vermedi',
    auditCouldNotRun: (tail: string) => `çalışamadı: ${tail}`,
    auditRejected: (agent: string) => `${agent} değişikliklerde sorun buldu.`,
    auditSkipped: (agent: string, reason: string) =>
      `Testler geçti. ${agent} denetimi ${reason}; değişiklikleri kendiniz gözden geçirin.`,
    auditApproved: (agent: string) => `Testler geçti ve ${agent} değişiklikleri onayladı.`,
    doneRejected: 'Testler geçti, ancak denetçi sorun buldu.',
    done: 'Tamamlandı: testler geçti.',
  },
};

/** Last lines of a failed agent call, for an error message a person can act on. */
function failureTail(res: CliExecutionResult, text: (typeof MESH_TEXT)[MeshLang]): string {
  const output = [res.stderr, res.stdout].filter(Boolean).join('\n').trim();
  if (res.timedOut) return text.timedOut;
  return output.split('\n').slice(-6).join('\n') || text.exitCode(res.exitCode);
}

export class AgentMesh {
  private readonly bus: AgentMessageBus;
  private readonly gitUtils: GitUtils;
  private readonly cwd: string;
  private readonly builderName: AgentRole;
  private readonly verifierName: AgentRole;
  private readonly auditorName: AgentRole;
  private readonly verifyCmd: string;
  private readonly maxRounds: number;
  private readonly timeoutMs: number;
  private readonly useSandbox: boolean;
  private readonly onMessage?: (message: AgentMessage) => void;
  private readonly onStatus?: (status: AgentMeshStatus) => void;
  private readonly text: (typeof MESH_TEXT)[MeshLang];

  constructor(options: AgentMeshOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.bus = new AgentMessageBus(this.cwd);
    this.gitUtils = new GitUtils(this.cwd);

    this.builderName = (options.builder || 'claude').toLowerCase() as AgentRole;
    this.verifierName = (options.verifier || 'agy').toLowerCase() as AgentRole;
    this.auditorName = (options.auditor || 'claude').toLowerCase() as AgentRole;
    this.verifyCmd = options.verifyCmd || 'npm test';
    this.maxRounds = Math.max(1, options.maxRounds ?? 3);
    // Real coding turns routinely take several minutes.
    this.timeoutMs = options.timeoutMs ?? 15 * 60_000;
    this.useSandbox = options.useSandbox ?? false;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.text = MESH_TEXT[options.lang ?? 'tr'];
  }

  private status(stage: AgentMeshStatus['stage'], round: number, text: string, agent?: string) {
    this.onStatus?.({ stage, agent, round, maxRounds: this.maxRounds, text });
  }

  private resolveAdapter(name: string): ICliAdapter {
    try {
      return AdapterFactory.getAdapter(name);
    } catch {
      logger.warn(`CLI "${name}" not found in registry, falling back to mock.`);
      return AdapterFactory.getAdapter('mock');
    }
  }

  private async runVerificationCmd(targetCwd?: string): Promise<{ success: boolean; exitCode: number; output: string }> {
    try {
      const { stdout, stderr } = await execAsync(this.verifyCmd, {
        cwd: targetCwd || this.cwd,
        timeout: 5 * 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      const raw = [stdout, stderr].filter(Boolean).join('\n');
      return {
        success: true,
        exitCode: 0,
        output: ContextOptimizer.optimizeTerminalLog(raw, { maxLines: 50, maxBytes: 8192 }),
      };
    } catch (err: any) {
      const stdout = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || '';
      const raw = [stdout, stderr, err.message].filter(Boolean).join('\n');
      return {
        success: false,
        exitCode: typeof err.code === 'number' ? err.code : 1,
        output: ContextOptimizer.optimizeTerminalLog(raw, { maxLines: 50, maxBytes: 8192 }),
      };
    }
  }

  /**
   * Executes the autonomous multi-CLI collaboration dialogue:
   * builder writes code -> verify command -> on failure the verifier agent
   * diagnoses and the builder repairs (up to maxRounds) -> auditor reviews.
   */
  async runMesh(goal: string): Promise<AgentMeshResult> {
    const startTime = Date.now();
    const runId = `mesh-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const allMessages: AgentMessage[] = [];

    this.bus.subscribe((msg) => {
      allMessages.push(msg);
      this.onMessage?.(msg);
    }, { from: undefined });

    const builderAdapter = this.resolveAdapter(this.builderName);
    const verifierAdapter = this.resolveAdapter(this.verifierName);
    const auditorAdapter = this.resolveAdapter(this.auditorName);

    const fail = (error: string, rounds: number, git: GitUtils, sandbox?: SandboxSession): AgentMeshResult => {
      this.status('failed', rounds, error);
      logger.error(error);
      return {
        runId,
        success: false,
        rounds,
        messages: allMessages,
        diff: git.getDiff().diff,
        durationMs: Date.now() - startTime,
        sandbox,
        error,
      };
    };

    // Stage 0: every chosen agent must actually be installed, otherwise the
    // run would "succeed" on empty output.
    this.status('checking', 0, this.text.checking);
    const roles: Array<[string, ICliAdapter]> = [
      [this.builderName, builderAdapter],
      [this.verifierName, verifierAdapter],
      [this.auditorName, auditorAdapter],
    ];
    const missing: string[] = [];
    for (const [name, adapter] of roles) {
      if (!missing.includes(name) && !(await adapter.isAvailable())) missing.push(name);
    }
    if (missing.length > 0) {
      return fail(
        this.text.missingAgents(missing.map(label).join(', ')),
        0,
        this.gitUtils
      );
    }

    let activeCwd = this.cwd;
    let sandboxSession: SandboxSession | undefined;
    let activeGit = this.gitUtils;

    if (this.useSandbox && this.gitUtils.isGitRepo()) {
      try {
        const worktreeMgr = new WorktreeManager(this.cwd);
        sandboxSession = await worktreeMgr.createSandbox(runId);
        activeCwd = sandboxSession.worktreePath;
        activeGit = new GitUtils(activeCwd);
        logger.info(`[Sandbox Active]: Agents isolated in worktree ${sandboxSession.worktreePath}`);
      } catch (err: any) {
        logger.warn(`Failed to initialize Git worktree sandbox: ${err.message}. Running in main workspace.`);
      }
    }

    logger.banner('AUTONOMOUS AGENT MESH', `Builder: [${this.builderName}] • Verifier: [${this.verifierName}] • Auditor: [${this.auditorName}]`);
    logger.info(`Goal: "${goal}"`);

    const memory = new MemoryStore(this.cwd);
    const memorySnippet = memory.toPromptSnippet();

    // Stage 1: Builder implements the goal.
    const taskDetails = [
      goal,
      '',
      'Make the code changes directly in this repository. Do not ask questions; make reasonable assumptions.',
      'When you are done, reply with a short summary of what you changed.',
      '',
      memorySnippet,
    ].join('\n');
    await this.bus.publish(runId, 'orchestrator', this.builderName, 'USER_TASK', {
      summary: this.text.taskGiven(label(this.builderName), goal),
      details: taskDetails,
    });
    this.status('building', 1, this.text.building(label(this.builderName)), this.builderName);
    logger.model(this.builderName, 'Writing code autonomously...');
    const buildExec = await builderAdapter.execute(taskDetails, {
      cwd: activeCwd,
      timeoutMs: this.timeoutMs,
      allowEdits: true,
      onStdout: (chunk) => logger.streamChunk(chunk),
    });
    if (buildExec.exitCode !== 0 || buildExec.timedOut) {
      return fail(this.text.buildFailed(label(this.builderName), failureTail(buildExec, this.text)), 1, activeGit, sandboxSession);
    }

    const diffInitial = activeGit.getDiff();
    await this.bus.publish(runId, this.builderName, this.verifierName, 'CODE_READY', {
      summary: this.text.codeWritten(label(this.builderName), diffInitial.filesChanged.length),
      details: buildExec.stdout.trim().slice(-2000),
      gitDiff: ContextOptimizer.optimizeDiff(diffInitial.diff),
      filesChanged: diffInitial.filesChanged,
    });

    // Stage 2: Verify, and on failure let the verifier diagnose and the builder repair.
    let verificationPassed = false;
    let currentRound = 1;

    for (; currentRound <= this.maxRounds; currentRound++) {
      this.status('verifying', currentRound, this.text.verifying(this.verifyCmd, currentRound, this.maxRounds));
      const verifyResult = await this.runVerificationCmd(activeCwd);
      memory.recordCommand(this.verifyCmd, verifyResult.exitCode, undefined, verifyResult.success ? 'Verification passed' : 'Verification failed');

      if (verifyResult.success) {
        verificationPassed = true;
        await this.bus.publish(runId, this.verifierName, this.auditorName, 'VERIFICATION_PASSED', {
          summary: this.text.verifyPassed(this.verifyCmd, currentRound),
          gitDiff: ContextOptimizer.optimizeDiff(activeGit.getDiff().diff),
        });
        logger.success(`[${this.verifierName} -> ${this.auditorName}]: VERIFICATION_PASSED!`);
        break;
      }

      // The verifier agent reads the failure and tells the builder what to fix.
      this.status('diagnosing', currentRound, this.text.diagnosing(label(this.verifierName)), this.verifierName);
      const diagnosePrompt = [
        `You are reviewing work by another coding agent. The goal was: "${goal}".`,
        `The verification command "${this.verifyCmd}" failed with exit code ${verifyResult.exitCode}:`,
        verifyResult.output,
        '',
        'Current changes (git diff):',
        ContextOptimizer.optimizeDiff(activeGit.getDiff().diff),
        '',
        'Everything you need is included in this message: do not run any commands and do not read or modify any files, answer directly. Explain the root cause in 2-3 sentences, then list the concrete fixes the other agent should make.',
      ].join('\n');
      const diagnosis = await verifierAdapter.execute(diagnosePrompt, { cwd: activeCwd, timeoutMs: this.timeoutMs });
      const diagnosisText = diagnosis.exitCode === 0 ? diagnosis.stdout.trim() : '';

      await this.bus.publish(runId, this.verifierName, this.builderName, 'VERIFICATION_FAILED', {
        summary: this.text.verifyFailed(this.verifyCmd, verifyResult.exitCode),
        errorTrace: verifyResult.output,
        details: diagnosisText || undefined,
      });

      if (currentRound === this.maxRounds) break;

      this.status('repairing', currentRound + 1, this.text.repairing(label(this.builderName), currentRound + 1, this.maxRounds), this.builderName);
      logger.model(this.builderName, `Autonomously repairing errors reported by ${this.verifierName}...`);
      const repairPrompt = [
        `The goal is still: "${goal}".`,
        `The verification command "${this.verifyCmd}" failed with exit code ${verifyResult.exitCode}:`,
        verifyResult.output,
        diagnosisText ? `\nReview from ${label(this.verifierName)}:\n${diagnosisText}` : '',
        '',
        'Fix the problem with the smallest correct change. Do not ask questions.',
      ].join('\n');

      const repairExec = await builderAdapter.execute(repairPrompt, {
        cwd: activeCwd,
        timeoutMs: this.timeoutMs,
        allowEdits: true,
        onStdout: (chunk) => logger.streamChunk(chunk),
      });
      if (repairExec.exitCode !== 0 || repairExec.timedOut) {
        return fail(this.text.repairFailed(label(this.builderName), failureTail(repairExec, this.text)), currentRound + 1, activeGit, sandboxSession);
      }

      const diffAfterPatch = activeGit.getDiff();
      await this.bus.publish(runId, this.builderName, this.verifierName, 'PATCH_APPLIED', {
        summary: this.text.patchApplied(label(this.builderName)),
        details: repairExec.stdout.trim().slice(-2000),
        gitDiff: diffAfterPatch.diff,
        filesChanged: diffAfterPatch.filesChanged,
      });
    }

    if (!verificationPassed) {
      return fail(
        this.text.outOfRounds(this.maxRounds),
        Math.min(currentRound, this.maxRounds),
        activeGit,
        sandboxSession
      );
    }

    // Stage 3: Auditor reviews the final diff (read-only).
    this.status('auditing', currentRound, this.text.auditing(label(this.auditorName)), this.auditorName);
    const finalDiff = activeGit.getDiff();
    const auditPrompt = [
      `You are ${label(this.auditorName)}, reviewing code written by ${label(this.builderName)} for the goal "${goal}". Tests already pass.`,
      'Everything you need is included in this message: do not run any commands and do not read or modify any files, answer directly. Look for bugs, security problems and missed requirements in this git diff:',
      ContextOptimizer.optimizeDiff(finalDiff.diff),
      '',
      'End your reply with exactly one line: "VERDICT: APPROVED" or "VERDICT: REJECTED: <reason>".',
    ].join('\n');

    const auditExec = await auditorAdapter.execute(auditPrompt, { cwd: activeCwd, timeoutMs: this.timeoutMs });
    // Only an explicit verdict counts: a reply without one (e.g. the agent was
    // blocked from a tool and printed nothing useful) is not an approval.
    const auditRan = auditExec.exitCode === 0 && !auditExec.timedOut;
    let audit: AgentMeshResult['audit'] = 'skipped';
    if (auditRan && /VERDICT:\s*REJECTED/i.test(auditExec.stdout)) audit = 'rejected';
    else if (auditRan && /VERDICT:\s*APPROVED/i.test(auditExec.stdout)) audit = 'approved';
    const skippedReason = auditRan ? this.text.auditNoVerdict : this.text.auditCouldNotRun(failureTail(auditExec, this.text));

    if (audit === 'rejected') {
      await this.bus.publish(runId, this.auditorName, this.builderName, 'SECURITY_CONCERN', {
        summary: this.text.auditRejected(label(this.auditorName)),
        details: auditExec.stdout.trim(),
      });
      logger.warn(`[${this.auditorName} -> ${this.builderName}]: SECURITY_CONCERN flagged.`);
    } else {
      await this.bus.publish(runId, this.auditorName, 'orchestrator', 'CONSENSUS_APPROVED', {
        summary:
          audit === 'skipped'
            ? this.text.auditSkipped(label(this.auditorName), skippedReason)
            : this.text.auditApproved(label(this.auditorName)),
        details: auditExec.stdout.trim(),
        gitDiff: finalDiff.diff,
      });
      logger.success(`[${this.auditorName} -> orchestrator]: CONSENSUS_APPROVED! Full multi-agent consensus achieved.`);
    }

    this.status(
      'done',
      currentRound,
      audit === 'rejected' ? this.text.doneRejected : this.text.done
    );

    return {
      runId,
      success: true,
      rounds: currentRound,
      messages: allMessages,
      diff: finalDiff.diff,
      durationMs: Date.now() - startTime,
      sandbox: sandboxSession,
      audit,
      auditNotes: auditExec.stdout.trim().slice(-4000),
    };
  }
}
