import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { GitUtils, excludeFromGit, type GitDiffResult } from './gitUtils.js';

const execFileAsync = promisify(execFile);

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

export class WorktreeManager {
  private readonly mainCwd: string;
  private readonly git: GitUtils;
  private readonly worktreesDir: string;

  constructor(mainCwd: string = process.cwd()) {
    this.mainCwd = resolve(mainCwd);
    this.git = new GitUtils(this.mainCwd);
    this.worktreesDir = join(this.mainCwd, '.warp-worktrees');
  }

  /** Keeps .warp-worktrees out of `git status` without editing the user's .gitignore. */
  private ensureGitignored(): void {
    excludeFromGit(this.mainCwd, '.warp-worktrees/');
  }

  /**
   * Creates an isolated git worktree branch for autonomous agents.
   */
  async createSandbox(runId?: string, baseBranch?: string): Promise<SandboxSession> {
    if (!this.git.isGitRepo()) {
      throw new Error('Cannot create worktree sandbox outside of a Git repository');
    }

    this.ensureGitignored();
    if (!existsSync(this.worktreesDir)) {
      mkdirSync(this.worktreesDir, { recursive: true });
    }

    const currentBranch = this.git.getBranch() || 'master';
    const base = baseBranch || currentBranch;
    const id = runId || `sandbox-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const branchName = `warp-agent/${id}`;
    const worktreePath = join(this.worktreesDir, id);

    // If an old worktree exists at this path, remove it first
    if (existsSync(worktreePath)) {
      this.destroySandbox(worktreePath, branchName, true);
    }

    try {
      // 1. Create worktree on a new branch branched from HEAD
      execSync(`git worktree add -b "${branchName}" "${worktreePath}" "${base}"`, {
        cwd: this.mainCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });

      // 2. Copy essential local config files if present (.env, .npmrc, etc.)
      const envFile = join(this.mainCwd, '.env');
      if (existsSync(envFile)) {
        try {
          copyFileSync(envFile, join(worktreePath, '.env'));
        } catch {}
      }

      return {
        id,
        branchName,
        baseBranch: base,
        worktreePath,
        createdAt: new Date().toISOString(),
        active: true,
      };
    } catch (err: any) {
      throw new Error(`Failed to create Git worktree at ${worktreePath}: ${err.message || err}`);
    }
  }

  /**
   * Returns a unified diff of all changes made inside the sandbox relative to baseBranch.
   */
  getSandboxDiff(worktreePath: string, baseBranch?: string): GitDiffResult {
    if (!existsSync(worktreePath)) {
      return { hasChanges: false, diff: '', filesChanged: [] };
    }

    const sandboxGit = new GitUtils(worktreePath);
    // Unstaged + staged changes in the worktree
    const localDiff = sandboxGit.getDiff();

    if (!baseBranch) {
      return localDiff;
    }

    try {
      // Also diff committed changes between baseBranch and sandbox HEAD
      const branchDiff = execSync(`git diff "${baseBranch}"...HEAD`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [branchDiff, localDiff.diff].filter(Boolean).join('\n');
      return {
        hasChanges: combined.trim().length > 0,
        diff: combined,
        filesChanged: Array.from(new Set([...localDiff.filesChanged])),
      };
    } catch {
      return localDiff;
    }
  }

  /**
   * Merges all work from the sandbox branch back into targetBranch.
   */
  async mergeSandbox(
    worktreePath: string,
    branchName: string,
    targetBranch?: string,
    commitMsg?: string
  ): Promise<SandboxMergeResult> {
    const sandboxGit = new GitUtils(worktreePath);
    const target = targetBranch || this.git.getBranch() || 'master';
    const message = commitMsg || `feat(agent): merge autonomous solution from ${branchName}`;

    // 1. Commit any remaining uncommitted work in the worktree
    if (existsSync(worktreePath)) {
      try {
        sandboxGit.commitAll(message);
      } catch {}
    }

    // 2. In primary workspace, merge the agent branch
    try {
      const mergeOutput = execSync(`git merge --no-ff "${branchName}" -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: this.mainCwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const commitHash = execSync('git rev-parse HEAD', { cwd: this.mainCwd, encoding: 'utf-8' }).trim();

      // Clean up sandbox post-merge
      await this.destroySandbox(worktreePath, branchName, true);

      return {
        success: true,
        mergedCommit: commitHash,
      };
    } catch (err: any) {
      const errOutput = (err.stdout || err.stderr || err.message || '').toString();
      const isConflict = errOutput.includes('CONFLICT') || errOutput.includes('Automatic merge failed');

      let conflictFiles: string[] = [];
      if (isConflict) {
        try {
          const status = execSync('git status --porcelain', { cwd: this.mainCwd, encoding: 'utf-8' });
          conflictFiles = status
            .split('\n')
            .filter((l) => l.startsWith('UU ') || l.startsWith('AA '))
            .map((l) => l.substring(3).trim());
        } catch {}
      }

      return {
        success: false,
        conflict: isConflict,
        conflictFiles,
        error: errOutput,
      };
    }
  }

  /**
   * Cleans up and destroys an isolated worktree and its ephemeral branch.
   */
  async destroySandbox(worktreePath: string, branchName: string, force = true): Promise<boolean> {
    try {
      if (existsSync(worktreePath)) {
        try {
          execSync(`git worktree remove ${force ? '--force' : ''} "${worktreePath}"`, {
            cwd: this.mainCwd,
            stdio: 'ignore',
          });
        } catch {}
      }

      // Prune dead worktree refs
      try {
        execSync('git worktree prune', { cwd: this.mainCwd, stdio: 'ignore' });
      } catch {}

      // Delete the temporary branch
      try {
        execSync(`git branch -D "${branchName}"`, { cwd: this.mainCwd, stdio: 'ignore' });
      } catch {}

      // Clean filesystem leftovers if any remain
      if (existsSync(worktreePath)) {
        rmSync(worktreePath, { recursive: true, force: true });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lists all currently active worktrees created under .warp-worktrees
   */
  listSandboxes(): SandboxSession[] {
    if (!this.git.isGitRepo()) return [];

    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.mainCwd,
        encoding: 'utf-8',
      });
      return this.parseWorktreeList(output);
    } catch {
      return [];
    }
  }

  /** Non-blocking listSandboxes(), for the UI's periodic refresh. */
  async listSandboxesAsync(): Promise<SandboxSession[]> {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.mainCwd,
        encoding: 'utf-8',
        windowsHide: true,
      });
      return this.parseWorktreeList(stdout);
    } catch {
      return [];
    }
  }

  private parseWorktreeList(output: string): SandboxSession[] {
    const lines = output.split('\n');
    const sessions: SandboxSession[] = [];
    let currentPath = '';
    let currentBranch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.substring(9).trim();
      } else if (line.startsWith('branch ')) {
        currentBranch = line.substring(7).replace('refs/heads/', '').trim();
      } else if (line.trim().length === 0 && currentPath) {
        if (currentPath.includes('.warp-worktrees') || currentBranch.startsWith('warp-agent/')) {
          const id = currentPath.split(/[/\\]/).pop() || currentBranch;
          sessions.push({
            id,
            branchName: currentBranch,
            baseBranch: 'HEAD',
            worktreePath: currentPath,
            createdAt: new Date().toISOString(),
            active: true,
          });
        }
        currentPath = '';
        currentBranch = '';
      }
    }

    return sessions;
  }
}
