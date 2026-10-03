import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { ConfigManager } from '../src/engine/configManager.js';

const require = createRequire(import.meta.url);

export interface PtyCreateOptions {
  id: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
}

function ensureSpawnHelperPermissions(): void {
  if (process.platform === 'win32') return;
  try {
    const ptyPath = require.resolve('node-pty');
    const rootPty = path.resolve(path.dirname(ptyPath), '..');
    const candidates = [
      path.join(rootPty, 'prebuilds', 'darwin-arm64', 'spawn-helper'),
      path.join(rootPty, 'prebuilds', 'darwin-x64', 'spawn-helper'),
      path.join(rootPty, 'build', 'Release', 'spawn-helper'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          fs.chmodSync(c, 0o755);
        } catch {}
      }
    }
  } catch {}
}

function resolveBinary(binaryName: string, extraPaths: string[]): string {
  if (path.isAbsolute(binaryName)) return binaryName;
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const allPaths = [...extraPaths, ...(process.env[pathKey] || '').split(path.delimiter)].filter(Boolean);
  for (const dir of allPaths) {
    const candidate = path.join(dir, binaryName);
    if (fs.existsSync(candidate)) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  return binaryName;
}

function getManagedZshDir(): string {
  const zshDir = path.join(os.homedir(), '.vulgaris', 'shell', 'zsh');
  if (!fs.existsSync(zshDir)) {
    fs.mkdirSync(zshDir, { recursive: true });
  }
  const zshrcPath = path.join(zshDir, '.zshrc');
  const zshrcContent = [
    '# Vulgaris Terminal Integration for ZSH',
    'set +e',
    'if [ -f "$HOME/.zprofile" ]; then',
    '  source "$HOME/.zprofile" 2>/dev/null || true',
    'fi',
    'if [ -f "$HOME/.zshrc" ]; then',
    '  ZDOTDIR="$HOME" source "$HOME/.zshrc" 2>/dev/null || true',
    'fi',
    'PROMPT_EOL_MARK=""',
    'PROMPT=""',
    'PS1=""',
    'RPROMPT=""',
    'RPS1=""',
    'precmd() {',
    '  local exit_code=$?',
    '  printf "\\033]633;D;%s;%s\\007\\n" "$exit_code" "$PWD"',
    '}',
    'clear() {',
    '  printf "\\033[2J\\033[3J\\033[H\\033]633;E\\007\\n\\n"',
    '}',
    '',
  ].join('\n');

  fs.writeFileSync(zshrcPath, zshrcContent, 'utf-8');
  return zshDir;
}

function getManagedBashrcPath(): string {
  const bashDir = path.join(os.homedir(), '.vulgaris', 'shell', 'bash');
  if (!fs.existsSync(bashDir)) {
    fs.mkdirSync(bashDir, { recursive: true });
  }
  const bashrcPath = path.join(bashDir, '.bashrc');
  const bashrcContent = [
    '# Vulgaris Terminal Integration for Bash',
    'if [ -f "$HOME/.bash_profile" ]; then',
    '  source "$HOME/.bash_profile"',
    'elif [ -f "$HOME/.bashrc" ]; then',
    '  source "$HOME/.bashrc"',
    'fi',
    'PS1="\\[\\033]633;D;$?;$PWD\\007\\]\\n"',
    'clear() {',
    '  printf "\\033[2J\\033[3J\\033[H\\033]633;E\\007\\n\\n"',
    '}',
    '',
  ].join('\n');

  fs.writeFileSync(bashrcPath, bashrcContent, 'utf-8');
  return bashrcPath;
}

export class PtyManager {
  private terminals = new Map<string, pty.IPty>();
  private buffers = new Map<string, string>();
  private window: BrowserWindow | null = null;
  private configManager: ConfigManager | null = null;

  constructor() {
    ensureSpawnHelperPermissions();
  }

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  setConfigManager(cm: ConfigManager) {
    this.configManager = cm;
  }

  createTerminal(options: PtyCreateOptions) {
    ensureSpawnHelperPermissions();

    if (this.terminals.has(options.id)) {
      const existing = this.terminals.get(options.id)!;
      console.log(`[PtyManager] Reusing active terminal (${options.id}, pid=${existing.pid})`);
      const buffered = this.buffers.get(options.id);
      if (buffered && this.window && !this.window.isDestroyed()) {
        setTimeout(() => {
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('pty:data', {
              id: options.id,
              data: buffered,
            });
          }
        }, 20);
      }
      return { id: options.id, pid: existing.pid };
    }

    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    const home = os.homedir();
    const extraPaths = isWindows
      ? [
          path.join(home, '.local', 'bin'),
          path.join(home, 'AppData', 'Local', 'agy', 'bin'),
          path.join(home, 'AppData', 'Roaming', 'npm'),
          path.join(home, '.cargo', 'bin'),
        ]
      : [
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          '/usr/local/sbin',
          path.join(home, '.local', 'bin'),
          path.join(home, '.cargo', 'bin'),
          path.join(home, '.npm-global', 'bin'),
          path.join(home, 'bin'),
        ];

    const shellResolution = this.configManager ? this.configManager.resolveShellBinary() : {
      shell: isWindows ? 'powershell.exe' : (process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')),
      args: isWindows ? ['-NoLogo'] : [],
    };

    let file = options.command || shellResolution.shell;
    let args: string[] = options.args ? [...options.args] : [...(shellResolution.args || [])];

    file = resolveBinary(file, extraPaths);

    // If launching specific CLI like Claude, append flags
    if (options.command && options.command !== 'powershell.exe' && options.command !== 'cmd.exe' && options.command !== 'wsl.exe') {
      const claudeFlags = (options.command === 'claude' && this.configManager)
        ? this.configManager.getClaudeCliFlags()
        : [];

      if (isWindows) {
        let invocation = options.command;
        if (claudeFlags.length > 0) {
          invocation = `claude ${claudeFlags.join(' ')}`;
        }
        file = 'powershell.exe';
        args = ['-NoLogo', '-NoExit', '-Command', invocation];
      } else if (options.command === 'claude' && claudeFlags.length > 0) {
        args = [...claudeFlags, ...args];
      }
    }

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as { [key: string]: string };

    if (!isWindows) {
      if (!env['LANG']) env['LANG'] = 'en_US.UTF-8';
      if (!env['LC_ALL']) env['LC_ALL'] = 'en_US.UTF-8';
    }

    // Plain shell sessions (no explicit command): replace the shell's own
    // prompt with an invisible OSC 633;D marker (exit code + cwd) followed by a
    // newline. The UI uses it to know when a command finished and where the
    // next block starts, and paints its own block header on the reserved row.
    const isPlainShellSession = !options.command;
    if (isPlainShellSession) {
      if (isWindows && /(^|[\\/])(powershell|pwsh)(\.exe)?$/i.test(file)) {
        const promptFn =
          'function global:prompt { $ok = $?; $code = if ($ok) { 0 } else { 1 }; ' +
          '"$([char]27)]633;D;$code;$($PWD.Path)$([char]7)`n" }; ' +
          'function global:Clear-Host { $e = [char]27; ' +
          '$pad = [Math]::Max(0, $Host.UI.RawUI.WindowSize.Height - 4); ' +
          '[Console]::Write("${e}[2J${e}[3J${e}[H" + ("`r`n" * $pad) + "${e}]633;E$([char]7)`r`n`r`n") }; ' +
          '[Console]::Write("`r`n" * [Math]::Max(0, $Host.UI.RawUI.WindowSize.Height - 2))';
        args = ['-NoLogo', '-NoExit', '-Command', promptFn];
      } else if (!isWindows) {
        if (/(^|[\\/])zsh$/i.test(file)) {
          const zshDir = getManagedZshDir();
          env['ZDOTDIR'] = zshDir;
          if (args.length === 0) {
            args = ['-l'];
          }
        } else if (/(^|[\\/])bash$/i.test(file)) {
          const bashrcPath = getManagedBashrcPath();
          env['BASH_SILENCE_DEPRECATION_WARNING'] = '1';
          args = ['--rcfile', bashrcPath];
        } else {
          env['PS1'] = '\\[\\033]633;D;$?;$PWD\\007\\]\\n';
        }
      }
    }

    const cwd = options.cwd || process.cwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    const currentPath = process.env[pathKey] || '';
    const updatedPath = [...extraPaths, currentPath].filter(Boolean).join(path.delimiter);
    env[pathKey] = updatedPath;
    env['PATH'] = updatedPath;
    env['Path'] = updatedPath;

    try {
      console.log(`[PtyManager] Spawning terminal (${options.id}): ${file} ${JSON.stringify(args)} in ${cwd}`);
      const ptyProcess = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });

      this.terminals.set(options.id, ptyProcess);

      ptyProcess.onData((data: string) => {
        const prev = this.buffers.get(options.id) || '';
        this.buffers.set(options.id, (prev + data).slice(-65536));
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('pty:data', {
            id: options.id,
            data,
          });
        }
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[PtyManager] onExit (${options.id}): exitCode=${exitCode}, signal=${signal}`);
        this.terminals.delete(options.id);
        this.buffers.delete(options.id);
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('pty:exit', {
            id: options.id,
            exitCode,
            signal,
          });
        }
      });

      return { id: options.id, pid: ptyProcess.pid };
    } catch (err: any) {
      console.error(`[PtyManager] Failed to spawn PTY for '${file}':`, err);
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pty:data', {
          id: options.id,
          data: `\r\n\x1b[31m[Dexter Terminal Error] Failed to launch shell '${file}': ${err.message}\x1b[0m\r\n`,
        });
        this.window.webContents.send('pty:exit', {
          id: options.id,
          exitCode: 1,
          signal: 0,
        });
      }
      return { id: options.id, pid: -1, error: err.message };
    }
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
    console.log(`[PtyManager] kill (${id})`);
    const term = this.terminals.get(id);
    if (term) {
      try {
        term.kill();
      } catch {}
      this.terminals.delete(id);
    }
    this.buffers.delete(id);
  }

  killAll() {
    for (const [id, term] of this.terminals.entries()) {
      try {
        term.kill();
      } catch {}
      this.terminals.delete(id);
    }
    this.buffers.clear();
  }
}
