import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { AgentMessageBus, type AgentMessage } from '../bus/agentMessageBus.js';
import { AgentMesh } from '../engine/agentMesh.js';
import { AdapterFactory } from '../adapters/factory.js';
import { MockCliAdapter } from '../adapters/mock.js';
import { parseTestCommand } from '../engine/testPlan.js';

describe('Autonomous Agent Mesh & Message Bus Suite', () => {
  const testWorkspace = join(process.cwd(), '.test-mesh-workspace');

  beforeEach(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
    mkdirSync(testWorkspace, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  test('AgentMessageBus publishes, filters, and persists messages in JSONL', async () => {
    const bus = new AgentMessageBus(testWorkspace);
    const received: AgentMessage[] = [];

    // Subscribe to messages intended for 'claude'
    bus.subscribe((msg) => {
      received.push(msg);
    }, { to: 'claude' });

    // 1. Message not for claude
    await bus.publish('run-1', 'orchestrator', 'agy', 'USER_TASK', {
      summary: 'Task for AGY',
    });

    // 2. Message for claude
    await bus.publish('run-1', 'agy', 'claude', 'VERIFICATION_FAILED', {
      summary: 'Compiler error in auth.ts',
      errorTrace: 'TS2322: Type mismatch',
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].from, 'agy');
    assert.equal(received[0].to, 'claude');
    assert.equal(received[0].type, 'VERIFICATION_FAILED');

    // Verify persistence
    const historical = bus.getRunMessages('run-1');
    assert.equal(historical.length, 2);
    assert.equal(historical[1].payload.errorTrace, 'TS2322: Type mismatch');
  });

  test('AgentMesh completes full autonomous consensus cycle without user prompts', async () => {
    const recordedEvents: AgentMessage[] = [];

    const mesh = new AgentMesh({
      builder: 'mock',
      verifier: 'mock',
      auditor: 'mock',
      verifyCmd: 'node -e "process.exit(0)"', // Passing verification
      cwd: testWorkspace,
      onMessage: (msg) => {
        recordedEvents.push(msg);
      },
    });

    const result = await mesh.runMesh('Build user registration schema');

    assert.equal(result.success, true);
    assert.ok(recordedEvents.length >= 3);

    // Verify autonomous message progression
    const messageTypes = recordedEvents.map((e) => e.type);
    assert.ok(messageTypes.includes('USER_TASK'));
    assert.ok(messageTypes.includes('CODE_READY'));
    assert.ok(messageTypes.includes('VERIFICATION_PASSED'));
    assert.ok(messageTypes.includes('CONSENSUS_APPROVED'));
  });

  test('AgentMesh refuses to start when a chosen agent is not installed', async () => {
    AdapterFactory.registerAdapter('ghost', () => {
      const adapter = new MockCliAdapter('ghost');
      adapter.isAvailable = async () => false;
      return adapter;
    });
    const statuses: string[] = [];
    const mesh = new AgentMesh({
      builder: 'ghost',
      verifier: 'mock',
      auditor: 'mock',
      verifyCmd: 'node -e "process.exit(0)"',
      cwd: testWorkspace,
      onStatus: (s) => statuses.push(s.stage),
    });

    const result = await mesh.runMesh('Anything');
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /ghost/);
    assert.deepEqual(statuses, ['checking', 'failed']);
  });

  test('AgentMesh autonomously repairs failures between Builder and Verifier', async () => {
    const markerFile = join(testWorkspace, '.repaired');
    // First run fails (file doesn't exist), writes file. Second run passes (file exists).
    const mesh = new AgentMesh({
      builder: 'mock',
      verifier: 'mock',
      auditor: 'mock',
      verifyCmd: `node -e "const fs = require('fs'); const p = '${markerFile.replace(/\\/g, '/')}'; if (!fs.existsSync(p)) { fs.writeFileSync(p, 'ok'); process.exit(1); } process.exit(0);"`,
      maxRounds: 3,
      cwd: testWorkspace,
    });

    const result = await mesh.runMesh('Fix critical race condition');
    assert.equal(result.success, true);
    assert.equal(result.rounds, 2);
  });

  test('AgentMesh sends an auditor rejection back to the builder and audits again', async () => {
    const builderPrompts: string[] = [];
    let audits = 0;
    const ok = (stdout: string) => ({ stdout, stderr: '', exitCode: 0, executionTimeMs: 1, timedOut: false });
    AdapterFactory.registerAdapter('test-builder', () => ({
      name: 'test-builder',
      binaryPath: 'test-builder',
      isAvailable: async () => true,
      getVersion: async () => '1',
      execute: async (prompt: string) => {
        builderPrompts.push(prompt);
        return ok('changed the code');
      },
    }));
    AdapterFactory.registerAdapter('test-auditor', () => ({
      name: 'test-auditor',
      binaryPath: 'test-auditor',
      isAvailable: async () => true,
      getVersion: async () => '1',
      execute: async () => {
        audits++;
        return ok(audits === 1 ? 'Empty input crashes.\nVERDICT: REJECTED: empty input' : 'VERDICT: APPROVED');
      },
    }));

    const mesh = new AgentMesh({
      builder: 'test-builder',
      verifier: 'test-auditor',
      auditor: 'test-auditor',
      verifyCmd: 'node -e "process.exit(0)"',
      maxRounds: 3,
      cwd: testWorkspace,
    });

    const result = await mesh.runMesh('Add a parser');
    assert.equal(result.success, true);
    assert.equal(result.audit, 'approved');
    assert.equal(result.rounds, 2);
    assert.equal(audits, 2);
    assert.equal(builderPrompts.length, 2);
    assert.match(builderPrompts[1], /Empty input crashes/);
  });

  test('Without a test command the verifier writes tests from the goal first', async () => {
    execSync('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: testWorkspace });
    const builderPrompts: string[] = [];
    const ok = (stdout: string) => ({ stdout, stderr: '', exitCode: 0, executionTimeMs: 1, timedOut: false });
    AdapterFactory.registerAdapter('test-planner', () => ({
      name: 'test-planner',
      binaryPath: 'test-planner',
      isAvailable: async () => true,
      getVersion: async () => '1',
      execute: async (prompt: string, options?: { cwd?: string }) => {
        if (prompt.includes('write the automated tests')) {
          writeFileSync(join(options?.cwd ?? testWorkspace, 'goal.test.cjs'), 'require("node:assert").ok(require("fs").existsSync(__dirname + "/done"));\n');
          return ok('Wrote goal.test.cjs\nTEST_COMMAND: `node goal.test.cjs`');
        }
        return ok('VERDICT: APPROVED');
      },
    }));
    AdapterFactory.registerAdapter('test-writer', () => ({
      name: 'test-writer',
      binaryPath: 'test-writer',
      isAvailable: async () => true,
      getVersion: async () => '1',
      execute: async (prompt: string, options?: { cwd?: string }) => {
        builderPrompts.push(prompt);
        writeFileSync(join(options?.cwd ?? testWorkspace, 'done'), 'ok');
        return ok('implemented');
      },
    }));

    const events: AgentMessage[] = [];
    const mesh = new AgentMesh({
      builder: 'test-writer',
      verifier: 'test-planner',
      auditor: 'test-planner',
      cwd: testWorkspace,
      onMessage: (m) => events.push(m),
    });

    const result = await mesh.runMesh('Create the done marker');
    assert.equal(result.success, true);
    assert.equal(result.audit, 'approved');
    const written = events.find((e) => e.type === 'TESTS_WRITTEN');
    assert.ok(written);
    assert.deepEqual(written.payload.filesChanged, ['goal.test.cjs']);
    assert.match(written.payload.summary, /node goal\.test\.cjs/);
    assert.match(builderPrompts[0], /goal\.test\.cjs\. Make them pass/);
  });

  test('parseTestCommand reads the last TEST_COMMAND line', () => {
    assert.equal(parseTestCommand('notes\nTEST_COMMAND: npm test\nTEST_COMMAND: `node --test test/csv.test.js`'), 'node --test test/csv.test.js');
    assert.equal(parseTestCommand('no command here'), null);
    assert.equal(parseTestCommand('TEST_COMMAND: <shell command that runs these tests>'), null);
  });

  test('A builder that times out after editing files is judged by the tests', async () => {
    execSync('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: testWorkspace });
    AdapterFactory.registerAdapter('test-hanger', () => ({
      name: 'test-hanger',
      binaryPath: 'test-hanger',
      isAvailable: async () => true,
      getVersion: async () => '1',
      execute: async (prompt: string, options?: { cwd?: string }) => {
        if (prompt.includes('VERDICT')) return { stdout: 'VERDICT: APPROVED', stderr: '', exitCode: 0, executionTimeMs: 1, timedOut: false };
        writeFileSync(join(options?.cwd ?? testWorkspace, 'done'), 'ok');
        return { stdout: '', stderr: '', exitCode: null as unknown as number, executionTimeMs: 1, timedOut: true };
      },
    }));
    const events: AgentMessage[] = [];
    const mesh = new AgentMesh({
      builder: 'test-hanger',
      verifier: 'test-hanger',
      auditor: 'test-hanger',
      verifyCmd: `node -e "process.exit(require('fs').existsSync('done') ? 0 : 1)"`,
      cwd: testWorkspace,
      lang: 'en',
      onMessage: (m) => events.push(m),
    });

    const result = await mesh.runMesh('Create the done marker');
    assert.equal(result.success, true);
    assert.match(events.find((e) => e.type === 'CODE_READY')?.payload.summary ?? '', /stopped early/);
  });
});
