import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ICliAdapter,
  VerificationResult,
  SelfCorrectionAttempt,
  SelfCorrectionResult,
} from '../types/index.js';
import type { ContextBus } from '../bus/contextBus.js';
import { GitUtils } from '../git/gitUtils.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export interface SelfCorrectionOptions {
  verificationCommand: string;
  maxRetries?: number; // Strictly budgeted (default: 2)
  timeoutMs?: number;
  cwd?: string;
}

export class SelfCorrectionEngine {
  private readonly contextBus: ContextBus;
  private readonly gitUtils: GitUtils;
  private readonly verificationCommand: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly cwd: string;

  constructor(contextBus: ContextBus, options: SelfCorrectionOptions) {
    this.contextBus = contextBus;
    this.cwd = options.cwd ?? process.cwd();
    this.gitUtils = new GitUtils(this.cwd);
    this.verificationCommand = options.verificationCommand;
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /**
   * Executes local build, type-check, or test command to verify code integrity.
   */
  async runVerification(): Promise<VerificationResult> {
    const startTime = Date.now();
    logger.info(`Running verification command: "${this.verificationCommand}"...`);

    try {
      const { stdout, stderr } = await execAsync(this.verificationCommand, {
        cwd: this.cwd,
        timeout: this.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
      const durationMs = Date.now() - startTime;

      return {
        command: this.verificationCommand,
        success: true,
        exitCode: 0,
        output: combinedOutput,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const stdout = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || '';
      const combinedOutput = [stdout, stderr, err.message].filter(Boolean).join('\n');

      return {
        command: this.verificationCommand,
        success: false,
        exitCode: err.code ?? 1,
        output: combinedOutput,
        durationMs,
      };
    }
  }

  /**
   * Truncates and sanitizes error logs to extract meaningful stack traces
   * without overwhelming context token limits.
   */
  private extractRelevantErrors(rawOutput: string, maxLines = 60): string {
    const lines = rawOutput.split('\n');
    if (lines.length <= maxLines) {
      return rawOutput.trim();
    }

    // Capture first 20 lines and last 40 lines where errors usually concentrate
    const head = lines.slice(0, 20);
    const tail = lines.slice(-40);
    return [
      ...head,
      `... [Truncated ${lines.length - 60} lines of intermediate logs] ...`,
      ...tail,
    ].join('\n').trim();
  }

  /**
   * Main self-correction loop with strict retry budget (max 2 attempts).
   */
  async executeCorrectionLoop(primaryAdapter: ICliAdapter): Promise<SelfCorrectionResult> {
    this.contextBus.recordLog('VERIFY', 'info', 'Starting initial build/test verification');
    let verification = await this.runVerification();

    if (verification.success) {
      logger.success('Initial code verification passed! No self-correction required.');
      this.contextBus.recordLog('VERIFY', 'info', 'Verification succeeded on first pass');
      return {
        passed: true,
        attemptsCount: 0,
        attempts: [],
        finalVerification: verification,
      };
    }

    const attempts: SelfCorrectionAttempt[] = [];
    logger.warn(`Verification failed with exit code ${verification.exitCode}. Entering Self-Correction loop.`);

    for (let attemptNum = 1; attemptNum <= this.maxRetries; attemptNum++) {
      const attemptStartTime = Date.now();
      logger.step(
        attemptNum,
        this.maxRetries,
        `Self-Correction Attempt ${attemptNum}/${this.maxRetries} with ${primaryAdapter.name}`
      );

      const errorTrace = this.extractRelevantErrors(verification.output);
      this.contextBus.saveLog(`error-attempt-${attemptNum}`, verification.output);

      // Construct precise self-correction prompt
      const repairPrompt = [
        `[SELF-CORRECTION REQUIRED]`,
        `Yerel derleme/test kontrolü (${this.verificationCommand}) hata verdi (exit code: ${verification.exitCode}).`,
        `Aşağıdaki hata logunu (compiler diagnostics / stack trace) dikkatlice incele:`,
        `----------------------------------------`,
        errorTrace,
        `----------------------------------------`,
        `Şu hatayı aldık: Yukarıdaki hatayı çözmek için gereken en minimal ve doğru düzeltmeyi yap.`,
        `Lütfen sadece hatayı düzeltecek patch'i veya dosya güncellemesini uygula.`,
      ].join('\n');

      this.contextBus.recordLog('CORRECTION', 'warn', `Triggering correction attempt ${attemptNum}`, {
        exitCode: verification.exitCode,
      });

      // Stream output from the model
      const executionResult = await primaryAdapter.execute(repairPrompt, {
        cwd: this.cwd,
        allowEdits: true,
        onStdout: (chunk) => logger.streamChunk(chunk),
      });

      // Capture git diff snapshot of the repair
      const diffResult = this.gitUtils.getDiff();
      let patchFile: string | undefined;

      if (diffResult.hasChanges) {
        patchFile = this.contextBus.savePatch(`attempt-${attemptNum}.patch`, diffResult.diff);
      }

      // Re-verify after model repair attempt
      logger.info(`Re-verifying after correction attempt ${attemptNum}...`);
      verification = await this.runVerification();

      const attemptRecord: SelfCorrectionAttempt = {
        attemptNumber: attemptNum,
        verificationResult: verification,
        repairPrompt,
        modelResponse: executionResult.stdout,
        patchFile,
        durationMs: Date.now() - attemptStartTime,
      };

      attempts.push(attemptRecord);

      if (verification.success) {
        logger.success(`Self-correction succeeded on attempt ${attemptNum}! All tests/checks pass.`);
        this.contextBus.recordLog('CORRECTION', 'info', `Self-correction succeeded on attempt ${attemptNum}`);
        this.contextBus.updateManifest({
          correctionAttempts: attemptNum,
          selfCorrectionPassed: true,
        });

        return {
          passed: true,
          attemptsCount: attemptNum,
          attempts,
          finalVerification: verification,
        };
      } else {
        logger.warn(`Correction attempt ${attemptNum} did not resolve the error.`);
      }
    }

    // Budget exhausted
    logger.error(`Self-correction budget exhausted (${this.maxRetries} retries). Code remains failing.`);
    this.contextBus.recordLog('CORRECTION', 'error', 'Self-correction retry budget exhausted', {
      attempts: attempts.length,
    });
    this.contextBus.updateManifest({
      correctionAttempts: attempts.length,
      selfCorrectionPassed: false,
    });

    return {
      passed: false,
      attemptsCount: attempts.length,
      attempts,
      finalVerification: verification,
      errorSummary: `Failed after ${this.maxRetries} attempts: ${verification.output.slice(0, 300)}`,
    };
  }
}
