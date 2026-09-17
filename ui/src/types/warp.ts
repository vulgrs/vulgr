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
