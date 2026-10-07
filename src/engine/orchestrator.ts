import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, readFileSync } from 'node:fs';
import { ContextBus } from '../bus/contextBus.js';
import { AdapterFactory } from '../adapters/factory.js';
import { SelfCorrectionEngine } from './selfCorrection.js';
import { AdversarialReviewer } from './reviewer.js';
import { GitUtils } from '../git/gitUtils.js';
import { logger } from '../utils/logger.js';
import type { ICliAdapter, RunManifest } from '../types/index.js';

export interface OrchestrationOptions {
  primary: string;
  reviewer: string;
  verify: boolean;
  verifyCmd?: string;
  dual: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  cwd?: string;
}

export class OrchestrationEngine {
  private readonly contextBus: ContextBus;
  private readonly gitUtils: GitUtils;
  private readonly cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.contextBus = new ContextBus(this.cwd);
    this.gitUtils = new GitUtils(this.cwd);
  }

  /**
   * Auto-detects the most suitable local verification command if not specified.
   */
  private detectVerificationCommand(explicitCmd?: string): string {
    if (explicitCmd) return explicitCmd;

    // Check package.json scripts or default to tsc
    try {
      const pkgPath = `${this.cwd}/package.json`;
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.['type-check']) return 'npm run type-check';
        if (pkg.scripts?.test) return 'npm test';
        if (pkg.scripts?.build) return 'npm run build';
      }
    } catch {
      // Fallback
    }

    return 'npx tsc --noEmit';
  }

  /**
   * Executes the full multi-CLI pipeline.
   */
  async run(prompt: string, options: OrchestrationOptions): Promise<RunManifest> {
    const startTime = Date.now();
    logger.banner('MULTI-CLI ORCHESTRATOR', 'Safe Isolated IPC • Self-Correction • Adversarial Review');

    // 1. Initialize Bus & Run Manifest
    const manifest = this.contextBus.initRun(prompt, options.primary, options.reviewer, {
      verifyEnabled: options.verify,
      dualEnabled: options.dual,
    });

    logger.info(`Run ID: ${pc.cyan(manifest.runId)}`);
    logger.info(`Artifact directory: ${pc.dim(this.contextBus.getRunDir())}`);

    // 2. Resolve Adapters
    let primaryAdapter: ICliAdapter;
    let reviewerAdapter: ICliAdapter;

    try {
      primaryAdapter = AdapterFactory.getAdapter(options.primary, {
        defaultTimeoutMs: options.timeoutMs,
      });
      reviewerAdapter = AdapterFactory.getAdapter(options.reviewer, {
        defaultTimeoutMs: options.timeoutMs,
      });
    } catch (err: any) {
      logger.error('Failed to initialize CLI adapter', err);
      this.contextBus.updateManifest({ status: 'FAILED', error: err.message });
      throw err;
    }

    // Pre-flight check
    const isPrimaryAvail = await primaryAdapter.isAvailable();
    if (!isPrimaryAvail) {
      const msg = `Primary CLI binary "${primaryAdapter.binaryPath}" is not found in PATH. Run "orchestrate doctor" to diagnose.`;
      logger.error(msg);
      this.contextBus.updateManifest({ status: 'FAILED', error: msg });
      throw new Error(msg);
    }

    if (options.dual) {
      const isReviewerAvail = await reviewerAdapter.isAvailable();
      if (!isReviewerAvail) {
        logger.warn(
          `Reviewer CLI "${reviewerAdapter.binaryPath}" is not in PATH. Falling back to Mock reviewer for this run.`
        );
        reviewerAdapter = AdapterFactory.getAdapter('mock');
      }
    }

    // 3. Stage 1: Primary Model Generation
    this.contextBus.updateManifest({ status: 'GENERATING' });
    logger.divider();
    logger.step(1, options.dual ? 3 : (options.verify ? 2 : 1), `Generating changes with [${primaryAdapter.name}]...`);
    this.contextBus.recordLog('PRIMARY', 'info', `Sending prompt to primary CLI: ${primaryAdapter.name}`);

    const primaryExec = await primaryAdapter.execute(prompt, {
      cwd: this.cwd,
      timeoutMs: options.timeoutMs,
      allowEdits: true,
      onStdout: (chunk) => logger.streamChunk(chunk),
    });

    this.contextBus.saveLog('primary-output', primaryExec.stdout);
    if (primaryExec.stderr) {
      this.contextBus.saveLog('primary-stderr', primaryExec.stderr);
    }

    if (primaryExec.exitCode !== 0) {
      const errMsg = `Primary CLI exited with error code ${primaryExec.exitCode}: ${primaryExec.stderr}`;
      logger.error(errMsg);
      this.contextBus.updateManifest({ status: 'FAILED', error: errMsg });
      return this.contextBus.getManifest()!;
    }

    // An agent that only printed code (e.g. it was refused write access) changed
    // nothing; verifying the untouched project would report a false success.
    if (this.gitUtils.isGitRepo() && !this.gitUtils.getDiff().hasChanges) {
      const errMsg = `[${primaryAdapter.name}] finished without changing any file. Its reply is saved in the run log; nothing was verified.`;
      logger.error(errMsg);
      this.contextBus.updateManifest({ status: 'FAILED', error: errMsg });
      return this.contextBus.getManifest()!;
    }

    // 4. Stage 2: Self-Correction Loop (if --verify is set)
    if (options.verify) {
      this.contextBus.updateManifest({ status: 'CORRECTING' });
      logger.divider();
      logger.step(2, options.dual ? 3 : 2, 'Running Automated Self-Correction Engine...');

      const verifyCmd = this.detectVerificationCommand(options.verifyCmd);
      const correctionEngine = new SelfCorrectionEngine(this.contextBus, {
        verificationCommand: verifyCmd,
        maxRetries: options.maxRetries ?? 2,
        cwd: this.cwd,
      });

      const correctionResult = await correctionEngine.executeCorrectionLoop(primaryAdapter);

      if (!correctionResult.passed) {
        logger.warn('Self-correction could not fully fix all compiler/test errors within the budget.');
      }
    }

    // 5. Stage 3: Adversarial Review (if --dual is set)
    if (options.dual) {
      this.contextBus.updateManifest({ status: 'REVIEWING' });
      logger.divider();
      logger.step(3, 3, `Triggering Adversarial Review with [${reviewerAdapter.name}]...`);

      const reviewerEngine = new AdversarialReviewer(this.contextBus, {
        cwd: this.cwd,
      });

      const report = await reviewerEngine.reviewChanges(reviewerAdapter);
      const decision = await reviewerEngine.presentInteractiveReview(report);

      if (decision === 'DISCARD') {
        this.contextBus.updateManifest({ status: 'DISCARDED', durationMs: Date.now() - startTime });
        return this.contextBus.getManifest()!;
      }

      if (decision === 'REQUEST_FIX') {
        logger.info('Forwarding adversarial findings back to primary model for remediation...');
        const remediationPrompt = [
          `[SECURITY & ADVERSARIAL REMEDIATION REQUIRED]`,
          `Adversarial model (${reviewerAdapter.name}) reviewed your changes and flagged the following issues:`,
          report.rawReview,
          ``,
          `Please apply the necessary changes to fix these vulnerabilities and edge cases.`,
        ].join('\n');

        await primaryAdapter.execute(remediationPrompt, {
          cwd: this.cwd,
          allowEdits: true,
          onStdout: (chunk) => logger.streamChunk(chunk),
        });

        logger.success('Remediation patch applied by primary model.');

        // The fix is new code: check it the same way as the first attempt.
        if (options.verify) {
          const recheck = new SelfCorrectionEngine(this.contextBus, {
            verificationCommand: this.detectVerificationCommand(options.verifyCmd),
            maxRetries: options.maxRetries ?? 2,
            cwd: this.cwd,
          });
          const recheckResult = await recheck.executeCorrectionLoop(primaryAdapter);
          if (!recheckResult.passed) {
            logger.warn('The remediation left failing checks that self-correction could not fix.');
          }
        }
      }
    }

    // 6. Conclude Run
    const totalDuration = Date.now() - startTime;
    const finalManifest = this.contextBus.updateManifest({
      status: 'COMPLETED',
      durationMs: totalDuration,
    });

    logger.divider();
    logger.success(`Pipeline finished successfully in ${(totalDuration / 1000).toFixed(2)}s.`);
    logger.info(`Run metadata and audit artifacts saved to .ai-bridge/runs/${finalManifest.runId}`);

    return finalManifest;
  }
}
