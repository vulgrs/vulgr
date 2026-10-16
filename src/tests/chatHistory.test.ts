import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatHistoryStore, type ChatRecord } from '../engine/chatHistory.js';

const chat = (id: string, updatedAt: number, extra: Partial<ChatRecord> = {}): ChatRecord => ({
  id,
  title: `chat ${id}`,
  cwd: '/work/app',
  createdAt: updatedAt,
  updatedAt,
  messages: [{ id: 'u1', kind: 'user', text: 'hi' }],
  ...extra,
});

describe('ChatHistoryStore', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'vulgr-chats-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists chats newest first without their messages', () => {
    const store = new ChatHistoryStore(dir);
    store.save(chat('a', 1));
    store.save(chat('b', 2, { cwd: '/work/other' }));
    const list = store.list();
    assert.deepEqual(list.map((c) => c.id), ['b', 'a']);
    assert.equal((list[0] as any).messages, undefined);
    assert.equal(list[0].messageCount, 1);
    assert.deepEqual(store.list('/work/app').map((c) => c.id), ['a']);
  });

  it('replaces a chat on save and keeps its messages', () => {
    const store = new ChatHistoryStore(dir);
    store.save(chat('a', 1));
    store.save(chat('a', 5, { messages: [{ id: 'u1', kind: 'user', text: 'x' }, { id: 'a1', kind: 'assistant', text: 'y' }] }));
    assert.equal(store.list().length, 1);
    assert.equal(store.get('a')?.messages.length, 2);
  });

  it('drops image data and streaming flags', () => {
    const store = new ChatHistoryStore(dir);
    store.save(chat('a', 1, { messages: [{ id: 'u1', kind: 'user', text: 'x', images: ['data:...'], streaming: true }] }));
    const m = store.get('a')!.messages[0];
    assert.equal(m.images, undefined);
    assert.equal(m.streaming, false);
  });

  it('removes chats and rejects unsafe ids', () => {
    const store = new ChatHistoryStore(dir);
    store.save(chat('a', 1));
    assert.equal(store.save(chat('../x', 2)), null);
    assert.equal(store.get('../x'), null);
    assert.equal(store.remove('a'), true);
    assert.deepEqual(store.list(), []);
  });

  it('rebuilds the list when the index is missing and drops chats past the limit', () => {
    const store = new ChatHistoryStore(dir, 2);
    store.save(chat('a', 1));
    store.save(chat('b', 2));
    store.save(chat('c', 3));
    assert.deepEqual(store.list().map((c) => c.id), ['c', 'b']);
    assert.equal(store.get('a'), null);
    unlinkSync(join(dir, 'index.json'));
    assert.deepEqual(store.list().map((c) => c.id), ['c', 'b']);
  });
});
