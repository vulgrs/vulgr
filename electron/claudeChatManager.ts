import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BrowserWindow } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { ConfigManager } from '../src/engine/configManager.js';

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

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  setConfigManager(cm: ConfigManager) {
    this.configManager = cm;
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
    }

    const model = options.model || this.configManager?.getConfig?.()?.claude?.model;
    if (model && model !== 'default') {
      args.push('--model', model);
    }

    if (options.effort) {
      args.push('--effort', options.effort);
    }

    if (options.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
    }

    const extra = this.configManager?.getConfig?.()?.claude?.additionalFlags ?? [];
    if (Array.isArray(extra) && extra.length > 0) {
      args.push(...extra);
    }

    return args;
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

    try {
      const child = spawn('claude', args, {
        cwd,
        env: this.buildEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      this.sessions.set(options.id, child);
      this.buffers.set(options.id, '');

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
      this.emit(id, parsed);
    } catch {
      // Non-JSON output (rare in stream-json mode) is surfaced as raw text.
      this.emit(id, { type: 'raw', text: line });
    }
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
  }

  killAll() {
    for (const [id] of this.sessions) {
      this.stop(id);
    }
  }
}
