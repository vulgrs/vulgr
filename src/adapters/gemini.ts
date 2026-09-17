import { BaseCliAdapter } from './base.js';
import type { CliAdapterConfig, CliExecutionOptions } from '../types/index.js';

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
        args = ['-p', prompt];
        break;
    }

    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }

    return args;
  }
}
