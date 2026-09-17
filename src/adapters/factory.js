import { ClaudeAdapter } from './claude.js';
import { GeminiAdapter } from './gemini.js';
import { MockCliAdapter } from './mock.js';
export class AdapterFactory {
    static adapters = new Map([
        ['claude', (cfg) => new ClaudeAdapter(cfg)],
        ['gemini', (cfg) => new GeminiAdapter(cfg)],
        ['mock', () => new MockCliAdapter('mock')],
    ]);
    /**
     * Resolves an ICliAdapter instance by name.
     */
    static getAdapter(name, config) {
        const normalized = name.toLowerCase().trim();
        const creator = this.adapters.get(normalized);
        if (!creator) {
            throw new Error(`Unsupported CLI adapter: "${name}". Available adapters: ${this.listSupportedAdapters().join(', ')}`);
        }
        return creator(config);
    }
    /**
     * Registers a custom adapter constructor.
     */
    static registerAdapter(name, creator) {
        this.adapters.set(name.toLowerCase().trim(), creator);
    }
    /**
     * Lists all supported adapter names.
     */
    static listSupportedAdapters() {
        return Array.from(this.adapters.keys());
    }
}
