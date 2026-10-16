import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BrowserWindow } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { ConfigManager } from '../src/engine/configManager.js';
import {
  approvalArgs,
  approvalResponseLine,
  readApprovalRequest,
  type ApprovalMode,
} from '../src/engine/toolApproval.js';
import type { ApprovalBroker } from './approvalBroker.js';

const SAFE_TOKEN_RE = /^[a-zA-Z0-9._:/-]+$/;

/** A base64-encoded image attachment for a user turn. */
export interface ImageAttachment {
  mediaType: string; // e.g. "image/png"
  data: string; // base64 (no data-URI prefix)
}

/**
 * Options for launching a structured Claude Code chat session.
 */
export interface ClaudeChatStartOptions {
  /** Renderer-generated session id used to route IPC events. */
  id: string;
  /** First user prompt to send once the process is ready. */
  prompt: string;
  /** Working directory Claude Code operates in. */
  cwd?: string;
  /** Model alias or id (e.g. 'fable', 'opus', 'sonnet', 'haiku'). */
  model?: string;
  /** Effort level: low | medium | high | xhigh | max. */
  effort?: string;
  /** Images attached to the opening prompt. */
  images?: ImageAttachment[];
  /** Resume a prior Claude Code session id (multi-turn continuation across restarts). */
  resumeSessionId?: string;
  /** How tools outside acceptEdits (shell commands...) are approved. Default 'ask'. */
  approvals?: ApprovalMode;
  /** UI language, for the message Claude gets when the user refuses. */
  lang?: string;
}

/**
 * A single Claude Code stream-json event, forwarded verbatim to the renderer.
 * The renderer maps these into chat bubbles.
 */
export type ClaudeChatEvent = Record<string, unknown> & { type?: string };

/**
 * Manages headless Claude Code processes running in streaming-JSON mode.
 *
 * Unlike the interactive xterm PTY, this spawns `claude --print
 * --output-format stream-json --input-format stream-json`, which emits one
 * structured JSON object per line (assistant messages, tool_use, tool_result,
 * result, ...) and accepts follow-up user messages on stdin. That gives us a
 * clean event stream to render as chat bubbles instead of parsing ANSI.
 */
export class ClaudeChatManager {
  private sessions = new Map<string, ChildProcessWithoutNullStreams>();
  private buffers = new Map<string, string>();
  private window: BrowserWindow | null = null;
  private configManager: ConfigManager | null = null;
  private approvals: ApprovalBroker | null = null;
  private modes = new Map<string, { approvals: ApprovalMode; isTr: boolean }>();

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  setConfigManager(cm: ConfigManager) {
    this.configManager = cm;
  }

  setApprovalBroker(broker: ApprovalBroker) {
    this.approvals = broker;
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const home = os.homedir();
    const isWindows = process.platform === 'win32';
    const extraPaths = isWindows
      ? [path.join(home, '.local', 'bin'), path.join(home, 'AppData', 'Roaming', 'npm')]
      : [
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          '/usr/local/sbin',
          path.join(home, '.local', 'bin'),
          path.join(home, '.npm-global', 'bin'),
          path.join(home, 'bin'),
        ];
    const env = { ...process.env } as NodeJS.ProcessEnv;
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    const updatedPath = [...extraPaths, env[pathKey] || ''].filter(Boolean).join(path.delimiter);
    env[pathKey] = updatedPath;
    env.PATH = updatedPath;
    return env;
  }

  private buildArgs(options: ClaudeChatStartOptions): string[] {
    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    // Permission handling: a headless session cannot answer interactive
    // prompts, so we either bypass permission checks (autonomous file
    // creation + dependency installs, gated behind the user's config) or fall
    // back to auto-accepting edits only.
    const skip = this.configManager?.getConfig?.()?.claude?.skipPermissions ?? false;
    if (skip) {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-mode', 'acceptEdits');
      // Other tools are asked about over stdio and answered by the user (or automatically).
      if (this.approvals) args.push(...approvalArgs(options.approvals ?? 'ask'));
    }

    const model = options.model || this.configManager?.getConfig?.()?.claude?.model;
    if (model && model !== 'default' && SAFE_TOKEN_RE.test(model)) {
      args.push('--model', model);
    }

    if (options.effort && SAFE_TOKEN_RE.test(options.effort)) {
      args.push('--effort', options.effort);
    }

    if (options.resumeSessionId && SAFE_TOKEN_RE.test(options.resumeSessionId)) {
      args.push('--resume', options.resumeSessionId);
    }

    const extra = this.configManager?.getConfig?.()?.claude?.additionalFlags ?? [];
    if (Array.isArray(extra) && extra.length > 0) {
      for (const flag of extra) {
        if (typeof flag === 'string' && SAFE_TOKEN_RE.test(flag)) {
          args.push(flag);
        }
      }
    }

    return args;
  }

  private resolveClaudeBinary(env: NodeJS.ProcessEnv): string {
    try {
      const locator = process.platform === 'win32' ? 'where.exe' : 'which';
      const out = execFileSync(locator, ['claude'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env,
        timeout: 5000,
        windowsHide: true,
      });
      return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || 'claude';
    } catch {
      return 'claude';
    }
  }

