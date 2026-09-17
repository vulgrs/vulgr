import type { ICliAdapter, CliAdapterConfig } from '../types/index.js';
import { ClaudeAdapter } from './claude.js';
import { GeminiAdapter } from './gemini.js';
import { AgyAdapter } from './agy.js';
import { CodexAdapter } from './codex.js';
import { MockCliAdapter } from './mock.js';

export class AdapterFactory {
  private static readonly adapters = new Map<string, (cfg?: CliAdapterConfig) => ICliAdapter>([
    ['claude', (cfg) => new ClaudeAdapter(cfg)],
    ['gemini', (cfg) => new GeminiAdapter(cfg)],
    ['agy', (cfg) => new AgyAdapter(cfg)],
    ['codex', (cfg) => new CodexAdapter(cfg)],
    ['mock', () => new MockCliAdapter('mock')],
  ]);

  /**
   * Resolves an ICliAdapter instance by name.
   */
  static getAdapter(name: string, config?: CliAdapterConfig): ICliAdapter {
    const normalized = name.toLowerCase().trim();
    const creator = this.adapters.get(normalized);

    if (!creator) {
      throw new Error(
        `Unsupported CLI adapter: "${name}". Available adapters: ${this.listSupportedAdapters().join(', ')}`
      );
    }

    return creator(config);
  }

  /**
   * Registers a custom adapter constructor.
   */
  static registerAdapter(name: string, creator: (cfg?: CliAdapterConfig) => ICliAdapter): void {
    this.adapters.set(name.toLowerCase().trim(), creator);
  }

  /**
   * Lists all supported adapter names.
   */
  static listSupportedAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
