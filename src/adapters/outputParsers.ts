import type { AgentActivity, AgentUsage } from '../types/index.js';

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
export function claudeStreamJsonParser(onActivity?: (a: AgentActivity) => void): OutputParser {
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
    if (onActivity && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block?.type === 'tool_use' && block.id) {
          onActivity({ id: block.id, tool: block.name || 'Tool', input: toolInputSummary(block.input), status: 'running' });
        } else if (block?.type === 'tool_result' && block.tool_use_id) {
          onActivity({
            id: block.tool_use_id,
            tool: '',
            status: block.is_error ? 'error' : 'done',
            output: clip(contentText(block.content)),
          });
        }
      }
    }
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

const clip = (text: string, max = 4000) => (text.length > max ? `${text.slice(0, max)}\n…` : text);

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === 'string' ? c : typeof c?.text === 'string' ? c.text : '')).join('\n');
  }
  return '';
}

/** One line naming what a tool call works on: its file, command, pattern or URL. */
function toolInputSummary(input: any): string {
  if (!input || typeof input !== 'object') return typeof input === 'string' ? input : '';
  const v =
    input.command ?? input.file_path ?? input.filePath ?? input.path ?? input.pattern ?? input.globPattern ??
    input.query ?? input.url ?? input.description;
  if (Array.isArray(v)) return v.join(' ');
  if (typeof v === 'string') return v;
  const first = Object.values(input).find((x) => typeof x === 'string');
  return typeof first === 'string' ? first : '';
}

/** Final answers stay as before for the other engines; reasoning was only for the live view. */
const withoutThink = (t: string) => t.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

/** Splits a stream into whole lines and hands each JSON object to `handle`. */
function jsonLines(handle: (event: any) => string) {
  let pending = '';
  let sawJson = false;
  const line = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return '';
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return '';
    }
    sawJson = true;
    return handle(event);
  };
  return {
    push(chunk: string): string {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      return lines.map(line).join('');
    },
    flush(): string {
      const out = pending ? line(pending) : '';
      pending = '';
      return out;
    },
    get sawJson() {
      return sawJson;
    },
  };
}

/**
 * `codex exec --json`: one event per line. Newer CLIs send `item.started` /
 * `item.completed` with typed items; older ones `{ msg: { type } }`. Reasoning
 * comes out wrapped in <think> so the chat folds it like Claude's.
 */
export function codexJsonParser(onActivity?: (a: AgentActivity) => void): OutputParser {
  let text = '';
  let usage: AgentUsage | undefined;
  const say = (piece: string) => {
    if (!piece) return '';
    const out = text ? `\n\n${piece}` : piece;
    text += out;
    return out;
  };
  const think = (t: string) => (t.trim() ? say(`<think>\n${t.trim()}\n</think>`) : '');

  const stream = jsonLines((event) => {
    // Current format.
    const item = event.item;
    if (item && (event.type === 'item.started' || event.type === 'item.updated' || event.type === 'item.completed')) {
      const finished = event.type === 'item.completed';
      switch (item.type) {
        case 'agent_message':
          return finished ? say(String(item.text ?? '')) : '';
        case 'reasoning':
          return finished ? think(String(item.text ?? '')) : '';
        case 'command_execution':
          onActivity?.({
            id: String(item.id),
            tool: 'Bash',
            input: String(item.command ?? ''),
            status: !finished ? 'running' : item.status === 'failed' || (item.exit_code ?? 0) !== 0 ? 'error' : 'done',
            output: finished ? clip(String(item.aggregated_output ?? '')) : undefined,
          });
          return '';
        case 'file_change': {
          const changes: any[] = Array.isArray(item.changes) ? item.changes : [];
          onActivity?.({
            id: String(item.id),
            tool: changes.some((c) => c?.kind === 'add') && changes.every((c) => c?.kind === 'add') ? 'Write' : 'Edit',
            input: changes.map((c) => c?.path).filter(Boolean).join(', '),
            status: !finished ? 'running' : item.status === 'failed' ? 'error' : 'done',
          });
          return '';
        }
        case 'mcp_tool_call':
          onActivity?.({
            id: String(item.id),
            tool: `${item.server ?? 'mcp'}:${item.tool ?? ''}`,
            status: !finished ? 'running' : item.status === 'failed' ? 'error' : 'done',
          });
          return '';
        case 'web_search':
          onActivity?.({ id: String(item.id), tool: 'WebSearch', input: String(item.query ?? ''), status: finished ? 'done' : 'running' });
          return '';
        default:
          return '';
      }
    }
    if (event.type === 'turn.completed' && event.usage) {
      usage = {
        inputTokens: num(event.usage.input_tokens),
        outputTokens: num(event.usage.output_tokens),
        cacheReadTokens: num(event.usage.cached_input_tokens),
      };
      return '';
    }
    if (event.type === 'error' || event.type === 'turn.failed') {
      const message = event.message ?? event.error?.message;
      if (message) onActivity?.({ id: `err-${Date.now()}`, tool: 'Error', input: String(message), status: 'error' });
      return '';
    }

    // Older format.
    const msg = event.msg;
    if (!msg?.type) return '';
    switch (msg.type) {
      case 'agent_message':
        return say(String(msg.message ?? ''));
      case 'agent_reasoning':
        return think(String(msg.text ?? ''));
      case 'exec_command_begin':
        onActivity?.({
          id: String(msg.call_id ?? event.id),
          tool: 'Bash',
          input: Array.isArray(msg.command) ? msg.command.join(' ') : String(msg.command ?? ''),
          status: 'running',
        });
        return '';
      case 'exec_command_end':
        onActivity?.({
          id: String(msg.call_id ?? event.id),
          tool: 'Bash',
          status: (msg.exit_code ?? 0) === 0 ? 'done' : 'error',
          output: clip(String(msg.aggregated_output ?? msg.stdout ?? msg.stderr ?? '')),
        });
        return '';
      case 'patch_apply_begin':
        onActivity?.({
          id: String(msg.call_id ?? event.id),
          tool: 'Edit',
          input: Object.keys(msg.changes ?? {}).join(', '),
          status: 'running',
        });
        return '';
      case 'patch_apply_end':
        onActivity?.({ id: String(msg.call_id ?? event.id), tool: 'Edit', status: msg.success === false ? 'error' : 'done' });
        return '';
      case 'token_count': {
        const u = msg.info?.total_token_usage ?? msg;
        if (u && (u.input_tokens || u.output_tokens)) {
          usage = {
            inputTokens: num(u.input_tokens),
            outputTokens: num(u.output_tokens),
            cacheReadTokens: num(u.cached_input_tokens),
          };
        }
        return '';
      }
      default:
        return '';
    }
  });

  return {
    push: (chunk) => stream.push(chunk),
    finish(rawStdout, stderr) {
      stream.flush();
      // An older CLI without --json, or an error before any event.
      if (!stream.sawJson) return codexTokensParser().finish(rawStdout, stderr);
      return { stdout: withoutThink(text), usage: usage ?? codexTokensParser().finish('', stderr).usage };
    },
  };
}

