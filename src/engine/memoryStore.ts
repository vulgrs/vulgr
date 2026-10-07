import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

export interface WorkspaceFact {
  key: string;
  value: string;
  source: 'user' | 'agent' | 'learned';
  updatedAt: string;
}

export interface CommandMemory {
  command: string;
  exitCode: number;
  durationMs?: number;
  summary?: string;
  timestamp: string;
}

export interface ProjectConversation {
  id: string;
  title: string;
  agent: 'claude' | 'agy' | 'codex' | 'shell';
  prompt: string;
  summary?: string;
  timestamp: string;
  commandCount?: number;
  exitCode?: number;
  contextUsed?: string[];
}

export interface MemoryData {
  workspaceDir: string;
  facts: Record<string, WorkspaceFact>;
  rules: string[];
  recentCommands: CommandMemory[];
  conversations: ProjectConversation[];
  skillsUsage: Record<string, number>;
  lastUpdated: string;
}

/**
 * Rules and facts that earlier versions seeded into every project regardless of
 * what it was. They misled agents (PowerShell on macOS, "Electron" for a plain
 * Node script), so they are dropped when an old memory file is loaded.
 */
const LEGACY_DEFAULT_RULES = new Set([
  'Use PowerShell syntax compatible commands (use semicolon instead of &&)',
  'Verify TypeScript types with npx tsc before final review',
]);
const LEGACY_DEFAULT_FRAMEWORK = 'Electron + React + TypeScript';

/** Facts read from the project itself: its package manager and main frameworks. */
export function detectProjectFacts(workspaceDir: string): Record<string, string> {
  const facts: Record<string, string> = {};
  const has = (f: string) => existsSync(join(workspaceDir, f));
  let pkg: any = null;
  try {
    pkg = JSON.parse(readFileSync(join(workspaceDir, 'package.json'), 'utf-8'));
  } catch {
    // Not a Node project (or unreadable package.json).
  }

  if (has('pnpm-lock.yaml')) facts.package_manager = 'pnpm';
  else if (has('yarn.lock')) facts.package_manager = 'yarn';
  else if (has('bun.lockb') || has('bun.lock')) facts.package_manager = 'bun';
  else if (pkg) facts.package_manager = 'npm';
  else if (has('Cargo.toml')) facts.package_manager = 'cargo';
  else if (has('go.mod')) facts.package_manager = 'go';
  else if (has('pyproject.toml') || has('requirements.txt')) facts.package_manager = 'pip';

  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
    const known: Array<[string, string]> = [
      ['next', 'Next.js'], ['electron', 'Electron'], ['react', 'React'], ['vue', 'Vue'],
      ['svelte', 'Svelte'], ['@angular/core', 'Angular'], ['express', 'Express'], ['fastify', 'Fastify'],
    ];
    const frameworks = known.filter(([dep]) => dep in deps).map(([, name]) => name);
    if ('typescript' in deps || has('tsconfig.json')) frameworks.push('TypeScript');
    if (frameworks.length > 0) facts.framework = frameworks.join(' + ');
    if (pkg.scripts?.test) facts.test_command = `${facts.package_manager ?? 'npm'} test`;
  }
  return facts;
}

export class MemoryStore {
  private readonly filePath: string;
  private data: MemoryData;
  private readonly maxRecentCommands: number = 30;
  private readonly maxRules: number = 20;
  private readonly maxConversations: number = 50;

  constructor(workspaceDir: string = process.cwd(), memoryFileName?: string) {
    if (memoryFileName) {
      this.filePath = join(workspaceDir, memoryFileName);
    } else {
      const vulgarisPath = join(workspaceDir, '.vulgaris-memory.json');
      const warpPath = join(workspaceDir, '.warp-memory.json');

      if (existsSync(vulgarisPath)) {
        this.filePath = vulgarisPath;
      } else if (existsSync(warpPath)) {
        this.filePath = warpPath;
      } else {
        // Kept out of the project, so it never shows up in git status, the
        // Changes panel or an agent's review of the work.
        const id = createHash('sha1').update(resolve(workspaceDir)).digest('hex').slice(0, 12);
        this.filePath = join(homedir(), '.vulgr', 'memory', `${basename(resolve(workspaceDir)) || 'root'}-${id}.json`);
      }
    }
    this.data = this.loadInitial(workspaceDir);
  }

