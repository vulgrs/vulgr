import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

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

export interface MemoryData {
  workspaceDir: string;
  facts: Record<string, WorkspaceFact>;
  rules: string[];
  recentCommands: CommandMemory[];
  skillsUsage: Record<string, number>;
  lastUpdated: string;
}

export class MemoryStore {
  private readonly filePath: string;
  private data: MemoryData;
  private readonly maxRecentCommands: number = 30;
  private readonly maxRules: number = 20;

  constructor(workspaceDir: string = process.cwd(), memoryFileName = '.warp-memory.json') {
    this.filePath = join(workspaceDir, memoryFileName);
    this.data = this.loadInitial(workspaceDir);
  }

  private loadInitial(workspaceDir: string): MemoryData {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          workspaceDir: parsed.workspaceDir || workspaceDir,
          facts: parsed.facts || {},
          rules: Array.isArray(parsed.rules) ? parsed.rules : [],
          recentCommands: Array.isArray(parsed.recentCommands) ? parsed.recentCommands : [],
          skillsUsage: parsed.skillsUsage || {},
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };
      } catch {
        // Corrupted, reset
      }
    }

    return {
      workspaceDir,
      facts: {
        package_manager: { key: 'package_manager', value: 'npm', source: 'learned', updatedAt: new Date().toISOString() },
        framework: { key: 'framework', value: 'Electron + React + TypeScript', source: 'learned', updatedAt: new Date().toISOString() },
      },
      rules: [
        'Use PowerShell syntax compatible commands (use semicolon instead of &&)',
        'Verify TypeScript types with npx tsc before final review',
      ],
      recentCommands: [],
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
      ? this.data.rules.slice(0, 4).map((r) => `- ${r}`).join('\n')
      : '- none';

    return `[Project Memory & Rules]\nFacts:\n${factsStr}\nRules:\n${rulesStr}`.trim();
  }

  clear(): void {
    this.data = {
      workspaceDir: this.data.workspaceDir,
      facts: {},
      rules: [],
      recentCommands: [],
      skillsUsage: {},
      lastUpdated: new Date().toISOString(),
    };
    this.persist();
  }
}
