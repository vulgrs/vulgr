import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AutoSuggestEngine } from '../engine/autoSuggest.js';
import { MemoryStore } from '../engine/memoryStore.js';
import { SharedSkillsRegistry } from '../engine/sharedSkills.js';

describe('AutoSuggestEngine Suite', () => {
  const testMemoryFile = '.test-suggest-memory.json';
  const testSkillsFile = '.test-suggest-skills.json';

  beforeEach(() => {
    for (const f of [testMemoryFile, testSkillsFile]) {
      const p = join(process.cwd(), f);
      if (existsSync(p)) unlinkSync(p);
    }
  });

  afterEach(() => {
    for (const f of [testMemoryFile, testSkillsFile]) {
      const p = join(process.cwd(), f);
      if (existsSync(p)) unlinkSync(p);
    }
  });

  it('suggests built-in commands when prefix matches', () => {
    const engine = new AutoSuggestEngine(process.cwd());
    const res = engine.getSuggestion('git dif');

    assert.ok(res);
    assert.strictEqual(res.input, 'git dif');
    assert.strictEqual(res.completion, 'git diff HEAD');
    assert.strictEqual(res.suffix, 'f HEAD');
    assert.strictEqual(res.source, 'builtin');
  });

  it('prioritizes recent command history from MemoryStore over built-in commands', () => {
    const memory = new MemoryStore(process.cwd(), testMemoryFile);
    memory.recordCommand('npm test -- --watch', 0, 100, 'Watch tests');

    const engine = new AutoSuggestEngine(process.cwd(), memory);
    const res = engine.getSuggestion('npm t');

    assert.ok(res);
    assert.strictEqual(res.completion, 'npm test -- --watch');
    assert.strictEqual(res.suffix, 'est -- --watch');
    assert.strictEqual(res.source, 'history');
  });

  it('suggests shared skills with default parameters populated', () => {
    const skills = new SharedSkillsRegistry(process.cwd(), testSkillsFile);
    skills.saveCustomSkill({
      id: 'custom:ping-host',
      name: 'Ping Host',
      category: 'custom',
      description: 'Ping a remote host',
      commandTemplate: 'ping -c 4 {{host}}',
      parameters: [{ name: 'host', label: 'Host', description: '', defaultValue: 'google.com' }],
      tags: ['network'],
    });

    const engine = new AutoSuggestEngine(process.cwd(), undefined, skills);
    const res = engine.getSuggestion('ping -c');

    assert.ok(res);
    assert.strictEqual(res.completion, 'ping -c 4 google.com');
    assert.strictEqual(res.source, 'skill');
  });

  it('returns null for empty input or natural language queries starting with #', () => {
    const engine = new AutoSuggestEngine(process.cwd());
    assert.strictEqual(engine.getSuggestion(''), null);
    assert.strictEqual(engine.getSuggestion('   '), null);
    assert.strictEqual(engine.getSuggestion('# port 3000 kapat'), null);
  });
});
