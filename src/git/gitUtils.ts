import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';

const execFileAsync = promisify(execFile);

export interface GitDiffResult {
  hasChanges: boolean;
  diff: string;
  filesChanged: string[];
}

/** File paths from `git status --porcelain` output. */
function parseStatus(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim().substring(3).trim())
    .filter(Boolean);
}

/** Above this size a new file is listed by name only, so one generated file can't flood an agent's prompt. */
const MAX_UNTRACKED_BYTES = 64 * 1024;

/**
 * New (untracked) files as unified-diff additions with their contents, so a
 * reviewing agent sees the code a builder created rather than just a file name.
 */
function untrackedAsDiff(cwd: string, list: string): string {
  return list
    .split('\n')
    .filter(Boolean)
    .map((f) => {
      let body: string;
      try {
        const path = join(cwd, f);
        const size = statSync(path).size;
        const buf = size <= MAX_UNTRACKED_BYTES ? readFileSync(path) : null;
        if (!buf) body = `+[New file: ${f}, ${size} bytes, too large to include]`;
        else if (buf.includes(0)) body = `+[New binary file: ${f}]`;
        else {
          const lines = buf.toString('utf-8').replace(/\n$/, '').split('\n');
          return `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => '+' + l).join('\n')}`;
        }
      } catch {
        body = `+[New file: ${f}]`;
      }
      return `diff --git a/${f} b/${f}\nnew file mode 100644\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1 @@\n${body}`;
    })
    .join('\n');
}

/**
 * Keeps a Vulgr-owned path (run logs, sandboxes) out of `git status` by adding
 * it to the repo's local `.git/info/exclude`, never touching the user's .gitignore.
 */
export function excludeFromGit(cwd: string, pattern: string): void {
  try {
    let gitDir = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!isAbsolute(gitDir)) gitDir = join(cwd, gitDir);
    const excludePath = join(gitDir, 'info', 'exclude');
    const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf-8') : '';
    if (current.split('\n').some((l) => l.trim() === pattern)) return;
    mkdirSync(dirname(excludePath), { recursive: true });
    appendFileSync(excludePath, `${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`);
  } catch {
    // Not a git repo, or git missing: nothing to keep clean.
  }
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

  /** Runs a git command without blocking the event loop (Electron main process). */
  private async git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  }

  /**
   * Changed files only (`git status --porcelain`): one cheap git call, enough for
   * a "there are changes" badge without building the full diff.
   */
  async getChangedFilesAsync(): Promise<string[]> {
    try {
      return parseStatus(await this.git(['status', '--porcelain']));
    } catch {
      return [];
    }
  }

  /**
   * Non-blocking getDiff(): same result, with the git commands run in parallel.
   * `git status` failing doubles as the "not a repo" check.
   */
  async getDiffAsync(): Promise<GitDiffResult> {
    try {
      const filesRaw = await this.git(['status', '--porcelain']);
      const [unstaged, staged, untracked] = await Promise.all([
        this.git(['diff']),
        this.git(['diff', '--cached']),
        this.git(['ls-files', '--others', '--exclude-standard']).then((s) => s.trim()),
      ]);

      let combinedDiff = [staged, unstaged].filter(Boolean).join('\n');
      if (untracked) {
        const untrackedNotes = untrackedAsDiff(this.cwd, untracked);
        combinedDiff = combinedDiff ? `${combinedDiff}\n${untrackedNotes}` : untrackedNotes;
      }

      const filesChanged = parseStatus(filesRaw);

      return { hasChanges: combinedDiff.trim().length > 0, diff: combinedDiff, filesChanged };
    } catch {
      return { hasChanges: false, diff: '', filesChanged: [] };
    }
  }

  /** Non-blocking getBranch(). */
  async getBranchAsync(): Promise<string | null> {
    try {
      const branch = (await this.git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      return branch === 'HEAD' ? null : branch;
    } catch {
      return null;
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

      if (untracked) {
        const untrackedNotes = untrackedAsDiff(this.cwd, untracked);
        combinedDiff = combinedDiff ? `${combinedDiff}\n${untrackedNotes}` : untrackedNotes;
      }

      // Get files changed list
      const filesRaw = execSync('git status --porcelain', {
        cwd: this.cwd,
        encoding: 'utf-8',
      });
      const filesChanged = parseStatus(filesRaw);

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

  /**
   * Pushes commits to remote.
   */
  push(remote: string = 'origin', branch?: string): { success: boolean; error?: string } {
    if (!this.isGitRepo()) return { success: false, error: 'Not a git repository' };

    try {
      const b = branch || this.getBranch() || 'master';
      execSync(`git push ${remote} ${b}`, { cwd: this.cwd, stdio: 'pipe', encoding: 'utf-8' });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to push' };
    }
  }
}
