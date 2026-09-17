import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig, CliExecutionOptions } from '../types/index.js';

export class CodexAdapter extends BaseCliAdapter {
  readonly name = 'codex';

  constructor(config: CliAdapterConfig = {}) {
    super(config);
  }

  protected getDefaultBinary(): string {
    return 'codex';
  }

  protected buildArgs(prompt: string, options?: CliExecutionOptions): string[] {
    const args: string[] = ['run', prompt];

    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }

    return args;
  }
}
