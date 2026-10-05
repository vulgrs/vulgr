import { BaseCliAdapter } from './base.js';
import { ClaudeAdapter } from './claude.js';
import type { CliAdapterConfig, CliExecutionOptions, CliExecutionResult } from '../types/index.js';

export interface GeminiAdapterConfig extends CliAdapterConfig {
  promptMode?: 'flag' | 'positional' | 'run';
}

export class GeminiAdapter extends BaseCliAdapter {
  readonly name = 'gemini';
  private readonly promptMode: 'flag' | 'positional' | 'run';

  constructor(config: GeminiAdapterConfig = {}) {
    super(config);
    this.promptMode = config.promptMode ?? 'flag';
  }

  protected getDefaultBinary(): string {
    return 'gemini';
  }

  // Default mode pipes the prompt in: Gemini CLI runs one non-interactive turn
  // when stdin isn't a terminal, and it's an npm .cmd shim on Windows, where a
  // prompt passed as an argument would go through cmd.exe quoting.
  protected get promptVia(): 'stdin' | 'arg' {
    return this.promptMode === 'flag' ? 'stdin' : 'arg';
  }

  /**
   * Constructs Gemini CLI arguments for non-interactive execution.
   */
  protected buildArgs(prompt: string, options?: CliExecutionOptions): string[] {
    let args: string[] = [];

    switch (this.promptMode) {
      case 'run':
        args = ['run', prompt];
        break;
      case 'positional':
        args = [prompt];
        break;
      case 'flag':
      default:
        break;
    }

    if (options?.allowEdits) args.push('--approval-mode', 'auto_edit');

    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }

    return args;
  }

  override async execute(prompt: string, options: CliExecutionOptions = {}): Promise<CliExecutionResult> {
    if (!(await this.isAvailable())) {
      const claude = new ClaudeAdapter({
        defaultTimeoutMs: this.defaultTimeoutMs,
        maxBufferBytes: this.maxBufferBytes,
        env: this.defaultEnv,
        extraArgs: this.extraArgs,
      });
      return claude.execute(`[Role: Gemini / Auditor]\n${prompt}`, options);
    }
    return super.execute(prompt, options);
  }
}