/** cursor-agent tool-call keys (e.g. `readToolCall`) mapped to Claude Code's tool names. */
const CURSOR_TOOLS: Record<string, string> = {
  shellToolCall: 'Bash',
  readToolCall: 'Read',
  writeToolCall: 'Write',
  editToolCall: 'Edit',
  deleteToolCall: 'Delete',
  grepToolCall: 'Grep',
  globToolCall: 'Glob',
  lsToolCall: 'Glob',
  todoToolCall: 'TodoWrite',
  updateTodosToolCall: 'TodoWrite',
  webSearchToolCall: 'WebSearch',
};

/**
 * `cursor-agent -p --output-format stream-json`: assistant text segments,
 * `tool_call` started/completed events and a closing `result` with the answer.
 */
export function cursorStreamJsonParser(onActivity?: (a: AgentActivity) => void): OutputParser {
  let text = '';
  let result: string | undefined;
  let usage: AgentUsage | undefined;
  let thinking = false;
  const add = (piece: string) => {
    text += piece;
    return piece;
  };
  const stream = jsonLines((event) => {
    // Reasoning streams as deltas; wrapped in <think> so the chat folds it.
    if (event.type === 'thinking') {
      if (event.subtype === 'delta' && typeof event.text === 'string' && event.text) {
        const open = thinking ? '' : `${text && !text.endsWith('\n') ? '\n' : ''}<think>\n`;
        thinking = true;
        return add(open + event.text);
      }
      if (event.subtype === 'completed' && thinking) {
        thinking = false;
        return add('\n</think>\n');
      }
      return '';
    }
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      const out = event.message.content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('');
      if (!out) return '';
      return add(text && !text.endsWith('\n') ? `\n\n${out}` : out);
    }
    if (event.type === 'tool_call' && event.tool_call && typeof event.tool_call === 'object') {
      const [key, call] = Object.entries<any>(event.tool_call)[0] ?? [];
      if (!key) return '';
      const finished = event.subtype === 'completed';
      const res = call?.result;
      const failed = !!(res && (res.error || res.failure || res.rejected));
      const output = res?.success?.stdout ?? res?.success?.output ?? res?.error?.message ?? res?.failure?.message;
      onActivity?.({
        id: String(event.call_id ?? key),
        tool: CURSOR_TOOLS[key] ?? (key === 'function' ? String(call?.name ?? 'Tool') : key.replace(/ToolCall$/, '')),
        input: toolInputSummary(call?.args ?? (typeof call?.arguments === 'string' ? safeJson(call.arguments) : call?.arguments)),
        status: !finished ? 'running' : failed ? 'error' : 'done',
        output: finished && typeof output === 'string' ? clip(output) : undefined,
      });
      return '';
    }
    if (event.type === 'result') {
      if (typeof event.result === 'string') result = event.result;
      const u = event.usage;
      if (u) {
        usage = {
          inputTokens: num(u.inputTokens ?? u.input_tokens),
          outputTokens: num(u.outputTokens ?? u.output_tokens),
          cacheReadTokens: num(u.cacheReadTokens ?? u.cache_read_input_tokens),
          cacheWriteTokens: num(u.cacheWriteTokens ?? u.cache_creation_input_tokens),
        };
      }
    }
    return '';
  });
  return {
    push: (chunk) => stream.push(chunk),
    finish(rawStdout) {
      stream.flush();
      if (!stream.sawJson) return { stdout: rawStdout };
      // `result` runs the text segments together; the segments kept here are spaced.
      return { stdout: withoutThink(text) || result || '', usage };
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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
