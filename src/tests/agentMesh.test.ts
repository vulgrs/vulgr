import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AgentMessageBus, type AgentMessage } from '../bus/agentMessageBus.js';
import { AgentMesh } from '../engine/agentMesh.js';
import { AdapterFactory } from '../adapters/factory.js';
import { MockCliAdapter } from '../adapters/mock.js';

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
});
