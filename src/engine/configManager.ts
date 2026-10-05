import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type ShellType = 'powershell' | 'cmd' | 'wsl' | 'bash';
export type CursorStyleType = 'block' | 'underline' | 'bar';

export interface ClaudeConfig {
  skipPermissions: boolean; // Appends --dangerously-skip-permissions to bypass all interactive prompts
  model: string;           // 'default' (the CLI's own choice) or an alias: 'opus', 'sonnet', 'haiku'
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
  lastUpdated: string;
}

export const DEFAULT_CONFIG: WarpConfig = {
  defaultShell: 'powershell',
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
  lastUpdated: new Date().toISOString(),
};

/** True when the model should be passed to `claude --model` ('default' leaves it to the CLI). */
export function claudeModelFlag(model: string | undefined): boolean {
  return !!model && model !== 'default';
}

// Configs saved by older versions point at retired Claude 3.x model ids, which
// make `claude --model ...` refuse to start. Fall back to the CLI's default.
function migrateClaudeConfig(claude: ClaudeConfig): ClaudeConfig {
  if (!claude.model || /^claude-3/.test(claude.model)) return { ...claude, model: 'default' };
  return claude;
}

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
          claude: migrateClaudeConfig({ ...DEFAULT_CONFIG.claude, ...(parsed.claude || {}) }),
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
    if (claudeModelFlag(this.config.claude.model)) {
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

    switch (this.config.defaultShell) {
      case 'powershell':
        return { shell: isWindows ? 'powershell.exe' : 'pwsh', args: ['-NoLogo'] };
      case 'cmd':
        return { shell: 'cmd.exe', args: [] };
      case 'wsl':
        return { shell: 'wsl.exe', args: [] };
      case 'bash':
        return { shell: isWindows ? 'bash.exe' : (process.env.SHELL || 'bash'), args: [] };
      default:
        return { shell: isWindows ? 'powershell.exe' : 'bash', args: [] };
    }
  }
}
