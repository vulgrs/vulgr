import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextBus } from '../bus/contextBus.js';
import { MockCliAdapter } from '../adapters/mock.js';
import { AdapterFactory } from '../adapters/factory.js';
import { SelfCorrectionEngine } from '../engine/selfCorrection.js';
import { AdversarialReviewer } from '../engine/reviewer.js';
import { GitUtils } from '../git/gitUtils.js';

describe('Multi-CLI Orchestrator Test Suite', () => {
  const testWorkspace = join(process.cwd(), '.test-workspace');

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

  test('ContextBus initializes run artifacts and stores patches', () => {
    const bus = new ContextBus(testWorkspace);
    const manifest = bus.initRun('Create test JWT endpoint', 'mock', 'mock', {
      verifyEnabled: true,
      dualEnabled: true,
    });

    assert.ok(manifest.runId.startsWith('run-'));
    assert.equal(manifest.prompt, 'Create test JWT endpoint');
    assert.equal(manifest.status, 'PENDING');

    const runDir = bus.getRunDir();
    assert.ok(existsSync(join(runDir, 'context.json')));
    assert.ok(existsSync(join(runDir, 'patches')));
    assert.ok(existsSync(join(runDir, 'logs')));

    const patchPath = bus.savePatch('test.patch', '--- a/file\n+++ b/file\n@@ -1 +1 @@\n+test');
    assert.ok(existsSync(patchPath));

    const logPath = bus.saveLog('test-log', 'Compiler log output here');
    assert.ok(existsSync(logPath));

    bus.updateManifest({ status: 'COMPLETED', durationMs: 1500 });
    const updatedManifest = bus.getManifest();
    assert.equal(updatedManifest?.status, 'COMPLETED');
    assert.equal(updatedManifest?.durationMs, 1500);
  });

  test('AdapterFactory resolves built-in adapters correctly', () => {
    const claude = AdapterFactory.getAdapter('claude');
    assert.equal(claude.name, 'claude');

    const gemini = AdapterFactory.getAdapter('gemini');
    assert.equal(gemini.name, 'gemini');

    const mock = AdapterFactory.getAdapter('mock');
    assert.equal(mock.name, 'mock');

    assert.throws(() => {
      AdapterFactory.getAdapter('non-existent-model');
    }, /Unsupported CLI adapter/);
  });

  test('SelfCorrectionEngine executes command and reports success on passing build', async () => {
    const bus = new ContextBus(testWorkspace);
    bus.initRun('Test self-correction', 'mock', 'mock');

    // Verification command that succeeds (node -e "process.exit(0)")
    const engine = new SelfCorrectionEngine(bus, {
      verificationCommand: 'node -e "process.exit(0)"',
      maxRetries: 2,
      cwd: testWorkspace,
    });

    const mockAdapter = new MockCliAdapter('mock');
    const result = await engine.executeCorrectionLoop(mockAdapter);

    assert.equal(result.passed, true);
    assert.equal(result.attemptsCount, 0);
    assert.equal(result.finalVerification.exitCode, 0);
  });

  test('SelfCorrectionEngine retries up to budget when verification fails', async () => {
    const bus = new ContextBus(testWorkspace);
    bus.initRun('Test failing verification', 'mock', 'mock');

    // Verification command that fails (node -e "process.exit(1)")
    const engine = new SelfCorrectionEngine(bus, {
      verificationCommand: 'node -e "console.error(\'TS2322: Type error\'); process.exit(1)"',
      maxRetries: 2,
      cwd: testWorkspace,
    });

    const mockAdapter = new MockCliAdapter('mock');
    const result = await engine.executeCorrectionLoop(mockAdapter);

    // Budget of 2 retries should be exhausted
    assert.equal(result.passed, false);
    assert.equal(result.attemptsCount, 2);
    assert.equal(result.attempts.length, 2);
    assert.ok(result.errorSummary?.includes('Failed after 2 attempts'));
  });

  test('AdversarialReviewer correctly parses structured findings', async () => {
    const bus = new ContextBus(testWorkspace);
    bus.initRun('Test adversarial review', 'mock', 'mock');

    const reviewer = new AdversarialReviewer(bus, { cwd: testWorkspace });
    const mockAdapter = new MockCliAdapter('mock');

    // Create a temporary file so git diff has something if git repo
    const gitUtils = new GitUtils(testWorkspace);
    gitUtils.initRepo();
    writeFileSync(join(testWorkspace, 'test.js'), 'console.log("hello");\n');

    const report = await reviewer.reviewChanges(mockAdapter);
    assert.ok(report.findings.length > 0);
    assert.equal(report.findings[0].severity, 'WARNING');
    assert.equal(report.findings[0].category, 'EDGE_CASE');
    assert.ok(report.findings[0].title.includes('Race Condition'));
  });
});
