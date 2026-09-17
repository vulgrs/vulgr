export type SessionType = 'claude' | 'agy' | 'codex' | 'shell';

export interface TerminalSession {
  id: string;
  title: string;
  type: SessionType;
  command?: string;
  cwd: string;
  createdAt: string;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  sessions: TerminalSession[];
  layout: 'single' | 'split-h' | 'split-v';
  activeSessionId: string;
  /** Percentage width/height (sums to 100) for each pane, in session order. */
  paneSizes?: number[];
}

export interface CommandPaletteAction {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

export interface DetectedError {
  sessionId: string;
  sessionTitle: string;
  errorType: 'typescript' | 'test' | 'rust' | 'python' | 'general';
  rawSnippet: string;
  timestamp: string;
}

export interface DoctorStatus {
  node: { ok: boolean; version: string };
  claude: { ok: boolean; version: string | null };
  gemini: { ok: boolean; version: string | null };
  git: { ok: boolean; isRepo: boolean };
  cwd: string;
}

export type SquadPhase =
  | 'idle'
  | 'building'
  | 'handing_off'
  | 'verifying'
  | 'repairing'
  | 'consensus'
  | 'paused';

export interface SquadSession {
  active: boolean;
  tabId: string;
  builderSessionId: string;
  verifierSessionId: string;
  builderType: SessionType;
  verifierType: SessionType;
  goal: string;
  verifyCmd: string;
  phase: SquadPhase;
  round: number;
  maxRounds: number;
  lastErrorSnippet?: string;
}

export interface TerminalCommandBlock {
  id: string;
  command: string;
  cwd?: string;
  timestamp: string;
  durationMs?: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  isExecuting: boolean;
}

export type SkillCategory = 'git' | 'docker' | 'node' | 'system' | 'ai' | 'custom';

export interface SkillParameter {
  name: string;
  label: string;
  description: string;
  defaultValue?: string;
  options?: string[];
  required?: boolean;
}

export interface SharedSkill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  commandTemplate: string;
  parameters: SkillParameter[];
  tags: string[];
  isCustom?: boolean;
}

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

export interface SandboxSession {
  id: string;
  branchName: string;
  baseBranch: string;
  worktreePath: string;
  createdAt: string;
  active: boolean;
}

export interface SandboxMergeResult {
  success: boolean;
  mergedCommit?: string;
  conflict?: boolean;
  conflictFiles?: string[];
  error?: string;
}


