export type SessionType = 'claude' | 'agy' | 'codex' | 'shell';

export interface TerminalSession {
  id: string;
  title: string;
  type: SessionType;
  command?: string;
  cwd: string;
  createdAt: string;
  /** Work done in this pane alone; names the pane's row in the sidebar when the tab is split. */
  workLog?: WorkEntry[];
}

export interface WorkspaceTab {
  id: string;
  title: string;
  sessions: TerminalSession[];
  layout: 'single' | 'split-h' | 'split-v';
  activeSessionId: string;
  /** Percentage width/height (sums to 100) for each pane, in session order. */
  paneSizes?: number[];
  /** User-made sidebar group this terminal is filed under; none = ungrouped. */
  groupId?: string;
  /** True when the title is generated from the work done in the tab ('' = untitled). */
  autoTitle?: boolean;
  /** Recent meaningful commands / agent requests run in this tab, oldest first. */
  workLog?: WorkEntry[];
}

/** A named, user-made group of terminals in the sidebar. */
export interface TerminalGroup {
  id: string;
  name: string;
}

export interface WorkEntry {
  text: string;
  /** An AI request (its text is the user's prompt) rather than a shell command. */
  prompt: boolean;
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
  | 'reviewing'
  | 'consensus'
  | 'failed'
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
  /** Plain-language line describing the current step. */
  statusText?: string;
  /** Why the squad stopped, when it ended in phase 'failed'. */
  error?: string;
  /** The loop holds before its next step so the user can step in. */
  paused?: boolean;
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

export interface CommandSuggestion {
  command: string;
  explanation: string;
  source: string;
}

export interface AutoSuggestItem {
  input: string;
  completion: string;
  suffix: string;
  source: 'history' | 'skill' | 'builtin';
  description?: string;
}

export interface ReviewFinding {
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title: string;
  description: string;
  recommendation?: string;
  file?: string;
  line?: number;
}

export interface ReviewReport {
  reviewerName: string;
  passed: boolean;
  summary: string;
  findings: ReviewFinding[];
  diffAnalyzed?: string;
}

export interface CorrectionStatus {
  status: 'PENDING' | 'PASSED' | 'FAILED';
  attempt?: number;
  maxRetries?: number;
  error?: string;
}

export interface AiOrchestratorBlock {
  id: string;
  runId: string;
  prompt?: string;
  primaryModel: string;
  dualEnabled?: boolean;
  reviewerModel?: string;
  status: 'GENERATING' | 'CORRECTING' | 'REVIEWING' | 'COMPLETED' | 'DISCARDED';
  streamText?: string;
  correctionStatus?: CorrectionStatus;
  reviewReport?: ReviewReport;
  userDecision?: 'APPROVE' | 'REQUEST_FIX' | 'DISCARD';
  goal?: string;
  streamLogs?: string[];
  diff?: string;
  errorSnippet?: string;
  rounds?: number;
  durationMs?: number;
  timestamp?: string;
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

export type ShellType = 'powershell' | 'cmd' | 'wsl' | 'bash' | 'zsh' | 'default';
export type CursorStyleType = 'block' | 'underline' | 'bar';

export interface ClaudeConfig {
  skipPermissions: boolean;
  model: string;
  maxRetries: number;
  additionalFlags: string[];
}

export interface AgyConfig {
  model: string;
  budget: number;
  temperature: number;
  additionalFlags: string[];
}

export interface CodexConfig {
  binaryPath: string;
  model: string;
  additionalFlags: string[];
}

export interface WarpConfig {
  defaultShell: ShellType;
  fontSize: number;
  fontFamily: string;
  cursorStyle: CursorStyleType;
  claude: ClaudeConfig;
  agy: AgyConfig;
  codex: CodexConfig;
  autoSandbox: boolean;
  defaultVerifyCmd: string;
  lastUpdated: string;
}

export interface ReportCommandBlock {
  id: string;
  command: string;
  exitCode: number | null;
  timestamp: string;
  durationMs?: number;
  stdout: string;
  stderr: string;
  isExecuting?: boolean;
}

export interface ReportAgentEvent {
  agent: string;
  role?: string;
  action: string;
  status: 'success' | 'failed' | 'in_progress' | 'info';
  timestamp: string;
  details?: string;
}

export interface SessionReportData {
  title: string;
  workspacePath: string;
  branch?: string | null;
  timestamp: string;
  totalDurationSeconds?: number;
  commands: ReportCommandBlock[];
  agentEvents?: ReportAgentEvent[];
  gitDiff?: string;
  filesChanged?: string[];
  doctor?: any;
}

export interface OptimizationEvent {
  type: 'terminal_log' | 'git_diff' | 'command_output';
  rawChars: number;
  optimizedChars: number;
  savedChars: number;
  savingsPercentage: number;
  rawTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  timestamp: string;
}

export interface ContextTelemetry {
  rawTokensTotal: number;
  optimizedTokensTotal: number;
  savedTokensTotal: number;
  savingsPercentage: number;
  optimizationsCount: number;
  cleanedAnsiCount: number;
  squashedLinesCount: number;
  recentEvents: OptimizationEvent[];
}

/**
 * Structured chat messages derived from Claude Code's stream-json events.
 * Each event kind becomes its own bubble in the chat view.
 */
export type ChatMessageKind =
  | 'user'        // the human prompt
  | 'assistant'   // Claude's natural-language reply
  | 'thinking'    // Claude's extended-thinking / reasoning block
  | 'tool_use'    // Claude invoking a tool (Edit, Bash, Write, Read, ...)
  | 'tool_result' // the tool's output
  | 'result'      // final turn summary (cost, duration)
  | 'system'      // session init / metadata
  | 'error';      // stderr / fatal / max-turns

export interface ChatMessage {
  id: string;
  kind: ChatMessageKind;
  /** Primary text body (already normalized to a string). */
  text: string;
  /** For tool_use: the tool name (e.g. "Bash", "Edit"). */
  toolName?: string;
  /** For tool_use: a short human-readable summary of the input. */
  toolInput?: string;
  /** For tool_result: whether the tool reported an error. */
  isError?: boolean;
  /** For tool_result: the id of the tool_use it answers, used to pair them. */
  toolUseId?: string;
  /** Whether this bubble is still streaming in. */
  streaming?: boolean;
  /** For user messages: data-URI previews of attached images. */
  images?: string[];
  timestamp: string;
}

export interface ChatSessionMeta {
  claudeSessionId?: string;
  model?: string;
  cwd?: string;
  totalCostUsd?: number;
  numTurns?: number;
  durationMs?: number;
}

export interface ProjectFileItem {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  ext?: string;
  children?: ProjectFileItem[];
}

export interface PastProjectConversation {
  id: string;
  title: string;
  agent: SessionType;
  prompt: string;
  summary?: string;
  timestamp: string;
  commandCount?: number;
  exitCode?: number;
}
