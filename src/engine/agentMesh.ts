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
import type { ICliAdapter } from '../types/index.js';

const execAsync = promisify(exec);

export interface AgentMeshOptions {
  builder?: string;     // e.g. 'claude'
  verifier?: string;    // e.g. 'agy'
  auditor?: string;     // e.g. 'gemini'
  verifyCmd?: string;
  maxRounds?: number;   // default: 3
  timeoutMs?: number;
  cwd?: string;
  useSandbox?: boolean; // Run agents in isolated git worktree
  onMessage?: (message: AgentMessage) => void;
}

export interface AgentMeshResult {
  runId: string;
  success: boolean;
  rounds: number;
  messages: AgentMessage[];
  diff: string;
  durationMs: number;
  sandbox?: SandboxSession;
  error?: string;
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

  constructor(options: AgentMeshOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.bus = new AgentMessageBus(this.cwd);
    this.gitUtils = new GitUtils(this.cwd);

    this.builderName = (options.builder || 'claude').toLowerCase() as AgentRole;
    this.verifierName = (options.verifier || 'agy').toLowerCase() as AgentRole;
    this.auditorName = (options.auditor || 'gemini').toLowerCase() as AgentRole;
    this.verifyCmd = options.verifyCmd || 'npm test';
    this.maxRounds = options.maxRounds ?? 3;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.useSandbox = options.useSandbox ?? false;
    this.onMessage = options.onMessage;
  }

  private resolveAdapter(name: string): ICliAdapter {
    try {
      const adapter = AdapterFactory.getAdapter(name);
      return adapter;
    } catch {
      logger.warn(`CLI "${name}" not found in registry, falling back to mock.`);
      return AdapterFactory.getAdapter('mock');
    }
  }

