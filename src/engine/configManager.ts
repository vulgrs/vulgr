import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type ShellType = 'powershell' | 'cmd' | 'wsl' | 'bash' | 'zsh' | 'default';
export type CursorStyleType = 'block' | 'underline' | 'bar';

export interface ClaudeConfig {
  skipPermissions: boolean; // Appends --dangerously-skip-permissions to bypass all interactive prompts
  model: string;           // e.g. 'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku'
  maxRetries: number;
  additionalFlags: string[];
}

export interface AgyConfig {
  model: string;            // e.g. 'gemini-2.5-pro', 'gemini-2.5-flash'
  budget: number;           // Max self-correction attempts
  temperature: number;
  additionalFlags: string[];
}

export interface CodexConfig {
  binaryPath: string;       // Local CLI binary command (defaults to 'codex')
  model: string;            // e.g. 'gpt-4o', 'o3-mini', 'o1'
  additionalFlags: string[];
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
  defaultVerifyCmd: string;     // Default command to verify builds (e.g. 'npm test')

  // OpenRouter API access (used by the deterministic "System 1" JSON compiler)
  openRouterApiKey: string;     // sk-or-... ; empty falls back to OPENROUTER_API_KEY env
  systemOneModel: string;       // OpenRouter model id for System 1

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
    model: 'claude-3-7-sonnet',
    maxRetries: 3,
    additionalFlags: [],
  },
  agy: {
    model: 'gemini-2.5-pro',
    budget: 3,
    temperature: 0.2,
    additionalFlags: [],
  },
  codex: {
    binaryPath: 'codex',
    model: 'gpt-4o',
    additionalFlags: [],
  },

  autoSandbox: true,
  defaultVerifyCmd: 'npm test',
  openRouterApiKey: '',
  systemOneModel: 'poolside/laguna-s-2.1-20260720:free',
  lastUpdated: new Date().toISOString(),
};

export class ConfigManager {
  private readonly configPath: string;
  private config: WarpConfig;

  constructor(workspaceDir: string = process.cwd(), configFileName = '.warp-config.json') {
    this.configPath = join(workspaceDir, configFileName);
    this.config = this.loadConfig();
  }

  private loadConfig(): WarpConfig {
    if (existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          claude: { ...DEFAULT_CONFIG.claude, ...(parsed.claude || {}) },
          agy: { ...DEFAULT_CONFIG.agy, ...(parsed.agy || {}) },
          codex: { ...DEFAULT_CONFIG.codex, ...(parsed.codex || {}) },
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

  updateConfig(updates: Partial<WarpConfig>): WarpConfig {
    this.config = {
      ...this.config,
      ...updates,
      claude: updates.claude ? { ...this.config.claude, ...updates.claude } : this.config.claude,
      agy: updates.agy ? { ...this.config.agy, ...updates.agy } : this.config.agy,
      codex: updates.codex ? { ...this.config.codex, ...updates.codex } : this.config.codex,
    };
    this.persist();
    return this.getConfig();
  }

  resetConfig(): WarpConfig {
    this.config = { ...DEFAULT_CONFIG, lastUpdated: new Date().toISOString() };
    this.persist();
    return this.getConfig();
  }

  /**
   * Generates CLI flags for Claude Code execution based on config.
   */
  getClaudeCliFlags(): string[] {
    const flags: string[] = [];
    if (this.config.claude.skipPermissions) {
      flags.push('--dangerously-skip-permissions');
    }
    if (this.config.claude.model) {
      flags.push('--model', this.config.claude.model);
    }
    if (this.config.claude.additionalFlags?.length > 0) {
      flags.push(...this.config.claude.additionalFlags);
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

      case 'default':
      default:
        return { shell: isWindows ? 'powershell.exe' : (process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')), args: isWindows ? ['-NoLogo'] : [] };
    }
  }
}
