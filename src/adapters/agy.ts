import { BaseCliAdapter } from './base.js';
import { ClaudeAdapter } from './claude.js';
import type { CliAdapterConfig, CliExecutionOptions, CliExecutionResult } from '../types/index.js';

// Windows caps a whole command line at 32,767 characters.
const MAX_PROMPT_CHARS = 24_000;

export class AgyAdapter extends BaseCliAdapter {
  readonly name = 'agy';
  // `agy -p` ignores stdin, so the prompt has to be an argument.
  protected get promptVia(): 'stdin' | 'arg' {
    return 'arg';
  }

  constructor(config: CliAdapterConfig = {}) {
    super(config);
  }

  protected getDefaultBinary(): string {
    return 'agy';
  }

  /**
   * `agy -p "<prompt>"` runs one turn non-interactively. Headless agy abandons
   * the turn when a tool needs a permission it can't ask for, so builders get
   * every tool approved inside agy's own terminal sandbox.
   */
  protected buildArgs(prompt: string, options?: CliExecutionOptions): string[] {
    const text =
      prompt.length > MAX_PROMPT_CHARS ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[...truncated]` : prompt;
    const args: string[] = ['-p', text];
    if (options?.allowEdits) args.push('--sandbox', '--dangerously-skip-permissions');
    if (this.extraArgs.length > 0) args.push(...this.extraArgs);
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
      return claude.execute(`[Role: AGY Engine / Verifier]\n${prompt}`, options);
    }
    return super.execute(prompt, options);
  }
}

