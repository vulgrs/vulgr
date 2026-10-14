import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type ShellType = 'powershell' | 'cmd' | 'wsl' | 'bash' | 'zsh' | 'fish' | 'default';
export type CursorStyleType = 'block' | 'underline' | 'bar';

export interface ClaudeConfig {
  skipPermissions: boolean; // Appends --dangerously-skip-permissions to bypass all interactive prompts
  model: string;           // 'default' (the CLI's own choice) or an alias: 'opus', 'sonnet', 'haiku'
  maxRetries: number;
  additionalFlags: string[];
}

export interface AgyConfig {
  model: string;            // 'default' (the CLI's own choice) or e.g. 'gemini-2.5-pro'
  budget: number;           // Max self-correction attempts
  temperature: number;
  additionalFlags: string[];
}

export interface CodexConfig {
  binaryPath: string;       // Local CLI binary command (defaults to 'codex')
  model: string;            // 'default' (the CLI's own choice) or e.g. 'o3-mini'
  additionalFlags: string[];
}

/** Settings one project folder can set differently from the global ones; a missing key uses the global value. */
export interface ProjectOverrides {
  claude?: Partial<Pick<ClaudeConfig, 'model' | 'skipPermissions'>>;
  defaultVerifyCmd?: string;
}

export interface WarpConfig {
  // Shell and Terminal Appearance
  defaultShell: ShellType;
  fontSize: number;
  fontFamily: string;
  cursorStyle: CursorStyleType;

  // Agent CLI Configurations (100% Local Terminal CLI Subprocesses)
  claude: ClaudeConfig;
  agy: AgyConfig;
  codex: CodexConfig;

  // Autonomy & Safety Settings
  autoSandbox: boolean;         // Always run autonomous agents inside Git Worktree Sandboxes

  // System notifications while the app is in the background
  notifyRuns: boolean;          // a Duo Loop / Agent Swarm / Orchestrator run ended
  notifyCommands: boolean;      // a terminal command that ran for a while ended
  defaultVerifyCmd: string;     // Default command to verify builds (e.g. 'npm test')

  // OpenRouter API access (used by the deterministic "System 1" JSON compiler)
  openRouterApiKey: string;     // sk-or-... ; empty falls back to OPENROUTER_API_KEY env
  systemOneModel: string;       // OpenRouter model id for System 1

  // Per-project overrides, keyed by the project folder's absolute path
  projects?: Record<string, ProjectOverrides>;

  lastUpdated: string;
}

const getDefaultShellForPlatform = (): ShellType => {
  if (process.platform === 'win32') return 'powershell';
  if (process.platform === 'darwin') return 'zsh';
  return 'bash';
};

export const DEFAULT_CONFIG: WarpConfig = {
  defaultShell: getDefaultShellForPlatform(),
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  cursorStyle: 'bar',

  claude: {
    skipPermissions: false,
    model: 'default',
    maxRetries: 3,
    additionalFlags: [],
  },
  agy: {
    model: 'default',
    budget: 3,
    temperature: 0.2,
    additionalFlags: [],
  },
  codex: {
    binaryPath: 'codex',
    model: 'default',
    additionalFlags: [],
  },

  autoSandbox: true,
  notifyRuns: true,
  notifyCommands: true,
  defaultVerifyCmd: 'npm test',
  openRouterApiKey: '',
  systemOneModel: 'poolside/laguna-s-2.1-20260720:free',
  lastUpdated: new Date().toISOString(),
};

/** True when the model should be passed to the CLI's `--model` ('default' leaves it to the CLI). */
export function claudeModelFlag(model: string | undefined): boolean {
  return !!model && model !== 'default';
}

// Older versions saved 'gemini-2.5-pro' and 'gpt-4o' as defaults without ever
// passing them on, so those exact values mean "the CLI's own choice".
const UNUSED_OLD_DEFAULTS = new Set(['gemini-2.5-pro', 'gpt-4o']);
function migrateModel<T extends { model: string }>(c: T): T {
  return !c.model || UNUSED_OLD_DEFAULTS.has(c.model) ? { ...c, model: 'default' } : c;
}

// Configs saved by older versions point at retired Claude 3.x model ids, which
// make `claude --model ...` refuse to start. Fall back to the CLI's default.
function migrateClaudeConfig(claude: ClaudeConfig): ClaudeConfig {
  if (!claude.model || /^claude-3/.test(claude.model)) return { ...claude, model: 'default' };
  return claude;
}

/** Drops unset values, so a project only stores what it really changes. */
function cleanOverrides(o: ProjectOverrides): ProjectOverrides {
  const out: ProjectOverrides = {};
  const claude: ProjectOverrides['claude'] = {};
  if (typeof o.claude?.model === 'string' && o.claude.model) claude.model = o.claude.model;
  if (typeof o.claude?.skipPermissions === 'boolean') claude.skipPermissions = o.claude.skipPermissions;
  if (Object.keys(claude).length > 0) out.claude = claude;
  if (typeof o.defaultVerifyCmd === 'string' && o.defaultVerifyCmd.trim()) out.defaultVerifyCmd = o.defaultVerifyCmd.trim();
  return out;
}

export class ConfigManager {
  private readonly configPath: string;
  private config: WarpConfig;

  /** `legacyPath` is read when `configPath` doesn't exist yet, so older settings carry over. */
  constructor(workspaceDir: string = process.cwd(), configFileName = '.warp-config.json', private readonly legacyPath?: string) {
    this.configPath = join(workspaceDir, configFileName);
    this.config = this.loadConfig();
  }

