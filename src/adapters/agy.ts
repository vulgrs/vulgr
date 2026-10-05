import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig, CliExecutionOptions } from '../types/index.js';

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
   * `agy -p "<prompt>"` runs one turn non-interactively. Builders get
   * `--mode accept-edits` so file edits don't wait for approval.
   */
  protected buildArgs(prompt: string, options?: CliExecutionOptions): string[] {
    const text =
      prompt.length > MAX_PROMPT_CHARS ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[...truncated]` : prompt;
    const args: string[] = ['-p', text];
    if (options?.allowEdits) args.push('--mode', 'accept-edits');
    if (this.extraArgs.length > 0) args.push(...this.extraArgs);
    return args;
  }
}
