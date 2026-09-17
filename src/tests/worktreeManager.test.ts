import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorktreeManager, type SandboxSession } from '../git/worktreeManager.js';
import { GitUtils } from '../git/gitUtils.js';

describe('WorktreeManager Suite', () => {
  const manager = new WorktreeManager(process.cwd());
  const git = new GitUtils(process.cwd());
  let createdSandbox: SandboxSession | null = null;

  afterEach(async () => {
    if (createdSandbox) {
      await manager.destroySandbox(createdSandbox.worktreePath, createdSandbox.branchName, true);
      createdSandbox = null;
    }
  });

  it('creates an isolated git worktree sandbox with an ephemeral branch', async () => {
    if (!git.isGitRepo()) {
      return; // Skip if not in a git repo
    }

    const runId = `test-run-${Date.now()}`;
    createdSandbox = await manager.createSandbox(runId);

    assert.ok(createdSandbox);
    assert.strictEqual(createdSandbox.id, runId);
    assert.strictEqual(createdSandbox.branchName, `warp-agent/${runId}`);
    assert.ok(existsSync(createdSandbox.worktreePath));
    assert.strictEqual(createdSandbox.active, true);
  });

  it('detects changes made inside the sandbox without contaminating the main repository', async () => {
    if (!git.isGitRepo()) {
      return;
    }

    const runId = `test-diff-${Date.now()}`;
    createdSandbox = await manager.createSandbox(runId);

    // Modify a file strictly inside the sandbox worktree
    const testFile = join(createdSandbox.worktreePath, 'sandbox-test-sample.txt');
    writeFileSync(testFile, 'isolated agent modification', 'utf-8');

    // Main workspace diff must NOT have this file
    const mainDiff = git.getDiff();
    assert.ok(!mainDiff.filesChanged.includes('sandbox-test-sample.txt'));

    // Sandbox diff MUST have this file
    const sandboxDiff = manager.getSandboxDiff(createdSandbox.worktreePath);
    assert.strictEqual(sandboxDiff.hasChanges, true);
    assert.ok(sandboxDiff.filesChanged.some((f) => f.includes('sandbox-test-sample.txt')));
  });

  it('lists active sandboxes and removes them upon destruction', async () => {
    if (!git.isGitRepo()) {
      return;
    }

    const runId = `test-list-${Date.now()}`;
    createdSandbox = await manager.createSandbox(runId);

    const list = manager.listSandboxes();
    assert.ok(list.some((s) => s.id === runId));

    // Destroy sandbox
    const destroyed = await manager.destroySandbox(createdSandbox.worktreePath, createdSandbox.branchName, true);
    assert.strictEqual(destroyed, true);
    assert.ok(!existsSync(createdSandbox.worktreePath));

    createdSandbox = null;
  });
});
