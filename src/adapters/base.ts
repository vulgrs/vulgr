import { spawn, execSync } from 'node:child_process';
import type { ICliAdapter, CliExecutionOptions, CliExecutionResult, CliAdapterConfig } from '../types/index.js';
import { terminateChildProcessSafely } from '../utils/processTree.js';

export abstract class BaseCliAdapter implements ICliAdapter {
  abstract readonly name: string;
  readonly binaryPath: string;
  protected readonly defaultTimeoutMs: number;
  protected readonly maxBufferBytes: number;
  protected readonly defaultEnv: Record<string, string>;
  protected readonly extraArgs: string[];

  constructor(config: CliAdapterConfig = {}) {
    this.binaryPath = config.binaryPath || this.getDefaultBinary();
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 180_000; // 3 minutes default
    this.maxBufferBytes = config.maxBufferBytes ?? 10 * 1024 * 1024; // 10MB buffer cap
    this.defaultEnv = config.env ?? {};
    this.extraArgs = config.extraArgs ?? [];
  }

  /**
   * Default binary name for the CLI (e.g., 'claude' or 'gemini')
   */
  protected abstract getDefaultBinary(): string;

  /**
   * Constructs CLI arguments for non-interactive prompt execution.
   */
  protected abstract buildArgs(prompt: string, options?: CliExecutionOptions): string[];

  /**
   * Check if the CLI executable is available in PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const checkCmd = process.platform === 'win32'
        ? `where.exe ${this.binaryPath}`
        : `which ${this.binaryPath}`;
      execSync(checkCmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Queries the version string of the CLI binary.
   */
  async getVersion(): Promise<string | null> {
    try {
      const output = execSync(`${this.binaryPath} --version`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      });
      return output.trim();
    } catch {
      return null;
    }
  }

  /**
   * Executes the CLI tool in isolated, non-interactive mode with streaming IPC.
   */
  async execute(prompt: string, options: CliExecutionOptions = {}): Promise<CliExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxBuffer = options.maxBufferBytes ?? this.maxBufferBytes;
    const cwd = options.cwd ?? process.cwd();

    const env = {
      ...process.env,
      ...this.defaultEnv,
      ...options.env,
      CI: 'true', // Enforce non-interactive behavior in most CLIs
    };

    const args = [...this.buildArgs(prompt, options), ...(options.extraArgs ?? [])];

    return new Promise<CliExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let totalBytesAccumulated = 0;
      let isSettled = false;

      // Spawn process safely
      const child = spawn(this.binaryPath, args, {
        cwd,
        env,
        // On Windows with .cmd/.bat or paths, shell can help resolve path correctly
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Stream handling for stdout
      child.stdout?.on('data', (data: Buffer) => {
        totalBytesAccumulated += data.length;
        if (totalBytesAccumulated > maxBuffer) {
          stderr += `\n[Fatal: Max buffer threshold of ${maxBuffer} bytes exceeded. Process halted to prevent memory exhaustion.]`;
          void terminateChildProcessSafely(child, 500);
          return;
        }

        const chunk = data.toString('utf-8');
        stdout += chunk;
        if (options.onStdout) {
          options.onStdout(chunk);
        }
      });

      // Stream handling for stderr
      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        stderr += chunk;
        if (options.onStderr) {
          options.onStderr(chunk);
        }
      });

      // Pass stdin input if supplied
      if (options.stdinInput && child.stdin) {
        child.stdin.write(options.stdinInput);
        child.stdin.end();
      } else {
        child.stdin?.end();
      }

      // Strict timeout watcher
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        stderr += `\n[Process timed out after ${timeoutMs}ms. Initiating safe termination.]`;
        void terminateChildProcessSafely(child, 1000);
      }, timeoutMs);

      // Handle child process error (e.g., spawn ENOENT)
      child.on('error', (err: Error) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutTimer);

        resolve({
          exitCode: 1,
          stdout,
          stderr: `${stderr}\n${err.message}`,
          executionTimeMs: Date.now() - startTime,
          timedOut,
          error: err,
        });
      });

      // Handle completion
      child.on('close', (code: number | null) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutTimer);

        resolve({
          exitCode: code,
          stdout,
          stderr,
          executionTimeMs: Date.now() - startTime,
          timedOut,
        });
      });
    });
  }
}
