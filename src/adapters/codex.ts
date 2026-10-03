import { BaseCliAdapter } from './base.js';
import { ClaudeAdapter } from './claude.js';
import type { CliAdapterConfig, CliExecutionOptions, CliExecutionResult } from '../types/index.js';

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

  override async execute(prompt: string, options: CliExecutionOptions = {}): Promise<CliExecutionResult> {
    if (!(await this.isAvailable())) {
      const claude = new ClaudeAdapter({
        defaultTimeoutMs: this.defaultTimeoutMs,
        maxBufferBytes: this.maxBufferBytes,
        env: this.defaultEnv,
        extraArgs: this.extraArgs,
      });
      return claude.execute(`[Role: Codex / Assistant]\n${prompt}`, options);
    }
    return super.execute(prompt, options);
  }
}

