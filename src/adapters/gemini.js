import { BaseCliAdapter } from './base.js';
export class GeminiAdapter extends BaseCliAdapter {
    name = 'gemini';
    promptMode;
    constructor(config = {}) {
        super(config);
        this.promptMode = config.promptMode ?? 'flag';
    }
    getDefaultBinary() {
        return 'gemini';
    }
    /**
     * Constructs Gemini CLI arguments for non-interactive execution.
     */
    buildArgs(prompt, options) {
        let args = [];
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
