import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TemplateStore } from '../engine/templateStore.js';

const withStore = (fn: (store: TemplateStore) => void) => {
  const dir = mkdtempSync(join(tmpdir(), 'vulgr-templates-'));
  try {
    fn(new TemplateStore(join(dir, 'templates.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('TemplateStore', () => {
  it('saves, lists by kind, updates and removes templates', () =>
    withStore((store) => {
      const a = store.save({ kind: 'swarm', name: ' Add tests ', goal: 'Add tests', settings: { builder: 'claude', maxRounds: '3' } })!;
      store.save({ kind: 'orchestra', name: 'Big', goal: 'x', settings: { workers: ['claude', 'codex'] } });
      assert.equal(a.name, 'Add tests');
      assert.deepEqual(store.list('swarm').map((t) => t.name), ['Add tests']);
      assert.equal(store.list().length, 2);

      store.save({ ...a, name: 'Renamed' });
      assert.equal(store.list('swarm').length, 1);
      assert.equal(store.list('swarm')[0].name, 'Renamed');

      assert.equal(store.remove(a.id), true);
      assert.equal(store.remove(a.id), false);
      assert.equal(store.list('swarm').length, 0);
    }));

  it('rejects templates without a name or kind and keeps only plain settings', () =>
    withStore((store) => {
      assert.equal(store.save({ kind: 'swarm', name: '  ' }), null);
      assert.equal(store.save({ kind: 'other' as any, name: 'x' }), null);
      const t = store.save({ kind: 'duo', name: 'x', settings: { ok: 'yes', n: 2, bad: { nested: 1 } as any, 'no space': 'x' } })!;
      assert.deepEqual(t.settings, { ok: 'yes', n: 2 });
    }));

  it('puts the most recently used template first', () =>
    withStore((store) => {
      const a = store.save({ kind: 'duo', name: 'A' })!;
      store.save({ kind: 'duo', name: 'B' });
      store.touch(a.id);
      assert.equal(store.list('duo')[0].name, 'A');
    }));
});