  private loadInitial(workspaceDir: string): MemoryData {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const facts: Record<string, WorkspaceFact> = parsed.facts || {};
        if (facts.framework?.source === 'learned' && facts.framework.value === LEGACY_DEFAULT_FRAMEWORK) {
          delete facts.framework;
        }
        return {
          workspaceDir: parsed.workspaceDir || workspaceDir,
          facts,
          rules: Array.isArray(parsed.rules) ? parsed.rules.filter((r: string) => !LEGACY_DEFAULT_RULES.has(r)) : [],
          recentCommands: Array.isArray(parsed.recentCommands) ? parsed.recentCommands : [],
          conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
          skillsUsage: parsed.skillsUsage || {},
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };
      } catch {
        // Corrupted, reset
      }
    }

    return {
      workspaceDir,
      facts: Object.fromEntries(
        Object.entries(detectProjectFacts(workspaceDir)).map(([key, value]) => [
          key,
          { key, value, source: 'learned' as const, updatedAt: new Date().toISOString() },
        ])
      ),
      rules: [],
      recentCommands: [],
      conversations: [],
      skillsUsage: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  private persist(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.data.lastUpdated = new Date().toISOString();
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MemoryStore] Failed to persist memory to disk:', err);
    }
  }

  setFact(key: string, value: string, source: 'user' | 'agent' | 'learned' = 'user'): void {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    this.data.facts[cleanKey] = {
      key: cleanKey,
      value: value.trim(),
      source,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  getFact(key: string): WorkspaceFact | undefined {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    return this.data.facts[cleanKey];
  }

  getAllFacts(): Record<string, WorkspaceFact> {
    return { ...this.data.facts };
  }

  deleteFact(key: string): boolean {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (cleanKey in this.data.facts) {
      delete this.data.facts[cleanKey];
      this.persist();
      return true;
    }
    return false;
  }

  addRule(rule: string): void {
    const trimmed = rule.trim();
    if (!trimmed) return;
    if (!this.data.rules.includes(trimmed)) {
      this.data.rules.unshift(trimmed);
      if (this.data.rules.length > this.maxRules) {
        this.data.rules.pop();
      }
      this.persist();
    }
  }

  removeRule(rule: string): boolean {
    const index = this.data.rules.indexOf(rule);
    if (index !== -1) {
      this.data.rules.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  getRules(): string[] {
    return [...this.data.rules];
  }

  recordCommand(command: string, exitCode: number, durationMs?: number, summary?: string): void {
    const entry: CommandMemory = {
      command: command.trim(),
      exitCode,
      durationMs,
      summary,
      timestamp: new Date().toISOString(),
    };

    this.data.recentCommands.unshift(entry);
    if (this.data.recentCommands.length > this.maxRecentCommands) {
      this.data.recentCommands.pop();
    }
    this.persist();
  }

  getRecentCommands(limit = 10): CommandMemory[] {
    return this.data.recentCommands.slice(0, limit);
  }

  addConversation(conv: ProjectConversation): void {
    if (!this.data.conversations) {
      this.data.conversations = [];
    }
    this.data.conversations.unshift(conv);
    if (this.data.conversations.length > this.maxConversations) {
      this.data.conversations.pop();
    }
    this.persist();
  }

  getConversations(limit = 20): ProjectConversation[] {
    return (this.data.conversations || []).slice(0, limit);
  }

  getConversation(id: string): ProjectConversation | undefined {
    return (this.data.conversations || []).find((c) => c.id === id);
  }

  recordSkillUsage(skillId: string): void {
    const count = this.data.skillsUsage[skillId] || 0;
    this.data.skillsUsage[skillId] = count + 1;
    this.persist();
  }

  getSkillUsageCount(skillId: string): number {
    return this.data.skillsUsage[skillId] || 0;
  }

  getMemoryData(): MemoryData {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Generates a token-lean (< 80 tokens) prompt context injection for AI models.
   */
  toPromptSnippet(): string {
    const factEntries = Object.values(this.data.facts);
    const factsStr = factEntries.length > 0
      ? factEntries.slice(0, 5).map((f) => `- ${f.key}: ${f.value}`).join('\n')
      : '- none';

    const rulesStr = this.data.rules.length > 0
      ? this.data.rules.map((r) => `- ${r}`).join('\n')
      : '- none';

    const lastConv = this.data.conversations && this.data.conversations.length > 0
      ? `\nLast Goal: ${this.data.conversations[0].prompt.slice(0, 80)} (${this.data.conversations[0].agent})`
      : '';

    return `[Project Memory & Rules]\nFacts:\n${factsStr}\nRules (always follow these):\n${rulesStr}${lastConv}`.trim();
  }

  clear(): void {
    this.data = {
      workspaceDir: this.data.workspaceDir,
      facts: {},
      rules: [],
      recentCommands: [],
      conversations: [],
      skillsUsage: {},
      lastUpdated: new Date().toISOString(),
    };
    this.persist();
  }
}
