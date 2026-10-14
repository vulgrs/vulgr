import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPrPrompt, compareUrl, parseGitHubRemote, pullRequestInfo, splitPrReply } from '../engine/pullRequest.js';

describe('pull requests', () => {
  it('reads owner and repo from https and ssh GitHub remotes', () => {
    assert.deepEqual(parseGitHubRemote('https://github.com/vulgrs/vulgr.git'), { owner: 'vulgrs', repo: 'vulgr' });
    assert.deepEqual(parseGitHubRemote('git@github.com:vulgrs/vulgr.git'), { owner: 'vulgrs', repo: 'vulgr' });
    assert.deepEqual(parseGitHubRemote('https://github.com/a/b'), { owner: 'a', repo: 'b' });
    assert.equal(parseGitHubRemote('https://gitlab.com/a/b.git'), null);
  });

  it('builds a pre-filled compare page', () => {
    const url = compareUrl('a', 'b', 'main', 'feature/x', 'Add CSV export', 'Body & more');
    assert.match(url, /^https:\/\/github\.com\/a\/b\/compare\/main\.\.\.feature%2Fx\?expand=1&title=Add\+CSV\+export&body=Body\+%26\+more$/);
  });

  it('splits the agent reply into title and body', () => {
    assert.deepEqual(splitPrReply('```\nAdd CSV export\n\n## Summary\n- one\n```'), { title: 'Add CSV export', body: '## Summary\n- one' });
    assert.deepEqual(splitPrReply('Title: Fix crash\n\nBody\nCo-Authored-By: Claude <x>'), { title: 'Fix crash', body: 'Body' });
  });

  it('puts commits, files and the cut diff in the prompt', () => {
    const p = buildPrPrompt({ base: 'main', log: '- feat: a', stat: ' a.ts | 1 +', diff: 'x'.repeat(20_000) });
    assert.match(p, /compared with main/);
    assert.match(p, /- feat: a/);
    assert.match(p, /diff cut here/);
  });

  it('knows the branch, its base and how many commits it adds', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'vulgr-pr-'));
    try {
      execSync('git init -q && git config user.email t@t && git config user.name t && git branch -M main', { cwd: repo });
      writeFileSync(join(repo, 'a.txt'), 'a\n');
      execSync('git add -A && git commit -q -m one && git switch -q -c feature && git commit -q --allow-empty -m two', { cwd: repo });
      execSync('git remote add origin https://github.com/acme/app.git', { cwd: repo });
      const info = await pullRequestInfo(repo);
      assert.equal(info.branch, 'feature');
      assert.equal(info.base, 'main');
      assert.equal(info.commits, 1);
      assert.deepEqual(info.github, { owner: 'acme', repo: 'app' });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
