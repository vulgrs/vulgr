import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig } from '../types/index.js';

// Windows caps a whole command line at 32,767 characters.
const MAX_PROMPT_CHARS = 24_000;

export class OpenCodeAdapter extends BaseCliAdapter {
  readonly name = 'opencode';
  // `opencode run` takes the message as an argument.
  protected get promptVia(): 'stdin' | 'arg' {
    return 'arg';
  }

  constructor(config: CliAdapterConfig = {}) {
    super(config);
  }

  protected getDefaultBinary(): string {
    return 'opencode';
  }

  /** `opencode run "<prompt>"` runs one turn non-interactively with the user's configured model. */
  protected buildArgs(prompt: string): string[] {
    const text =
      prompt.length > MAX_PROMPT_CHARS ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[...truncated]` : prompt;
    return ['run', text, ...this.extraArgs];
  }
}
