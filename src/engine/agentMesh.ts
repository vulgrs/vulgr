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

/** Last lines of a failed agent call, for an error message a person can act on. */
function failureTail(res: CliExecutionResult): string {
  const text = [res.stderr, res.stdout].filter(Boolean).join('\n').trim();
  if (res.timedOut) return 'zaman aşımı';
  return text.split('\n').slice(-6).join('\n') || `çıkış kodu ${res.exitCode}`;
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
    this.status('checking', 0, 'Seçilen ajanların kurulu olduğu kontrol ediliyor...');
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
        `Kurulu olmayan ajan: ${missing.map(label).join(', ')}. Bu bilgisayarda kurulu bir ajan seçin ya da önce o aracı kurun.`,
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
      summary: `Görev ${label(this.builderName)}'a verildi: "${goal}"`,
      details: taskDetails,
    });
    this.status('building', 1, `${label(this.builderName)} kodu yazıyor...`, this.builderName);
    logger.model(this.builderName, 'Writing code autonomously...');
    const buildExec = await builderAdapter.execute(taskDetails, {
      cwd: activeCwd,
      timeoutMs: this.timeoutMs,
      allowEdits: true,
      onStdout: (chunk) => logger.streamChunk(chunk),
    });
    if (buildExec.exitCode !== 0 || buildExec.timedOut) {
      return fail(`${label(this.builderName)} görevi tamamlayamadı: ${failureTail(buildExec)}`, 1, activeGit, sandboxSession);
    }

    const diffInitial = activeGit.getDiff();
    await this.bus.publish(runId, this.builderName, this.verifierName, 'CODE_READY', {
      summary: `${label(this.builderName)} kodu yazdı (${diffInitial.filesChanged.length} dosya değişti).`,
      details: buildExec.stdout.trim().slice(-2000),
      gitDiff: ContextOptimizer.optimizeDiff(diffInitial.diff),
      filesChanged: diffInitial.filesChanged,
    });

    // Stage 2: Verify, and on failure let the verifier diagnose and the builder repair.
    let verificationPassed = false;
    let currentRound = 1;

    for (; currentRound <= this.maxRounds; currentRound++) {
      this.status('verifying', currentRound, `"${this.verifyCmd}" çalıştırılıyor (tur ${currentRound}/${this.maxRounds})...`);
      const verifyResult = await this.runVerificationCmd(activeCwd);
      memory.recordCommand(this.verifyCmd, verifyResult.exitCode, undefined, verifyResult.success ? 'Verification passed' : 'Verification failed');

      if (verifyResult.success) {
        verificationPassed = true;
        await this.bus.publish(runId, this.verifierName, this.auditorName, 'VERIFICATION_PASSED', {
          summary: `"${this.verifyCmd}" başarılı (tur ${currentRound}).`,
          gitDiff: ContextOptimizer.optimizeDiff(activeGit.getDiff().diff),
        });
        logger.success(`[${this.verifierName} -> ${this.auditorName}]: VERIFICATION_PASSED!`);
        break;
      }

      // The verifier agent reads the failure and tells the builder what to fix.
      this.status('diagnosing', currentRound, `${label(this.verifierName)} hatayı inceliyor...`, this.verifierName);
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
        summary: `"${this.verifyCmd}" başarısız (çıkış kodu ${verifyResult.exitCode}).`,
        errorTrace: verifyResult.output,
        details: diagnosisText || undefined,
      });

      if (currentRound === this.maxRounds) break;

      this.status('repairing', currentRound + 1, `${label(this.builderName)} hatayı düzeltiyor (tur ${currentRound + 1}/${this.maxRounds})...`, this.builderName);
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
        return fail(`${label(this.builderName)} düzeltme yapamadı: ${failureTail(repairExec)}`, currentRound + 1, activeGit, sandboxSession);
      }

      const diffAfterPatch = activeGit.getDiff();
      await this.bus.publish(runId, this.builderName, this.verifierName, 'PATCH_APPLIED', {
        summary: `${label(this.builderName)} düzeltmeyi uyguladı, tekrar test ediliyor.`,
        details: repairExec.stdout.trim().slice(-2000),
        gitDiff: diffAfterPatch.diff,
        filesChanged: diffAfterPatch.filesChanged,
      });
    }

    if (!verificationPassed) {
      return fail(
        `${this.maxRounds} turda testler geçmedi. Son hata yukarıda; değişiklikler yerinde duruyor, "Değişiklikler" panelinden inceleyebilirsiniz.`,
        Math.min(currentRound, this.maxRounds),
        activeGit,
        sandboxSession
      );
    }

    // Stage 3: Auditor reviews the final diff (read-only).
    this.status('auditing', currentRound, `${label(this.auditorName)} son değişiklikleri denetliyor...`, this.auditorName);
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
    const skippedReason = auditRan ? 'net bir karar vermedi' : `çalışamadı: ${failureTail(auditExec)}`;

    if (audit === 'rejected') {
      await this.bus.publish(runId, this.auditorName, this.builderName, 'SECURITY_CONCERN', {
        summary: `${label(this.auditorName)} değişikliklerde sorun buldu.`,
        details: auditExec.stdout.trim(),
      });
      logger.warn(`[${this.auditorName} -> ${this.builderName}]: SECURITY_CONCERN flagged.`);
    } else {
      await this.bus.publish(runId, this.auditorName, 'orchestrator', 'CONSENSUS_APPROVED', {
        summary:
          audit === 'skipped'
            ? `Testler geçti. ${label(this.auditorName)} denetimi ${skippedReason}; değişiklikleri kendiniz gözden geçirin.`
            : `Testler geçti ve ${label(this.auditorName)} değişiklikleri onayladı.`,
        details: auditExec.stdout.trim(),
        gitDiff: finalDiff.diff,
      });
      logger.success(`[${this.auditorName} -> orchestrator]: CONSENSUS_APPROVED! Full multi-agent consensus achieved.`);
    }

    this.status(
      'done',
      currentRound,
      audit === 'rejected' ? 'Testler geçti, ancak denetçi sorun buldu.' : 'Tamamlandı: testler geçti.'
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
