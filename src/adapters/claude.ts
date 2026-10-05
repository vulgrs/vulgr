import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig, CliExecutionOptions } from '../types/index.js';

export class ClaudeAdapter extends BaseCliAdapter {
  readonly name = 'claude';

  constructor(config: CliAdapterConfig = {}) {
    super(config);
  }

  protected getDefaultBinary(): string {
    return 'claude';
  }

  /**
   * `claude -p` reads the prompt from stdin. Print mode can't answer permission
   * prompts, so a builder gets `--permission-mode acceptEdits` (file edits are
   * applied, shell commands still need approval); reviewers stay read-only.
   */
  protected buildArgs(_prompt: string, options?: CliExecutionOptions): string[] {
    const args: string[] = ['-p'];
    if (options?.allowEdits) args.push('--permission-mode', 'acceptEdits');
    if (this.extraArgs.length > 0) args.push(...this.extraArgs);
    return args;
  }
}
