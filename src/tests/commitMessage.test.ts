import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCommitPrompt, cleanCommitMessage, readCommitContext, suggestCommitMessage } from '../engine/commitMessage.js';

describe('commit messages', () => {
  it('cleans an agent reply down to the message', () => {
    assert.equal(cleanCommitMessage('Here is the commit message:\n```\nfeat: add CSV export\n\nAdds a button.\n```'), 'feat: add CSV export\n\nAdds a button.');
    assert.equal(cleanCommitMessage('"fix: handle empty file"\n\n\n\nBody\nCo-Authored-By: Claude <noreply@anthropic.com>\n🤖 Generated with X'), 'fix: handle empty file\n\nBody');
    assert.equal(cleanCommitMessage('   '), '');
  });

  it('builds a prompt with the repo style, files and a cut diff', () => {
    const prompt = buildCommitPrompt({ stat: ' a.ts | 2 +-', diff: 'x'.repeat(20_000), recentSubjects: ['feat: one', 'fix: two'] }, 'mention the ticket');
    assert.match(prompt, /- feat: one\n- fix: two/);
    assert.match(prompt, /a\.ts \| 2 \+-/);
    assert.match(prompt, /diff cut here/);
    assert.match(prompt, /Also: mention the ticket/);
    assert.ok(prompt.length < 16_000);
  });

  it('reads tracked and new files, and reports a clean tree as no changes', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'vulgr-commit-'));
    try {
      execSync('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "chore: start"', { cwd: repo });
      assert.deepEqual(await suggestCommitMessage(repo), { error: 'no-changes' });
      writeFileSync(join(repo, 'new.txt'), 'hello\n');
      const ctx = await readCommitContext(repo);
      assert.match(ctx.stat, /new\.txt \(new file\)/);
      assert.match(ctx.diff, /new file: new\.txt\nhello/);
      assert.deepEqual(ctx.recentSubjects, ['chore: start']);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
