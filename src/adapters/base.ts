import { spawn, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { ICliAdapter, CliExecutionOptions, CliExecutionResult, CliAdapterConfig } from '../types/index.js';
import { terminateChildProcessSafely } from '../utils/processTree.js';

export abstract class BaseCliAdapter implements ICliAdapter {
  abstract readonly name: string;
  readonly binaryPath: string;
  protected readonly defaultTimeoutMs: number;
  protected readonly maxBufferBytes: number;
  protected readonly defaultEnv: Record<string, string>;
  protected readonly extraArgs: string[];
  /**
   * How the prompt reaches the CLI. 'stdin' (the default) pipes it in, so
   * multi-line prompts with quotes survive intact on every platform; 'arg'
   * passes it as a command-line argument for CLIs that can't read stdin.
   */
  protected get promptVia(): 'stdin' | 'arg' {
    return 'stdin';
  }

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
   * PATH including the per-user install locations agent CLIs use (an app
   * started from the Start menu often doesn't have them).
   */
  protected buildPath(): string {
    const home = os.homedir();
    const extra = [
      path.join(home, '.local', 'bin'),
      path.join(home, '.opencode', 'bin'),
      path.join(home, 'AppData', 'Local', 'agy', 'bin'),
      path.join(home, 'AppData', 'Local', 'cursor-agent'),
      path.join(home, 'AppData', 'Roaming', 'npm'),
      path.join(home, '.cargo', 'bin'),
    ];
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    return [...extra, process.env[key] || ''].filter(Boolean).join(path.delimiter);
  }

  /** Absolute path of the executable, or null when it isn't installed. */
  resolveBinary(): string | null {
    try {
      const cmd = process.platform === 'win32' ? `where.exe ${this.binaryPath}` : `which ${this.binaryPath}`;
      const out = execSync(cmd, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, PATH: this.buildPath(), Path: this.buildPath() },
        timeout: 5000,
      });
      return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if the CLI executable is available in PATH.
   */
  async isAvailable(): Promise<boolean> {
    return this.resolveBinary() !== null;
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

    const fullPath = this.buildPath();
    const env = {
      ...process.env,
      ...this.defaultEnv,
      ...options.env,
      PATH: fullPath,
      Path: fullPath,
      CI: 'true', // Enforce non-interactive behavior in most CLIs
    };

    const args = [...this.buildArgs(prompt, options), ...(options.extraArgs ?? [])];
    const stdinInput = options.stdinInput ?? (this.promptVia === 'stdin' ? prompt : undefined);

    // Real executables are spawned directly so Node quotes every argument
    // correctly. Only Windows .cmd/.bat shims (npm-installed CLIs) need a
    // shell, and those always receive their prompt on stdin.
    const resolved = this.resolveBinary();
    const needsShell = process.platform === 'win32' && (!resolved || /\.(cmd|bat)$/i.test(resolved));
    const command = resolved && !needsShell ? resolved : this.binaryPath;

    return new Promise<CliExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let totalBytesAccumulated = 0;
      let isSettled = false;

      // Spawn process safely
      const child = spawn(command, args, {
        cwd,
        env,
        shell: needsShell,
        windowsHide: true,
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
      if (stdinInput && child.stdin) {
        child.stdin.write(stdinInput);
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
