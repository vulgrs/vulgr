/**
 * Multi-CLI Orchestrator Core Domain Types
 */

export interface CliExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBufferBytes?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** A step the agent took (ran a command, read or edited a file...), for CLIs that report them. */
  onActivity?: (activity: AgentActivity) => void;
  signal?: AbortSignal;
  stdinInput?: string;
  /** Let the agent edit files without asking (builder role). Reviewers run read-only. */
  allowEdits?: boolean;
  extraArgs?: string[];
  /** What the run was for (e.g. 'orchestra'), kept with its usage. */
  usageTag?: string;
}

/**
 * One step an agent CLI took while working. Reported once when it starts and
 * again (same id) when it finishes; `tool` uses Claude Code's tool names
 * (Bash, Read, Edit, Write, Grep...) so every agent renders the same way.
 */
export interface AgentActivity {
  id: string;
  tool: string;
  input?: string;
  status: 'running' | 'done' | 'error';
  output?: string;
}

/** What one agent call really used, as its CLI reported it. */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Set when the CLI reports only one total (e.g. Codex). */
  totalTokens?: number;
  /** USD, when the CLI reports a cost (Claude Code). */
  costUsd?: number;
}

export interface CliExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  timedOut: boolean;
  error?: Error;
  /** Tokens and cost, for CLIs that report them. */
  usage?: AgentUsage;
}

export interface ICliAdapter {
  readonly name: string;
  readonly binaryPath: string;
  isAvailable(): Promise<boolean>;
  getVersion(): Promise<string | null>;
  execute(prompt: string, options?: CliExecutionOptions): Promise<CliExecutionResult>;
}

export interface CliAdapterConfig {
  binaryPath?: string;
  defaultTimeoutMs?: number;
  maxBufferBytes?: number;
  env?: Record<string, string>;
  extraArgs?: string[];
}

export interface VerificationResult {
  command: string;
  success: boolean;
  exitCode: number | null;
  output: string;
  durationMs: number;
}

export interface SelfCorrectionAttempt {
  attemptNumber: number;
  verificationResult: VerificationResult;
  repairPrompt: string;
  modelResponse: string;
  patchFile?: string;
  durationMs: number;
}

export interface SelfCorrectionResult {
  passed: boolean;
  attemptsCount: number;
  attempts: SelfCorrectionAttempt[];
  finalVerification: VerificationResult;
  errorSummary?: string;
}

export type ReviewSeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'INFO';

export interface ReviewFinding {
  severity: ReviewSeverity;
  category: 'SECURITY' | 'MEMORY_LEAK' | 'EDGE_CASE' | 'SYNTAX' | 'GENERAL';
  file?: string;
  line?: number;
  title: string;
  description: string;
  recommendation?: string;
}

export interface ReviewReport {
  reviewerName: string;
  passed: boolean;
  summary: string;
  findings: ReviewFinding[];
  rawReview: string;
  diffAnalyzed: string;
}

export type UserReviewDecision = 'APPROVE' | 'REQUEST_FIX' | 'DISCARD';

export interface RunManifest {
  runId: string;
  createdAt: string;
  prompt: string;
  primaryAdapter: string;
  reviewerAdapter?: string;
  verifyEnabled: boolean;
  dualEnabled: boolean;
  status: 'PENDING' | 'GENERATING' | 'CORRECTING' | 'REVIEWING' | 'COMPLETED' | 'FAILED' | 'DISCARDED';
  durationMs: number;
  correctionAttempts: number;
  selfCorrectionPassed?: boolean;
  reviewPassed?: boolean;
  error?: string;
}

export interface AuditLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  stage: 'INIT' | 'PRIMARY' | 'VERIFY' | 'CORRECTION' | 'REVIEW' | 'COMPLETE';
  message: string;
  data?: unknown;
}
