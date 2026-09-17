import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RunManifest, AuditLogEntry } from '../types/index.js';

export class ContextBus {
  private readonly baseDir: string;
  private currentRunDir: string | null = null;
  private manifest: RunManifest | null = null;
  private auditLogs: AuditLogEntry[] = [];

  constructor(workspaceDir: string = process.cwd()) {
    this.baseDir = join(workspaceDir, '.ai-bridge');
    this.ensureDir(this.baseDir);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Initializes a new orchestration session inside .ai-bridge/runs/<run-id>/
   */
  initRun(
    prompt: string,
    primaryAdapter: string,
    reviewerAdapter?: string,
    options: { verifyEnabled: boolean; dualEnabled: boolean } = { verifyEnabled: true, dualEnabled: false }
  ): RunManifest {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = randomBytes(4).toString('hex');
    const runId = `run-${timestamp}-${hash}`;

    this.currentRunDir = join(this.baseDir, 'runs', runId);
    this.ensureDir(this.currentRunDir);
    this.ensureDir(join(this.currentRunDir, 'patches'));
    this.ensureDir(join(this.currentRunDir, 'logs'));

    this.manifest = {
      runId,
      createdAt: new Date().toISOString(),
      prompt,
      primaryAdapter,
      reviewerAdapter,
      verifyEnabled: options.verifyEnabled,
      dualEnabled: options.dualEnabled,
      status: 'PENDING',
      durationMs: 0,
      correctionAttempts: 0,
    };

    this.saveManifest();
    this.recordLog('INIT', 'info', `Orchestration run initialized: ${runId}`, { prompt });

    return this.manifest;
  }

  getRunDir(): string {
    if (!this.currentRunDir) {
      throw new Error('No active run initialized in ContextBus');
    }
    return this.currentRunDir;
  }

  /**
   * Records a structured audit log entry.
   */
  recordLog(stage: AuditLogEntry['stage'], level: AuditLogEntry['level'], message: string, data?: unknown): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      stage,
      level,
      message,
      data,
    };

    this.auditLogs.push(entry);

    if (this.currentRunDir) {
      const logsPath = join(this.currentRunDir, 'audit-log.jsonl');
      writeFileSync(logsPath, JSON.stringify(entry) + '\n', { flag: 'a', encoding: 'utf-8' });
    }
  }

  /**
   * Persists a git patch snapshot to .ai-bridge/runs/<run-id>/patches/
   */
  savePatch(filename: string, patchContent: string): string {
    if (!this.currentRunDir) {
      throw new Error('No active run in ContextBus to save patch');
    }

    const patchPath = join(this.currentRunDir, 'patches', filename);
    writeFileSync(patchPath, patchContent, 'utf-8');
    return patchPath;
  }

  /**
   * Persists raw compiler or model log into .ai-bridge/runs/<run-id>/logs/
   */
  saveLog(name: string, content: string): string {
    if (!this.currentRunDir) {
      throw new Error('No active run in ContextBus to save log');
    }

    const logPath = join(this.currentRunDir, 'logs', `${name}.log`);
    writeFileSync(logPath, content, 'utf-8');
    return logPath;
  }

  /**
   * Updates and saves the current manifest status.
   */
  updateManifest(updates: Partial<RunManifest>): RunManifest {
    if (!this.manifest || !this.currentRunDir) {
      throw new Error('No active run to update');
    }

    this.manifest = {
      ...this.manifest,
      ...updates,
    };

    this.saveManifest();
    return this.manifest;
  }

  private saveManifest(): void {
    if (!this.currentRunDir || !this.manifest) return;
    const manifestPath = join(this.currentRunDir, 'context.json');
    writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  getManifest(): RunManifest | null {
    return this.manifest;
  }

  /**
   * Cleans all past runs from .ai-bridge/runs/
   */
  cleanRuns(): number {
    const runsDir = join(this.baseDir, 'runs');
    if (!existsSync(runsDir)) return 0;

    const entries = readdirSync(runsDir);
    let count = 0;
    for (const entry of entries) {
      const p = join(runsDir, entry);
      rmSync(p, { recursive: true, force: true });
      count++;
    }
    return count;
  }
}
