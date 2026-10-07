import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../engine/memoryStore.js';

describe('MemoryStore Suite', () => {
  const testFileName = '.test-memory.json';
  const testFilePath = join(process.cwd(), testFileName);

  beforeEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  it('learns facts from the project and starts without rules', () => {
    const memory = new MemoryStore(process.cwd(), testFileName);
    const facts = memory.getAllFacts();
    assert.ok(facts.package_manager);
    assert.strictEqual(facts.package_manager.value, 'npm');
    assert.match(facts.framework.value, /Electron/);
    assert.deepStrictEqual(memory.getRules(), []);
  });

  it('stores, updates, and deletes facts', () => {
    const memory = new MemoryStore(process.cwd(), testFileName);
    memory.setFact('port_dev', '5173', 'user');

    const fact = memory.getFact('port_dev');
    assert.ok(fact);
    assert.strictEqual(fact.value, '5173');
    assert.strictEqual(fact.source, 'user');

    const deleted = memory.deleteFact('port_dev');
    assert.strictEqual(deleted, true);
    assert.strictEqual(memory.getFact('port_dev'), undefined);
  });

  it('manages learned rules without duplication', () => {
    const memory = new MemoryStore(process.cwd(), testFileName);
    memory.addRule('Always run unit tests before commit');
    memory.addRule('Always run unit tests before commit');

    const rules = memory.getRules();
    const count = rules.filter((r) => r === 'Always run unit tests before commit').length;
    assert.strictEqual(count, 1);

    const removed = memory.removeRule('Always run unit tests before commit');
    assert.strictEqual(removed, true);
  });

  it('records commands in a circular buffer', () => {
    const memory = new MemoryStore(process.cwd(), testFileName);
    memory.recordCommand('npm test', 0, 120, 'All passed');
    memory.recordCommand('npm run build', 1, 450, 'Syntax error');

    const recent = memory.getRecentCommands(5);
    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0].command, 'npm run build');
    assert.strictEqual(recent[0].exitCode, 1);
    assert.strictEqual(recent[1].command, 'npm test');
    assert.strictEqual(recent[1].exitCode, 0);
  });

  it('generates a compact, token-lean prompt snippet for AI agents', () => {
    const memory = new MemoryStore(process.cwd(), testFileName);
    memory.setFact('test_runner', 'node:test');
    memory.addRule('Use strict TypeScript');

    const snippet = memory.toPromptSnippet();
    assert.ok(snippet.includes('[Project Memory & Rules]'));
    assert.ok(snippet.includes('test_runner: node:test'));
    assert.ok(snippet.includes('Use strict TypeScript'));
  });

  it('stores and retrieves past project conversations', () => {
    const memory = new MemoryStore(process.cwd(), testFileName);
    memory.addConversation({
      id: 'conv-1',
      title: 'Fix React render error',
      agent: 'claude',
      prompt: 'Refactor useEffect dependency array',
      timestamp: new Date().toISOString(),
      exitCode: 0,
    });

    const convs = memory.getConversations();
    assert.strictEqual(convs.length, 1);
    assert.strictEqual(convs[0].agent, 'claude');
    assert.strictEqual(convs[0].title, 'Fix React render error');

    const single = memory.getConversation('conv-1');
    assert.ok(single);
    assert.strictEqual(single?.prompt, 'Refactor useEffect dependency array');
  });
});