  private async runVerificationCmd(targetCwd?: string): Promise<{ success: boolean; exitCode: number; output: string }> {
    try {
      const { stdout, stderr } = await execAsync(this.verifyCmd, {
        cwd: targetCwd || this.cwd,
        timeout: 60_000,
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
        exitCode: err.code ?? 1,
        output: ContextOptimizer.optimizeTerminalLog(raw, { maxLines: 50, maxBytes: 8192 }),
      };
    }
  }

  /**
   * Executes the autonomous multi-CLI collaboration dialogue.
   */
  async runMesh(goal: string): Promise<AgentMeshResult> {
    const startTime = Date.now();
    const runId = `mesh-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const allMessages: AgentMessage[] = [];

    // Subscribe to record and pipe live messages
    this.bus.subscribe((msg) => {
      allMessages.push(msg);
      if (this.onMessage) {
        this.onMessage(msg);
      }
    }, { from: undefined });

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

    const builderAdapter = this.resolveAdapter(this.builderName);
    const verifierAdapter = this.resolveAdapter(this.verifierName);
    const auditorAdapter = this.resolveAdapter(this.auditorName);

    // Stage 1: Orchestrator publishes USER_TASK to Builder
    const taskDetails = `${goal}\n\n${memorySnippet}`;
    await this.bus.publish(runId, 'orchestrator', this.builderName, 'USER_TASK', {
      summary: `User assigned task: "${goal}"`,
      details: taskDetails,
    });
    logger.step(1, 4, `[orchestrator -> ${this.builderName}]: Dispatching task goal`);

    // Builder executes initial code generation
    logger.model(this.builderName, 'Writing code autonomously...');
    const buildExec = await builderAdapter.execute(taskDetails, {
      cwd: activeCwd,
      timeoutMs: this.timeoutMs,
      onStdout: (chunk) => logger.streamChunk(chunk),
    });

    const diffInitial = activeGit.getDiff();
    await this.bus.publish(runId, this.builderName, this.verifierName, 'CODE_READY', {
      summary: `Code generation completed by ${this.builderName}`,
      gitDiff: ContextOptimizer.optimizeDiff(diffInitial.diff),
      filesChanged: diffInitial.filesChanged,
    });
    logger.step(2, 4, `[${this.builderName} -> ${this.verifierName}]: CODE_READY (${diffInitial.filesChanged.length} files modified)`);

    // Stage 2: Autonomous Verification & Repair Loop (Verifier <-> Builder)
    let verificationPassed = false;
    let currentRound = 1;

    for (; currentRound <= this.maxRounds; currentRound++) {
      logger.info(`[${this.verifierName}]: Running verification "${this.verifyCmd}" (Round ${currentRound}/${this.maxRounds})...`);
      const verifyResult = await this.runVerificationCmd(activeCwd);
      memory.recordCommand(this.verifyCmd, verifyResult.exitCode, undefined, verifyResult.success ? 'Verification passed' : 'Verification failed');

      if (verifyResult.success) {
        verificationPassed = true;
        await this.bus.publish(runId, this.verifierName, this.auditorName, 'VERIFICATION_PASSED', {
          summary: `All tests and compiler checks passed cleanly on Round ${currentRound}`,
          gitDiff: ContextOptimizer.optimizeDiff(activeGit.getDiff().diff),
        });
        logger.success(`[${this.verifierName} -> ${this.auditorName}]: VERIFICATION_PASSED!`);
        break;
      }

      // Verification failed -> Verifier autonomously messages Builder
      const cleanError = verifyResult.output;
      await this.bus.publish(runId, this.verifierName, this.builderName, 'VERIFICATION_FAILED', {
        summary: `Compiler / Test check failed (exit code ${verifyResult.exitCode})`,
        errorTrace: cleanError,
      });
      logger.warn(`[${this.verifierName} -> ${this.builderName}]: VERIFICATION_FAILED (exit code ${verifyResult.exitCode}). Sending stack trace.`);

      // Builder autonomously receives error message and applies repair patch
      logger.model(this.builderName, `Autonomously repairing errors reported by ${this.verifierName}...`);
      const repairPrompt = [
        `[AUTONOMOUS REPAIR REQUEST FROM ${this.verifierName.toUpperCase()}]`,
        `Verification command failed with code ${verifyResult.exitCode}:`,
        cleanError,
        `Apply the minimal patch required to fix this compilation error.`,
      ].join('\n');

      await builderAdapter.execute(repairPrompt, {
        cwd: activeCwd,
        onStdout: (chunk) => logger.streamChunk(chunk),
      });

      const diffAfterPatch = activeGit.getDiff();
      await this.bus.publish(runId, this.builderName, this.verifierName, 'PATCH_APPLIED', {
        summary: `Repair patch applied by ${this.builderName}`,
        gitDiff: diffAfterPatch.diff,
        filesChanged: diffAfterPatch.filesChanged,
      });
      logger.info(`[${this.builderName} -> ${this.verifierName}]: PATCH_APPLIED. Requesting re-verification.`);
    }

    if (!verificationPassed) {
      logger.error(`Consensus failed: ${this.builderName} and ${this.verifierName} could not resolve errors within ${this.maxRounds} rounds.`);
      return {
        runId,
        success: false,
        rounds: currentRound,
        messages: allMessages,
        diff: activeGit.getDiff().diff,
        durationMs: Date.now() - startTime,
        sandbox: sandboxSession,
        error: `Verification failed after ${this.maxRounds} autonomous repair rounds.`,
      };
    }

    // Stage 3: Autonomous Adversarial Audit (Auditor examines diff)
    logger.step(4, 4, `[${this.auditorName}]: Conducting adversarial security and edge-case audit...`);
    const finalDiff = activeGit.getDiff();

    const auditPrompt = [
      `You are ${this.auditorName.toUpperCase()} conducting an adversarial review of code produced by ${this.builderName} and verified by ${this.verifierName}.`,
      `GIT DIFF:`,
      ContextOptimizer.optimizeDiff(finalDiff.diff),
      `Check for critical vulnerabilities, memory leaks, and race conditions.`,
      `If safe, output "VERDICT: APPROVED". If vulnerable, output "VERDICT: REJECTED: <reason>".`,
    ].join('\n');

    const auditExec = await auditorAdapter.execute(auditPrompt, { cwd: activeCwd });

    if (auditExec.stdout.includes('VERDICT: REJECTED')) {
      await this.bus.publish(runId, this.auditorName, this.builderName, 'SECURITY_CONCERN', {
        summary: `Adversarial audit flagged security vulnerabilities`,
        details: auditExec.stdout,
      });
      logger.warn(`[${this.auditorName} -> ${this.builderName}]: SECURITY_CONCERN flagged.`);
    } else {
      await this.bus.publish(runId, this.auditorName, 'orchestrator', 'CONSENSUS_APPROVED', {
        summary: `Consensus reached. Code verified by ${this.verifierName} and approved by ${this.auditorName}.`,
        details: auditExec.stdout,
        gitDiff: finalDiff.diff,
      });
      logger.success(`[${this.auditorName} -> orchestrator]: CONSENSUS_APPROVED! Full multi-agent consensus achieved.`);
    }

    const durationMs = Date.now() - startTime;
    return {
      runId,
      success: true,
      rounds: currentRound,
      messages: allMessages,
      diff: finalDiff.diff,
      durationMs,
      sandbox: sandboxSession,
    };
  }
}
