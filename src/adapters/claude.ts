import { BaseCliAdapter, type StdinSession } from './base.js';
import { approvalResponseLine, readApprovalRequest } from '../engine/toolApproval.js';
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
   * With an approval handler, those commands are asked about over stdio instead.
   */
  protected buildArgs(_prompt: string, options?: CliExecutionOptions): string[] {
    const args: string[] = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (options?.allowEdits) args.push('--permission-mode', 'acceptEdits');
    if (options?.onToolApproval) {
      args.push('--input-format', 'stream-json', '--permission-prompt-tool', 'stdio');
    }
    if (this.extraArgs.length > 0) args.push(...this.extraArgs);
    return args;
  }

  /** The prompt as a stream-json turn; stdin stays open to answer approvals until the result. */
  protected override createStdinSession(prompt: string, options?: CliExecutionOptions): StdinSession | null {
    const ask = options?.onToolApproval;
    if (!ask) return null;
    return {
      initial: JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n',
      onLine: (line, io) => {
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event?.type === 'result') {
          io.end();
          return;
        }
        const req = readApprovalRequest(event);
        if (!req) return;
        void ask({ tool: req.tool, input: req.input, description: req.description })
          .catch(() => false)
          .then((ok) => io.write(approvalResponseLine(req.requestId, ok, req.rawInput)));
      },
    };
  }
}
