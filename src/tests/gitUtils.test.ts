import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitUtils, excludeFromGit } from '../git/gitUtils.js';

describe('GitUtils diff', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'vulgr-git-'));
    execSync('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: repo });
    writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('shows the contents of new files, not just their names', async () => {
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'csv.js'), 'export const parse = (t) => t.split(",");\n');
    const diff = new GitUtils(repo).getDiff().diff;
    assert.match(diff, /\+\+\+ b\/src\/csv\.js/);
    assert.match(diff, /\+export const parse/);
    assert.equal((await new GitUtils(repo).getDiffAsync()).diff, diff);
  });

  test('excludeFromGit hides Vulgr folders without touching .gitignore', () => {
    mkdirSync(join(repo, '.ai-bridge'));
    writeFileSync(join(repo, '.ai-bridge', 'log.json'), '{}');
    excludeFromGit(repo, '.ai-bridge/');
    excludeFromGit(repo, '.ai-bridge/');
    assert.equal(readFileSync(join(repo, '.gitignore'), 'utf-8'), 'node_modules\n');
    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf-8');
    assert.equal(exclude.split('\n').filter((l) => l === '.ai-bridge/').length, 1);
    assert.doesNotMatch(new GitUtils(repo).getDiff().filesChanged.join(' '), /ai-bridge/);
  });

  test('excludeFromGit is a no-op outside a git repo', () => {
    const plain = mkdtempSync(join(tmpdir(), 'vulgr-plain-'));
    excludeFromGit(plain, '.ai-bridge/');
    assert.equal(existsSync(join(plain, '.git')), false);
    rmSync(plain, { recursive: true, force: true });
  });
});