  /** Encode a user turn (text + optional images) as a stream-json line. */
  private encodeUserMessage(text: string, images?: ImageAttachment[]): string {
    const content: Array<Record<string, unknown>> = [];
    if (text) content.push({ type: 'text', text });
    if (images) {
      for (const img of images) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        });
      }
    }
    if (content.length === 0) content.push({ type: 'text', text: '' });
    return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
  }

  private emit(id: string, event: ClaudeChatEvent) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('claudechat:event', { id, event });
    }
  }

  start(options: ClaudeChatStartOptions): { id: string; pid: number; error?: string } {
    // Reuse an existing live session for the same id: just send the prompt.
    const existing = this.sessions.get(options.id);
    if (existing && !existing.killed) {
      this.send(options.id, options.prompt, options.images);
      return { id: options.id, pid: existing.pid ?? -1 };
    }

    const cwd = options.cwd || process.cwd();
    const args = this.buildArgs(options);
    const env = this.buildEnv();
    const resolvedBin = this.resolveClaudeBinary(env);
    const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedBin);

    try {
      const child = spawn(resolvedBin, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: needsShell,
        windowsHide: true,
      });

      this.sessions.set(options.id, child);
      this.buffers.set(options.id, '');
      this.modes.set(options.id, {
        approvals: options.approvals ?? 'ask',
        isTr: (options.lang ?? 'tr').startsWith('tr'),
      });

      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => this.ingest(options.id, chunk));

      child.stderr.setEncoding('utf-8');
      child.stderr.on('data', (chunk: string) => {
        const text = String(chunk).trim();
        if (text) {
          this.emit(options.id, { type: 'stderr', text });
        }
      });

      child.on('error', (err: Error) => {
        this.emit(options.id, { type: 'fatal', text: err.message });
        this.cleanup(options.id);
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('claudechat:exit', { id: options.id, code: 1 });
        }
      });

      child.on('close', (code: number | null) => {
        this.flush(options.id);
        this.cleanup(options.id);
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('claudechat:exit', { id: options.id, code: code ?? 0 });
        }
      });

      // Send the opening prompt (with any attached images).
      child.stdin.write(this.encodeUserMessage(options.prompt, options.images));

      return { id: options.id, pid: child.pid ?? -1 };
    } catch (err: any) {
      this.emit(options.id, { type: 'fatal', text: err?.message || String(err) });
      return { id: options.id, pid: -1, error: err?.message || String(err) };
    }
  }

  /** Append raw stdout, split on newlines, parse and forward complete JSON lines. */
  private ingest(id: string, chunk: string) {
    let buffer = (this.buffers.get(id) || '') + chunk;
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) this.parseLine(id, line);
    }
    this.buffers.set(id, buffer);
  }

  private flush(id: string) {
    const remaining = (this.buffers.get(id) || '').trim();
    if (remaining) this.parseLine(id, remaining);
    this.buffers.set(id, '');
  }

  private parseLine(id: string, line: string) {
    try {
      const parsed = JSON.parse(line) as ClaudeChatEvent;
      const req = readApprovalRequest(parsed);
      if (req) {
        this.answerApproval(id, req);
        return;
      }
      this.emit(id, parsed);
    } catch {
      // Non-JSON output (rare in stream-json mode) is surfaced as raw text.
      this.emit(id, { type: 'raw', text: line });
    }
  }

  private answerApproval(id: string, req: NonNullable<ReturnType<typeof readApprovalRequest>>) {
    const mode = this.modes.get(id) ?? { approvals: 'ask' as ApprovalMode, isTr: true };
    const decision =
      mode.approvals === 'auto'
        ? Promise.resolve(true)
        : mode.approvals === 'deny' || !this.approvals
        ? Promise.resolve(false)
        : this.approvals.request(id, { agent: 'claude', tool: req.tool, input: req.input, description: req.description });
    void decision.then((allow) => {
      const child = this.sessions.get(id);
      if (child && !child.killed && child.stdin.writable) {
        child.stdin.write(approvalResponseLine(req.requestId, allow, req.rawInput, mode.isTr));
      }
    });
  }

  /** Send a follow-up user turn (text + optional images) to a live session. */
  send(id: string, text: string, images?: ImageAttachment[]): boolean {
    const child = this.sessions.get(id);
    if (child && !child.killed && child.stdin.writable) {
      child.stdin.write(this.encodeUserMessage(text, images));
      return true;
    }
    return false;
  }

  stop(id: string): boolean {
    const child = this.sessions.get(id);
    if (child) {
      try {
        child.stdin.end();
      } catch {}
      try {
        child.kill('SIGTERM');
      } catch {}
      this.cleanup(id);
      return true;
    }
    return false;
  }

  private cleanup(id: string) {
    this.sessions.delete(id);
    this.buffers.delete(id);
    this.modes.delete(id);
    this.approvals?.cancelChat(id);
  }

  killAll() {
    for (const [id] of this.sessions) {
      this.stop(id);
    }
  }
}