  private loadConfig(): WarpConfig {
    const source = existsSync(this.configPath) ? this.configPath : this.legacyPath;
    if (source && existsSync(source)) {
      try {
        const raw = readFileSync(source, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          claude: migrateClaudeConfig({ ...DEFAULT_CONFIG.claude, ...(parsed.claude || {}) }),
          agy: migrateModel({ ...DEFAULT_CONFIG.agy, ...(parsed.agy || {}) }),
          codex: migrateModel({ ...DEFAULT_CONFIG.codex, ...(parsed.codex || {}) }),
        };
      } catch {
        // Fall back to defaults if corrupted
      }
    }

    return { ...DEFAULT_CONFIG, lastUpdated: new Date().toISOString() };
  }

  private persist(): void {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.config.lastUpdated = new Date().toISOString();
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConfigManager] Failed to persist config to disk:', err);
    }
  }

  getConfig(): WarpConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /** Project overrides are left alone here; they change only through setProjectOverrides. */
  updateConfig(updates: Partial<WarpConfig>): WarpConfig {
    const { projects: _ignored, ...rest } = updates;
    this.config = {
      ...this.config,
      ...rest,
      claude: updates.claude ? { ...this.config.claude, ...updates.claude } : this.config.claude,
      agy: updates.agy ? { ...this.config.agy, ...updates.agy } : this.config.agy,
      codex: updates.codex ? { ...this.config.codex, ...updates.codex } : this.config.codex,
    };
    this.persist();
    return this.getConfig();
  }

  /** Resets the global settings; project overrides are kept. */
  resetConfig(): WarpConfig {
    this.config = { ...DEFAULT_CONFIG, projects: this.config.projects, lastUpdated: new Date().toISOString() };
    this.persist();
    return this.getConfig();
  }

  getProjectOverrides(projectDir: string): ProjectOverrides {
    return JSON.parse(JSON.stringify(this.config.projects?.[projectDir] ?? {}));
  }

  /** Replaces a project's overrides; an empty set removes the project's entry. */
  setProjectOverrides(projectDir: string, overrides: ProjectOverrides): ProjectOverrides {
    const clean = cleanOverrides(overrides);
    const projects = { ...(this.config.projects ?? {}) };
    if (Object.keys(clean).length > 0) projects[projectDir] = clean;
    else delete projects[projectDir];
    this.config = { ...this.config, projects };
    this.persist();
    return this.getProjectOverrides(projectDir);
  }

  /** The global settings with the project's overrides applied on top. */
  getEffectiveConfig(projectDir?: string): WarpConfig {
    const config = this.getConfig();
    const o = projectDir ? config.projects?.[projectDir] : undefined;
    if (!o) return config;
    return {
      ...config,
      claude: { ...config.claude, ...o.claude },
      defaultVerifyCmd: o.defaultVerifyCmd ?? config.defaultVerifyCmd,
    };
  }

  /**
   * Generates CLI flags for Claude Code execution based on config,
   * with the overrides of the project in `projectDir` when given.
   */
  getClaudeCliFlags(projectDir?: string): string[] {
    const claude = this.getEffectiveConfig(projectDir).claude;
    const flags: string[] = [];
    if (claude.skipPermissions) {
      flags.push('--dangerously-skip-permissions');
    }
    if (claudeModelFlag(claude.model)) {
      flags.push('--model', claude.model);
    }
    if (claude.additionalFlags?.length > 0) {
      flags.push(...claude.additionalFlags);
    }
    return flags;
  }

  /**
   * Resolves the executable path / command for the default shell.
   */
  resolveShellBinary(): { shell: string; args: string[] } {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    switch (this.config.defaultShell) {
      case 'powershell':
        if (isWindows) {
          return { shell: 'powershell.exe', args: ['-NoLogo'] };
        }
        if (existsSync('/usr/local/bin/pwsh')) return { shell: '/usr/local/bin/pwsh', args: ['-NoLogo'] };
        if (existsSync('/opt/homebrew/bin/pwsh')) return { shell: '/opt/homebrew/bin/pwsh', args: ['-NoLogo'] };
        return { shell: process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash'), args: [] };

      case 'cmd':
        return { shell: isWindows ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh'), args: [] };

      case 'wsl':
        return { shell: isWindows ? 'wsl.exe' : (process.env.SHELL || '/bin/zsh'), args: [] };

      case 'zsh':
        return { shell: isWindows ? 'powershell.exe' : (existsSync('/bin/zsh') ? '/bin/zsh' : (process.env.SHELL || 'zsh')), args: [] };

      case 'bash':
        return { shell: isWindows ? 'bash.exe' : (existsSync('/bin/bash') ? '/bin/bash' : (process.env.SHELL || 'bash')), args: [] };

      case 'fish': {
        if (isWindows) return { shell: 'powershell.exe', args: ['-NoLogo'] };
        const fish = ['/opt/homebrew/bin/fish', '/usr/local/bin/fish', '/usr/bin/fish', '/bin/fish'].find((p) => existsSync(p));
        return { shell: fish || process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash'), args: [] };
      }

      case 'default':
      default:
        return { shell: isWindows ? 'powershell.exe' : (process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')), args: isWindows ? ['-NoLogo'] : [] };
    }
  }
}
