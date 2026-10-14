import type { AgentUsage } from '../types/index.js';

/**
 * Turns a CLI's machine-readable output back into the plain text the engine
 * expects, and picks up what the run really used (tokens, cost) on the way.
 */
export interface OutputParser {
  /** A raw stdout chunk in; the text to show live out ('' when there is none yet). */
  push(chunk: string): string;
  /** The whole run's output: its plain text and usage. */
  finish(rawStdout: string, stderr: string): { stdout: string; usage?: AgentUsage };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * `claude -p --output-format stream-json --verbose`: one JSON event per line.
 * Assistant text is streamed as it comes; the closing `result` event carries
 * the final answer, the token counts and the cost in USD.
 */
export function claudeStreamJsonParser(): OutputParser {
  let pending = '';
  let text = '';
  let result: string | undefined;
  let usage: AgentUsage | undefined;
  let sawJson = false;

  const handle = (line: string): string => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return '';
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return '';
    }
    sawJson = true;
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      const out = event.message.content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('');
      if (out) {
        const piece = text ? `\n${out}` : out;
        text += piece;
        return piece;
      }
    }
    if (event.type === 'result') {
      if (typeof event.result === 'string') result = event.result;
      const u = event.usage ?? {};
      usage = {
        inputTokens: num(u.input_tokens),
        outputTokens: num(u.output_tokens),
        cacheReadTokens: num(u.cache_read_input_tokens),
        cacheWriteTokens: num(u.cache_creation_input_tokens),
        costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined,
      };
    }
    return '';
  };

  return {
    push(chunk) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      return lines.map(handle).join('');
    },
    finish(rawStdout) {
      if (pending) handle(pending);
      pending = '';
      // An older CLI, or an error before any event: keep what it printed.
      if (!sawJson) return { stdout: rawStdout };
      return { stdout: result ?? text, usage };
    },
  };
}

/**
 * `codex exec` prints its answer as text and ends with "tokens used" and a
 * number (on the same or the next line); there is no cost.
 */
export function codexTokensParser(): OutputParser {
  return {
    push: (chunk) => chunk,
    finish(rawStdout, stderr) {
      const match = `${stderr}\n${rawStdout}`.match(/tokens used[:\s]*([\d,.]+)/i);
      const total = match ? Number(match[1].replace(/[,.]/g, '')) : NaN;
      return {
        stdout: rawStdout,
        usage: Number.isFinite(total) && total > 0 ? { inputTokens: 0, outputTokens: 0, totalTokens: total } : undefined,
      };
    },
  };
}

/** Total tokens of a usage, whichever way the CLI reported them. */
export const usageTokens = (u: AgentUsage | undefined) =>
  !u ? 0 : u.totalTokens ?? u.inputTokens + u.outputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0);

/** Adds usages up; the cost stays unknown unless at least one part had it. */
export function addUsage(a: AgentUsage | undefined, b: AgentUsage | undefined): AgentUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const cost = a.costUsd === undefined && b.costUsd === undefined ? undefined : (a.costUsd ?? 0) + (b.costUsd ?? 0);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
    totalTokens: usageTokens(a) + usageTokens(b),
    costUsd: cost,
  };
}
