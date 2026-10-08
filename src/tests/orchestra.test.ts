import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AdapterFactory } from '../adapters/factory.js';
import { Orchestra, parsePlan, type OrchestraEvent } from '../engine/orchestra.js';
import type { CliExecutionOptions } from '../types/index.js';

const ok = (stdout: string) => ({ stdout, stderr: '', exitCode: 0, executionTimeMs: 1, timedOut: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Registers a fake agent under `name` that answers with `handler`. */
function fakeAgent(name: string, handler: (prompt: string, options: CliExecutionOptions) => Promise<string> | string) {
  AdapterFactory.registerAdapter(name, () => ({
    name,
    binaryPath: name,
    isAvailable: async () => true,
    getVersion: async () => '1',
    execute: async (prompt: string, options: CliExecutionOptions = {}) => ok(await handler(prompt, options)),
  }));
}

describe('Orchestra', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'vulgr-orchestra-'));
    writeFileSync(join(repo, 'README.md'), '# demo\n');
    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -q -m init', { cwd: repo });
    execSync('git config user.email t@t && git config user.name t', { cwd: repo });
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test('splits the goal, runs independent tasks in parallel, merges and applies them', async () => {
    let concurrent = 0;
    let peak = 0;
    const order: string[] = [];
    fakeAgent('o-lead', (prompt) => {
      if (prompt.includes('Reply with only this JSON')) {
        return JSON.stringify({
          summary: 'Three parts',
          tasks: [
            { id: 'a', title: 'Part A', description: 'write a.txt', files: ['a.txt'], dependsOn: [] },
            { id: 'b', title: 'Part B', description: 'write b.txt', files: ['b.txt'], dependsOn: [] },
            { id: 'c', title: 'Part C', description: 'write c.txt using a.txt', files: ['c.txt'], dependsOn: ['a'] },
          ],
        });
      }
      return 'Looks good.\nVERDICT: APPROVED';
    });
    fakeAgent('o-worker', async (prompt, options) => {
      const file = prompt.match(/Your task: Part (\w)/)?.[1].toLowerCase();
      concurrent++;
      peak = Math.max(peak, concurrent);
      await sleep(150);
      if (file === 'c') assert.ok(existsSync(join(options.cwd!, 'a.txt')), 'C starts from a copy that has A merged');
      writeFileSync(join(options.cwd!, `${file}.txt`), `${file}\n`);
      order.push(file!);
      concurrent--;
      return `wrote ${file}.txt`;
    });

    const events: OrchestraEvent[] = [];
    const result = await new Orchestra({
      planner: 'o-lead',
      workers: ['o-worker'],
      reviewer: 'o-lead',
      verifyCmd: 'node -e "process.exit(0)"',
      cwd: repo,
      lang: 'en',
      onEvent: (e) => events.push(e),
    }).run('Write three files');

    assert.equal(result.success, true, result.error);
    assert.equal(result.applied, true);
    assert.equal(result.review, 'approved');
    assert.deepEqual(result.tasks.map((t) => t.state), ['done', 'done', 'done']);
    assert.equal(peak, 2, 'A and B ran at the same time');
    assert.equal(order[2], 'c', 'C waited for A');
    for (const f of ['a', 'b', 'c']) assert.equal(readFileSync(join(repo, `${f}.txt`), 'utf-8'), `${f}\n`);
    assert.ok(events.some((e) => e.type === 'plan'));
    // Applied as uncommitted changes, and no sandbox left behind.
    assert.match(execSync('git status --porcelain', { cwd: repo, encoding: 'utf-8' }), /\?\? a\.txt/);
    assert.equal(execSync('git worktree list', { cwd: repo, encoding: 'utf-8' }).trim().split('\n').length, 1);
  });

  test('resolves a merge conflict between two tasks with the lead agent', async () => {
    fakeAgent('c-lead', (prompt, options) => {
      if (prompt.includes('Reply with only this JSON')) {
        return '```json\n{"summary":"x","tasks":[{"id":"a","title":"A","description":"","files":["shared.txt"]},{"id":"b","title":"B","description":"","files":["shared.txt"]}]}\n```';
      }
      if (prompt.includes('conflict markers')) {
        writeFileSync(join(options.cwd!, 'shared.txt'), 'A\nB\n');
        return 'resolved';
      }
      return 'VERDICT: APPROVED';
    });
    fakeAgent('c-worker', (prompt, options) => {
      const who = prompt.match(/Your task: (\w)/)![1];
      writeFileSync(join(options.cwd!, 'shared.txt'), `${who}\n`);
      return 'done';
    });

    const result = await new Orchestra({
      planner: 'c-lead',
      workers: ['c-worker'],
      verifyCmd: 'node -e "process.exit(0)"',
      cwd: repo,
      lang: 'en',
    }).run('Two tasks that touch one file');

    assert.equal(result.success, true, result.error);
    assert.deepEqual(result.tasks.map((t) => t.state), ['done', 'done']);
    assert.equal(readFileSync(join(repo, 'shared.txt'), 'utf-8'), 'A\nB\n');
  });

  test('a task whose tests keep failing is reported and its dependents are skipped', async () => {
    fakeAgent('f-lead', (prompt) =>
      prompt.includes('Reply with only this JSON')
        ? JSON.stringify({ tasks: [{ id: 'a', title: 'A', files: ['a.txt'] }, { id: 'b', title: 'B', files: ['b.txt'], dependsOn: ['a'] }] })
        : 'VERDICT: APPROVED'
    );
    fakeAgent('f-worker', (_prompt, options) => {
      writeFileSync(join(options.cwd!, 'a.txt'), 'x');
      return 'done';
    });

    const result = await new Orchestra({
      planner: 'f-lead',
      workers: ['f-worker'],
      verifyCmd: 'node -e "process.exit(1)"',
      maxRounds: 2,
      cwd: repo,
      lang: 'en',
    }).run('Fails');

    assert.equal(result.success, false);
    assert.deepEqual(result.tasks.map((t) => t.state), ['failed', 'skipped']);
    assert.equal(existsSync(join(repo, 'a.txt')), false, 'nothing applied');
  });

  test('stop() ends the run and cleans up', async () => {
    fakeAgent('s-lead', async (prompt, options) => {
      if (prompt.includes('Reply with only this JSON')) return JSON.stringify({ tasks: [{ id: 'a', title: 'A' }] });
      return 'VERDICT: APPROVED';
    });
    fakeAgent('s-worker', (_prompt, options) => new Promise((resolve) => options.signal?.addEventListener('abort', () => resolve('stopped'))));
    const orchestra = new Orchestra({ planner: 's-lead', workers: ['s-worker'], cwd: repo, lang: 'en' });
    const pending = orchestra.run('Long task');
    await sleep(400);
    orchestra.stop();
    const result = await pending;
    assert.equal(result.stopped, true);
    assert.equal(execSync('git worktree list', { cwd: repo, encoding: 'utf-8' }).trim().split('\n').length, 1);
  });

  test('a rejected review goes back to the planner once, then tests and review run again', async () => {
    let reviews = 0;
    let fixPrompt = '';
    fakeAgent('r-lead', (prompt, options) => {
      if (prompt.includes('Reply with only this JSON')) return JSON.stringify({ tasks: [{ id: 'a', title: 'A', files: ['a.txt'] }] });
      if (prompt.includes('A reviewer rejected it')) {
        fixPrompt = prompt;
        writeFileSync(join(options.cwd!, 'a.txt'), 'fixed\n');
        return 'fixed';
      }
      return 'unused';
    });
    fakeAgent('r-reviewer', () => (++reviews === 1 ? 'Category case differs.\nVERDICT: REJECTED: mismatch' : 'VERDICT: APPROVED'));
    fakeAgent('r-worker', (_p, options) => {
      writeFileSync(join(options.cwd!, 'a.txt'), 'first\n');
      return 'done';
    });

    const result = await new Orchestra({
      planner: 'r-lead',
      workers: ['r-worker'],
      reviewer: 'r-reviewer',
      verifyCmd: 'node -e "process.exit(0)"',
      cwd: repo,
      lang: 'en',
    }).run('One task');

    assert.equal(result.success, true, result.error);
    assert.equal(reviews, 2);
    assert.equal(result.review, 'approved');
    assert.match(fixPrompt, /Category case differs/);
    assert.equal(readFileSync(join(repo, 'a.txt'), 'utf-8'), 'fixed\n');
  });

  test('with autoApply off the change waits for the developer: apply some files, revise, discard', async () => {
    let revisePrompt = '';
    fakeAgent('p-lead', (prompt, options) => {
      if (prompt.includes('Reply with only this JSON')) {
        return JSON.stringify({ tasks: [{ id: 'a', title: 'A', files: ['a.txt'] }, { id: 'b', title: 'B', files: ['b.txt'] }] });
      }
      if (prompt.includes('asks for these changes')) {
        revisePrompt = prompt;
        writeFileSync(join(options.cwd!, 'a.txt'), 'a, revised\n');
        return 'done';
      }
      return 'VERDICT: APPROVED';
    });
    fakeAgent('p-worker', (prompt, options) => {
      const who = prompt.match(/Your task: (\w)/)![1].toLowerCase();
      writeFileSync(join(options.cwd!, `${who}.txt`), `${who}\n`);
      return 'done';
    });

    const orchestra = new Orchestra({
      planner: 'p-lead',
      workers: ['p-worker'],
      verifyCmd: 'node -e "process.exit(0)"',
      cwd: repo,
      lang: 'en',
      autoApply: false,
    });
    const result = await orchestra.run('Two files');
    assert.equal(result.pendingReview, true);
    assert.equal(result.applied, false);
    assert.deepEqual(result.files?.sort(), ['a.txt', 'b.txt']);
    assert.equal(existsSync(join(repo, 'a.txt')), false, 'nothing applied before review');
    assert.match(await orchestra.liveDiff(), /\+a/);

    const revised = await orchestra.revise('Write "revised" in a.txt');
    assert.match(revisePrompt, /Write "revised" in a\.txt/);
    assert.equal(revised.review, 'approved');

    const { applied } = await orchestra.applyReviewed(['a.txt']);
    assert.equal(applied, true);
    assert.equal(readFileSync(join(repo, 'a.txt'), 'utf-8'), 'a, revised\n');
    assert.equal(existsSync(join(repo, 'b.txt')), false, 'only the chosen file');
    assert.equal(execSync('git worktree list', { cwd: repo, encoding: 'utf-8' }).trim().split('\n').length, 1);
  });

  test('discarding a waiting change leaves the project untouched', async () => {
    fakeAgent('d-lead', (prompt) =>
      prompt.includes('Reply with only this JSON') ? JSON.stringify({ tasks: [{ id: 'a', title: 'A' }] }) : 'VERDICT: APPROVED'
    );
    fakeAgent('d-worker', (_p, options) => {
      writeFileSync(join(options.cwd!, 'a.txt'), 'a\n');
      return 'done';
    });
    const orchestra = new Orchestra({ planner: 'd-lead', workers: ['d-worker'], cwd: repo, lang: 'en', autoApply: false });
    const result = await orchestra.run('One file');
    assert.equal(result.pendingReview, true);
    await orchestra.discardReviewed();
    assert.equal(existsSync(join(repo, 'a.txt')), false);
    assert.equal(execSync('git worktree list', { cwd: repo, encoding: 'utf-8' }).trim().split('\n').length, 1);
  });

  test('parsePlan reads fenced or bare JSON and drops cycles and unknown dependencies', () => {
    const plan = parsePlan('Here:\n```json\n{"tasks":[{"id":"a","title":"A","dependsOn":["b"]},{"id":"b","title":"B","dependsOn":["a","zz"]}]}\n```');
    assert.ok(plan);
    assert.deepEqual(plan.tasks.map((t) => t.dependsOn), [[], []]);
    assert.equal(parsePlan('no json here'), null);
    assert.equal(parsePlan('{"tasks":[]}'), null);
  });
});
