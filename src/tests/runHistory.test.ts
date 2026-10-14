import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunHistoryStore, type RunRecord } from '../engine/runHistory.js';

const run = (id: string, startedAt: number, extra: Partial<RunRecord> = {}): RunRecord => ({
  id,
  kind: 'swarm',
  goal: `goal ${id}`,
  cwd: '/work/app',
  startedAt,
  endedAt: startedAt + 1000,
  outcome: 'success',
  log: [{ text: 'step' }],
  map: { nodes: [] },
  ...extra,
});

describe('RunHistoryStore', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'vulgr-runs-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('saves runs and lists them newest first without log and map', () => {
    const store = new RunHistoryStore(dir);
    store.save(run('a', 1));
    store.save(run('b', 2, { cwd: '/work/other' }));
    const list = store.list();
    assert.deepEqual(list.map((r) => r.id), ['b', 'a']);
    assert.equal('log' in list[0], false);
    assert.deepEqual(store.list('/work/app').map((r) => r.id), ['a']);
    assert.deepEqual(store.get('a')?.log, [{ text: 'step' }]);
  });

  it('rejects invalid runs and unsafe ids', () => {
    const store = new RunHistoryStore(dir);
    assert.equal(store.save(run('../evil', 1)), null);
    assert.equal(store.save({ ...run('x', 1), kind: 'other' as any }), null);
    assert.equal(store.get('../x'), null);
    assert.equal(store.list().length, 0);
  });

  it('keeps only the newest runs past the limit, and skips damaged files', () => {
    const store = new RunHistoryStore(dir, 2);
    store.save(run('a', 1));
    store.save(run('b', 2));
    store.save(run('c', 3));
    writeFileSync(join(dir, 'broken.json'), '{nope');
    assert.deepEqual(store.list().map((r) => r.id), ['c', 'b']);
  });

  it('removes one run or clears a project', () => {
    const store = new RunHistoryStore(dir);
    store.save(run('a', 1));
    store.save(run('b', 2, { cwd: '/work/other' }));
    assert.equal(store.remove('a'), true);
    assert.equal(store.remove('a'), false);
    store.save(run('c', 3));
    assert.equal(store.clear('/work/other'), 1);
    assert.deepEqual(store.list().map((r) => r.id), ['c']);
  });
});
