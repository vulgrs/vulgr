import { BaseCliAdapter } from './base.js';
export class ClaudeAdapter extends BaseCliAdapter {
    name = 'claude';
    constructor(config = {}) {
        super(config);
    }
    getDefaultBinary() {
        return 'claude';
    }
    /**
     * Constructs Claude CLI arguments.
     * Uses `-p, --print` for non-interactive execution.
     */
    buildArgs(prompt, options) {
        const args = ['-p', prompt];
        // If non-interactive automated edits are intended, allow auto-permission if flag enabled
        if (this.extraArgs.length > 0) {
            args.push(...this.extraArgs);
        }
        return args;
    }
}
