import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
export class ContextBus {
    baseDir;
    currentRunDir = null;
    manifest = null;
    auditLogs = [];
    constructor(workspaceDir = process.cwd()) {
        this.baseDir = join(workspaceDir, '.ai-bridge');
        this.ensureDir(this.baseDir);
    }
    ensureDir(dir) {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }
    /**
     * Initializes a new orchestration session inside .ai-bridge/runs/<run-id>/
     */
    initRun(prompt, primaryAdapter, reviewerAdapter, options = { verifyEnabled: true, dualEnabled: false }) {
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
    getRunDir() {
        if (!this.currentRunDir) {
            throw new Error('No active run initialized in ContextBus');
        }
        return this.currentRunDir;
    }
    /**
     * Records a structured audit log entry.
     */
    recordLog(stage, level, message, data) {
        const entry = {
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
    savePatch(filename, patchContent) {
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
    saveLog(name, content) {
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
    updateManifest(updates) {
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
    saveManifest() {
        if (!this.currentRunDir || !this.manifest)
            return;
        const manifestPath = join(this.currentRunDir, 'context.json');
        writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
    }
    getManifest() {
        return this.manifest;
    }
    /**
     * Cleans all past runs from .ai-bridge/runs/
     */
    cleanRuns() {
        const runsDir = join(this.baseDir, 'runs');
        if (!existsSync(runsDir))
            return 0;
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
