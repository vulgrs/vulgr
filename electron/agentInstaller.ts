import { exec, execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The agent CLIs Vulgr can install for the user: how to find each one, the
 * official install command per platform, and how to sign in afterwards.
 */
interface AgentRecipe {
  id: string;
  name: string;
  vendor: string;
  /** Executable names, first match wins. */
  bins: string[];
  /** Install command per platform; npm/brew variants need that tool first. */
  install: { darwin: string[]; win32: string[]; linux?: string[] };
  /** Run once after installing to sign in. */
  login: string;
  docs: string;
}

const RECIPES: AgentRecipe[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    vendor: 'Anthropic',
    bins: ['claude'],
    install: {
      darwin: ['curl -fsSL https://claude.ai/install.sh | bash'],
      win32: ['irm https://claude.ai/install.ps1 | iex'],
    },
    login: 'claude',
    docs: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    vendor: 'OpenAI',
    bins: ['codex'],
    install: {
      darwin: ['npm install -g @openai/codex', 'brew install --cask codex'],
      win32: ['npm install -g @openai/codex'],
    },
    login: 'codex',
    docs: 'https://developers.openai.com/codex/cli',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    vendor: 'SST',
    bins: ['opencode'],
    install: {
      darwin: ['curl -fsSL https://opencode.ai/install | bash'],
      win32: ['npm install -g opencode-ai'],
    },
    login: 'opencode auth login',
    docs: 'https://opencode.ai/docs',
  },
  {
    id: 'agy',
    name: 'Antigravity CLI',
    vendor: 'Google',
    bins: ['agy'],
    install: {
      darwin: ['curl -fsSL https://antigravity.google/cli/install.sh | bash'],
      win32: ['irm https://antigravity.google/cli/install.ps1 | iex'],
    },
    login: 'agy',
    docs: 'https://antigravity.google/docs/cli',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    vendor: 'Cursor',
    bins: ['cursor-agent', 'agent'],
    install: {
      darwin: ['curl https://cursor.com/install -fsS | bash'],
      win32: ["irm 'https://cursor.com/install?win32=true' | iex"],
    },
    login: 'cursor-agent login',
    docs: 'https://cursor.com/docs/cli/installation',
  },
];

export interface AgentStatus {
  id: string;
  name: string;
  vendor: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  /** The command Install runs on this machine, or null when a prerequisite is missing. */
  command: string | null;
  /** Shown when no command can run here, e.g. "npm" for an npm-only install. */
  missing: string | null;
  login: string;
  docs: string;
}

const isWin = process.platform === 'win32';

/** PATH with the per-user folders these installers write to, which an app started from Finder/Start doesn't see. */
export function agentSearchPath(): string {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const extra = isWin
    ? [
        path.join(home, '.local', 'bin'),
        path.join(roaming, 'npm'),
        path.join(local, 'agy', 'bin'),
        path.join(local, 'cursor-agent'),
        path.join(home, '.opencode', 'bin'),
      ]
    : [
        path.join(home, '.local', 'bin'),
        path.join(home, '.opencode', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        ...nvmBins(home),
      ];
  const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  return [...extra, process.env[key] || ''].filter(Boolean).join(path.delimiter);
}

/** Node installed through nvm lives outside every default PATH. */
function nvmBins(home: string): string[] {
  const root = path.join(home, '.nvm', 'versions', 'node');
  try {
    return readdirSync(root)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((v) => path.join(root, v, 'bin'));
  } catch {
    return [];
  }
}

function searchEnv(): NodeJS.ProcessEnv {
  const p = agentSearchPath();
  return { ...process.env, PATH: p, ...(isWin ? { Path: p } : {}) };
}

function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(isWin ? 'where.exe' : 'which', [bin], { env: searchEnv(), timeout: 5000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      resolve(String(out).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || null);
    });
  });
}

function version(binPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(`"${binPath}" --version`, { env: searchEnv(), timeout: 8000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      const line = String(out).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
      resolve(line.match(/\d+\.\d+(\.\d+)?[\w.-]*/)?.[0] ?? (line.slice(0, 40) || null));
    });
  });
}

/** First install command whose leading tool (npm, brew…) exists here. */
async function pickCommand(recipe: AgentRecipe): Promise<{ command: string | null; missing: string | null }> {
  const list = isWin ? recipe.install.win32 : (recipe.install[process.platform as 'darwin' | 'linux'] ?? recipe.install.darwin);
  for (const cmd of list) {
    const tool = cmd.split(' ')[0];
    if (tool === 'npm' || tool === 'brew') {
      if (await which(tool)) return { command: cmd, missing: null };
      continue;
    }
    return { command: cmd, missing: null };
  }
  return { command: null, missing: list[0].split(' ')[0] === 'npm' ? 'Node.js (npm)' : list[0].split(' ')[0] };
}

async function statusOf(recipe: AgentRecipe): Promise<AgentStatus> {
  let found: string | null = null;
  for (const bin of recipe.bins) {
    found = await which(bin);
    if (found) break;
  }
  const [ver, pick] = await Promise.all([found ? version(found) : Promise.resolve(null), pickCommand(recipe)]);
  return {
    id: recipe.id,
    name: recipe.name,
    vendor: recipe.vendor,
    installed: !!found,
    path: found,
    version: ver,
    command: pick.command,
    missing: pick.missing,
    login: recipe.login,
    docs: recipe.docs,
  };
}

export function listAgentStatus(): Promise<AgentStatus[]> {
  return Promise.all(RECIPES.map(statusOf));
}

const running = new Map<string, ChildProcess>();

/**
 * Runs the official installer in the background and streams its output.
 * Resolves with the exit code; the caller re-checks the status afterwards.
 */
export async function installAgent(id: string, onOutput: (chunk: string) => void): Promise<{ ok: boolean; code: number | null; error?: string }> {
  const recipe = RECIPES.find((r) => r.id === id);
  if (!recipe) return { ok: false, code: null, error: `Unknown agent: ${id}` };
  if (running.has(id)) return { ok: false, code: null, error: 'Already installing' };
  const { command, missing } = await pickCommand(recipe);
  if (!command) return { ok: false, code: null, error: `Missing prerequisite: ${missing}` };

  onOutput(`$ ${command}\n`);
  const child = isWin
    ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        env: searchEnv(),
        windowsHide: true,
      })
    : // A login shell picks up the user's own PATH (Homebrew, nvm, …) for npm and brew.
      spawn(process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/bash', ['-lc', command], {
        env: { ...searchEnv(), NONINTERACTIVE: '1', CI: '1' },
      });
  running.set(id, child);
  child.stdout?.on('data', (d) => onOutput(String(d)));
  child.stderr?.on('data', (d) => onOutput(String(d)));

  return new Promise((resolve) => {
    child.on('error', (err) => {
      running.delete(id);
      resolve({ ok: false, code: null, error: err.message });
    });
    child.on('close', (code) => {
      running.delete(id);
      resolve({ ok: code === 0, code });
    });
  });
}

export function cancelAgentInstall(id: string): void {
  running.get(id)?.kill();
}
