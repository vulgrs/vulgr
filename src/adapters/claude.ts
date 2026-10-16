import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig, CliExecutionOptions } from '../types/index.js';
import { claudeStreamJsonParser, type OutputParser } from './outputParsers.js';

export class ClaudeAdapter extends BaseCliAdapter {
  readonly name = 'claude';

  constructor(config: CliAdapterConfig = {}) {
    super(config);
  }

  protected getDefaultBinary(): string {
    return 'claude';
  }

  /** JSON events, so the real token counts and cost of each call are known. */
  protected override createOutputParser(options?: CliExecutionOptions): OutputParser {
    return claudeStreamJsonParser(options?.onActivity);
  }

  /**
   * `claude -p` reads the prompt from stdin. Print mode can't answer permission
   * prompts, so a builder gets `--permission-mode acceptEdits` (file edits are
   * applied, shell commands still need approval); reviewers stay read-only.
   */
  protected buildArgs(_prompt: string, options?: CliExecutionOptions): string[] {
    const args: string[] = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (options?.allowEdits) args.push('--permission-mode', 'acceptEdits');
    if (this.extraArgs.length > 0) args.push(...this.extraArgs);
    return args;
  }
}
