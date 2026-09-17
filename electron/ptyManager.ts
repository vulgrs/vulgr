import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import os from 'node:os';
import type { ConfigManager } from '../src/engine/configManager.js';

export interface PtyCreateOptions {
  id: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
}

export class PtyManager {
  private terminals = new Map<string, pty.IPty>();
  private window: BrowserWindow | null = null;
  private configManager: ConfigManager | null = null;

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  setConfigManager(cm: ConfigManager) {
    this.configManager = cm;
  }

  createTerminal(options: PtyCreateOptions) {
    const isWindows = process.platform === 'win32';
    const shellResolution = this.configManager ? this.configManager.resolveShellBinary() : {
      shell: isWindows ? 'powershell.exe' : (process.env.SHELL || 'bash'),
      args: isWindows ? ['-NoLogo'] : [],
    };

    let file = options.command || shellResolution.shell;
    let args: string[] = options.args || shellResolution.args || [];

    // If launching specific CLI on Windows, handle powershell invocation with config flags
    if (options.command && options.command !== 'powershell.exe' && options.command !== 'cmd.exe' && options.command !== 'wsl.exe') {
      if (isWindows) {
        let invocation = options.command;
        if (options.command === 'claude' && this.configManager) {
          const claudeFlags = this.configManager.getClaudeCliFlags();
          if (claudeFlags.length > 0) {
            invocation = `claude ${claudeFlags.join(' ')}`;
          }
        }
        file = 'powershell.exe';
        args = ['-NoLogo', '-NoExit', '-Command', invocation];
      }
    }

    const cwd = options.cwd || process.cwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as { [key: string]: string };

    const ptyProcess = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });

    this.terminals.set(options.id, ptyProcess);

    ptyProcess.onData((data: string) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pty:data', {
          id: options.id,
          data,
        });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      this.terminals.delete(options.id);
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pty:exit', {
          id: options.id,
          exitCode,
          signal,
        });
      }
    });

    return { id: options.id, pid: ptyProcess.pid };
  }

  write(id: string, data: string) {
    const term = this.terminals.get(id);
    if (term) {
      term.write(data);
    }
  }

  resize(id: string, cols: number, rows: number) {
    const term = this.terminals.get(id);
    if (term) {
      try {
        term.resize(cols, rows);
      } catch (err) {
        // Ignore resize race conditions
      }
    }
  }

  kill(id: string) {
    const term = this.terminals.get(id);
    if (term) {
      term.kill();
      this.terminals.delete(id);
    }
  }

  killAll() {
    for (const [id, term] of this.terminals.entries()) {
      try {
        term.kill();
      } catch {}
      this.terminals.delete(id);
    }
  }
}
