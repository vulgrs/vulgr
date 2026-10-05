import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { ConfigManager } from '../src/engine/configManager.js';

export interface PtyCreateOptions {
  id: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
}

const PTY_FLUSH_MS = 5;

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

    // Plain shell sessions (no explicit command): replace the shell's own
    // prompt with an invisible OSC 633;D marker (exit code + cwd) followed by a
    // newline. The UI uses it to know when a command finished and where the
    // next block starts, and paints its own block header on the reserved row.
    const isPlainShellSession = !options.command;
    if (isPlainShellSession && /(^|[\\/])(powershell|pwsh)(\.exe)?$/i.test(file)) {
      const promptFn =
        'function global:prompt { $ok = $?; $code = if ($ok) { 0 } else { 1 }; ' +
        '"$([char]27)]633;D;$code;$($PWD.Path)$([char]7)`n" }; ' +
        // Everything is bottom-anchored: the prompt starts on the last rows of the pane
        // and output scrolls up from there. clear/cls wipes the screen + scrollback, drops
        // the cursor near the bottom, tells the UI (OSC 633;E) where the clear block's
        // header goes (2 rows) and leaves room for the next prompt (2 rows).
        'function global:Clear-Host { $e = [char]27; ' +
        '$pad = [Math]::Max(0, $Host.UI.RawUI.WindowSize.Height - 4); ' +
        '[Console]::Write("${e}[2J${e}[3J${e}[H" + ("`r`n" * $pad) + "${e}]633;E$([char]7)`r`n`r`n") }; ' +
        // First prompt: start on the last two rows (header row + echo row).
        '[Console]::Write("`r`n" * [Math]::Max(0, $Host.UI.RawUI.WindowSize.Height - 2))';
      args = ['-NoLogo', '-NoExit', '-Command', promptFn];
    }

    // A pane can be remounted with the same session id (React StrictMode, HMR).
    // Replace any process still registered under it instead of leaking it.
    this.kill(options.id);

    const cwd = options.cwd || process.cwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const home = os.homedir();
    const extraPaths = [
      path.join(home, '.local', 'bin'),
      path.join(home, 'AppData', 'Local', 'agy', 'bin'),
      path.join(home, 'AppData', 'Roaming', 'npm'),
      path.join(home, '.cargo', 'bin'),
    ];

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as { [key: string]: string };

    if (isPlainShellSession && !isWindows) {
      // bash/zsh: same OSC 633;D marker as the PowerShell prompt above.
      env['PS1'] = '';
      env['PROMPT_COMMAND'] = 'printf "\\033]633;D;%s;%s\\007\\n" "$?" "$PWD"';
    }

    const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    const currentPath = process.env[pathKey] || '';
    const updatedPath = [...extraPaths, currentPath].filter(Boolean).join(path.delimiter);
    env[pathKey] = updatedPath;
    env['PATH'] = updatedPath;
    env['Path'] = updatedPath;

    const ptyProcess = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });

    this.terminals.set(options.id, ptyProcess);

    // Only the process currently registered under this id may talk to the UI.
    // A killed predecessor exits asynchronously, and without this check its
    // late exit would unregister the replacement and the pane would go dead
    // (keystrokes written to a missing terminal, no output ever arriving).
    const isCurrent = () => this.terminals.get(options.id) === ptyProcess;

    // Heavy output (builds, `ls -R`, agent TUIs repainting) arrives in many tiny
    // chunks. Coalesce them into one IPC message per few ms instead of one per
    // chunk, which keeps both the main process and the renderer responsive.
    let pending = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      const data = pending;
      pending = '';
      if (!data || !isCurrent()) return;
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pty:data', {
          id: options.id,
          data,
        });
      }
    };

    ptyProcess.onData((data: string) => {
      if (!isCurrent()) return;
      pending += data;
      if (!flushTimer) flushTimer = setTimeout(flush, PTY_FLUSH_MS);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (flushTimer) clearTimeout(flushTimer);
      if (!isCurrent()) return;
      flush();
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
      this.terminals.delete(id);
      try {
        term.kill();
      } catch {}
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
