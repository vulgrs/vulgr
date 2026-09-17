import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface GitDiffResult {
  hasChanges: boolean;
  diff: string;
  filesChanged: string[];
}

export class GitUtils {
  private readonly cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Check if current working directory is inside a valid git repository.
   */
  isGitRepo(): boolean {
    try {
      const res = execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      });
      return res.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Initialize a git repository if one doesn't exist.
   */
  initRepo(): void {
    execSync('git init', { cwd: this.cwd, stdio: 'ignore' });
  }

  /**
   * Retrieves unified git diff of unstaged + staged changes.
   */
  getDiff(): GitDiffResult {
    if (!this.isGitRepo()) {
      return { hasChanges: false, diff: '', filesChanged: [] };
    }

    try {
      // Get unstaged and staged diff
      const unstaged = execSync('git diff', {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const staged = execSync('git diff --cached', {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const untracked = execSync('git ls-files --others --exclude-standard', {
        cwd: this.cwd,
        encoding: 'utf-8',
      }).trim();

      let combinedDiff = [staged, unstaged].filter(Boolean).join('\n');

      // If untracked files exist, note them
      if (untracked) {
        const untrackedList = untracked.split('\n').filter(Boolean);
        const untrackedNotes = untrackedList
          .map((f) => `--- /dev/null\n+++ b/${f}\n@@ -0,0 +1 @@\n+[New untracked file: ${f}]`)
          .join('\n');
        combinedDiff = combinedDiff ? `${combinedDiff}\n${untrackedNotes}` : untrackedNotes;
      }

      // Get files changed list
      const filesRaw = execSync('git status --porcelain', {
        cwd: this.cwd,
        encoding: 'utf-8',
      });
      const filesChanged = filesRaw
        .split('\n')
        .map((l) => l.trim().substring(3).trim())
        .filter(Boolean);

      return {
        hasChanges: combinedDiff.trim().length > 0,
        diff: combinedDiff,
        filesChanged,
      };
    } catch (err) {
      return { hasChanges: false, diff: '', filesChanged: [] };
    }
  }

  /**
   * Reverts all changes in the working tree (staged, unstaged, untracked).
   */
  revertAllChanges(): void {
    if (!this.isGitRepo()) return;

    try {
      execSync('git reset --hard HEAD', { cwd: this.cwd, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: this.cwd, stdio: 'ignore' });
    } catch {
      // Best effort rollback
    }
  }

  /**
   * Returns the current branch name, or null if not on a branch / not a repo.
   */
  getBranch(): string | null {
    if (!this.isGitRepo()) return null;

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();
      return branch === 'HEAD' ? null : branch;
    } catch {
      return null;
    }
  }

  /**
   * Creates a git commit with a message.
   */
  commitAll(message: string): boolean {
    if (!this.isGitRepo()) return false;

    try {
      execSync('git add -A', { cwd: this.cwd, stdio: 'ignore' });
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: this.cwd,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }
}
