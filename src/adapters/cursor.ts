import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig, CliExecutionOptions } from '../types/index.js';
import { cursorStreamJsonParser, type OutputParser } from './outputParsers.js';

// Windows caps a whole command line at 32,767 characters.
const MAX_PROMPT_CHARS = 24_000;

export class CursorAgentAdapter extends BaseCliAdapter {
  readonly name = 'cursor';
  // `cursor-agent -p` takes the prompt as an argument.
  protected get promptVia(): 'stdin' | 'arg' {
    return 'arg';
  }

  constructor(config: CliAdapterConfig = {}) {
    super(config);
  }

  protected getDefaultBinary(): string {
    return 'cursor-agent';
  }

  /** JSON events, so each tool call shows up while the agent works. */
  protected override createOutputParser(options?: CliExecutionOptions): OutputParser {
    return cursorStreamJsonParser(options?.onActivity);
  }

  /**
   * `cursor-agent -p "<prompt>"` runs one turn in print mode. Without `--force`
   * it only proposes edits, so builders get it; reviewers stay read-only.
   * `--trust`: print mode can't answer the "trust this folder?" question and
   * exits 1 on any folder not trusted before.
   */
  protected buildArgs(prompt: string, options?: CliExecutionOptions): string[] {
    const text =
      prompt.length > MAX_PROMPT_CHARS ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[...truncated]` : prompt;
    const args: string[] = ['-p', '--trust', '--output-format', 'stream-json', text];
    if (options?.allowEdits) args.push('--force');
    if (this.extraArgs.length > 0) args.push(...this.extraArgs);
    return args;
  }
}
