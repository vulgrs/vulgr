import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { claudeStreamJsonParser, codexTokensParser, codexJsonParser, cursorStreamJsonParser, addUsage, usageTokens } from '../adapters/outputParsers.js';
import { UsageLedger } from '../engine/usageLedger.js';
import { AdapterFactory } from '../adapters/factory.js';
import { AgentMesh } from '../engine/agentMesh.js';
import { Orchestra } from '../engine/orchestra.js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Shortened from a real `claude -p --output-format stream-json --verbose` run.
const CLAUDE_EVENTS = [
  '{"type":"system","subtype":"init","session_id":"s"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}]}}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"VERDICT: APPROVED"}]}}',
  '{"type":"result","subtype":"success","result":"Hello\\nVERDICT: APPROVED","total_cost_usd":0.0123,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":300,"cache_creation_input_tokens":40}}',
].join('\n') + '\n';

describe('agent output parsers', () => {
  it('reads Claude stream-json in chunks: live text, final answer, usage and cost', () => {
    const parser = claudeStreamJsonParser();
    let live = '';
    for (let i = 0; i < CLAUDE_EVENTS.length; i += 23) live += parser.push(CLAUDE_EVENTS.slice(i, i + 23));
    assert.equal(live, 'Hello\nVERDICT: APPROVED');
    const { stdout, usage } = parser.finish(CLAUDE_EVENTS, '');
    assert.equal(stdout, 'Hello\nVERDICT: APPROVED');
    assert.deepEqual(usage, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 40, costUsd: 0.0123 });
    assert.equal(usageTokens(usage), 370);
  });

  it('keeps plain output from a Claude CLI that printed no JSON', () => {
    const parser = claudeStreamJsonParser();
    assert.equal(parser.push('error: unknown option\n'), '');
    assert.deepEqual(parser.finish('error: unknown option\n', ''), { stdout: 'error: unknown option\n' });
  });

  it('reads the token count Codex prints, on the same or the next line', () => {
    assert.equal(codexTokensParser().finish('done', 'tokens used: 1,234').usage?.totalTokens, 1234);
    assert.equal(codexTokensParser().finish('answer\ntokens used\n5678\n', '').usage?.totalTokens, 5678);
    assert.equal(codexTokensParser().finish('answer', '').usage, undefined);
  });

  it('adds usages, keeping the cost unknown when no part had one', () => {
    const a = { inputTokens: 1, outputTokens: 2 };
    assert.equal(addUsage(a, { inputTokens: 0, outputTokens: 0, totalTokens: 7 })?.costUsd, undefined);
    assert.equal(addUsage(a, { inputTokens: 1, outputTokens: 1, costUsd: 0.5 })?.costUsd, 0.5);
    assert.equal(addUsage(a, { inputTokens: 1, outputTokens: 1 })?.totalTokens, 5);
  });
});

describe('UsageLedger', () => {
  it('sums by agent, project and day, and filters by time and project', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vulgr-usage-'));
    try {
      const ledger = new UsageLedger(join(dir, 'usage.jsonl'));
      const now = Date.now();
      ledger.add({ at: now, agent: 'claude', cwd: '/a', usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.1 } });
      ledger.add({ at: now, agent: 'codex', cwd: '/b', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 100 } });
      ledger.add({ at: now - 3 * 86_400_000, agent: 'claude', cwd: '/a', usage: { inputTokens: 1, outputTokens: 1, costUsd: 1 } });
      appendFileSync(join(dir, 'usage.jsonl'), '{broken\n');

      const all = ledger.summary();
      assert.equal(all.total.calls, 3);
      assert.equal(all.total.tokens, 117);
      assert.equal(Math.round(all.total.costUsd * 100), 110);
      assert.equal(all.total.unpricedCalls, 1);
      assert.equal(all.byAgent.claude.calls, 2);
      assert.equal(all.byDay.length, 2);

      assert.equal(ledger.summary(now - 86_400_000).total.calls, 2);
      assert.equal(ledger.summary(0, '/b').total.tokens, 100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops entries older than it keeps', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vulgr-usage-'));
    try {
      const ledger = new UsageLedger(join(dir, 'usage.jsonl'), 30);
      ledger.add({ at: Date.now() - 40 * 86_400_000, agent: 'claude', cwd: '/a', usage: { inputTokens: 1, outputTokens: 1 } });
      ledger.add({ at: Date.now(), agent: 'claude', cwd: '/a', usage: { inputTokens: 1, outputTokens: 1 } });
      assert.equal(ledger.entries().length, 1);
      assert.equal(new UsageLedger(join(dir, 'usage.jsonl'), 30).entries().length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cost limit', () => {
  /** An agent whose every call reports $0.30. */
  const pricey = (name: string, reply: (prompt: string, cwd?: string) => string) =>
    AdapterFactory.registerAdapter(name, () => ({
      name,
      binaryPath: name,
      isAvailable: async () => true,
      getVersion: async () => '1',
      execute: async (prompt: string, options: any = {}) => ({
        stdout: reply(prompt, options.cwd),
        stderr: '',
        exitCode: 0,
        executionTimeMs: 1,
        timedOut: false,
        usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.3 },
      }),
    }));

  it('stops Agent Swarm once the reported cost reaches the limit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vulgr-budget-'));
    try {
      let repairs = 0;
      pricey('budget-agent', (prompt) => {
        if (/fix|repair/i.test(prompt)) repairs++;
        return 'VERDICT: APPROVED';
      });
      // Tests always fail, so without a limit the run would use every round.
      const mesh = new AgentMesh({ builder: 'budget-agent', verifier: 'budget-agent', auditor: 'budget-agent', verifyCmd: 'node -e "process.exit(1)"', maxRounds: 5, cwd: dir, lang: 'en', budgetUsd: 0.5 });
      const result = await mesh.runMesh('Anything');
      assert.equal(result.stopped, true);
      assert.equal(result.budgetExceeded, true);
      assert.match(result.error ?? '', /cost limit of \$0\.50/);
      assert.ok((result.usage?.costUsd ?? 0) < 1, 'stopped early');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stops Orchestrator once the reported cost reaches the limit', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'vulgr-budget-o-'));
    try {
      writeFileSync(join(repo, 'README.md'), '# x\n');
      execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -q -m init', { cwd: repo });
      pricey('budget-lead', (prompt) =>
        prompt.includes('Reply with only this JSON')
          ? JSON.stringify({ tasks: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }] })
          : 'VERDICT: APPROVED'
      );
      const orchestra = new Orchestra({ planner: 'budget-lead', workers: ['budget-lead'], cwd: repo, lang: 'en', maxParallel: 1, budgetUsd: 0.5 });
      const result = await orchestra.run('Three parts');
      assert.equal(result.stopped, true);
      assert.equal(result.budgetExceeded, true);
      assert.match(result.error ?? '', /cost limit/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('agent step parsers', () => {
  it('reads Codex JSON events: answer, reasoning, commands, file changes and usage', () => {
    const steps: any[] = [];
    const parser = codexJsonParser((a) => steps.push(a));
    const lines = [
      { type: 'thread.started' },
      { type: 'item.completed', item: { id: 'r0', type: 'reasoning', text: 'look at files' } },
      { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'ls', status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'ls', exit_code: 0, aggregated_output: 'a.ts' } },
      { type: 'item.completed', item: { id: 'f1', type: 'file_change', changes: [{ path: 'a.ts', kind: 'update' }] } },
      { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'Done.' } },
      { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 } },
    ];
    const live = parser.push(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    assert.match(live, /<think>\nlook at files\n<\/think>/);
    const { stdout, usage } = parser.finish('', '');
    assert.equal(stdout, 'Done.');
    assert.equal(usage?.inputTokens, 10);
    assert.deepEqual(
      steps.map((s) => [s.id, s.tool, s.status]),
      [['c1', 'Bash', 'running'], ['c1', 'Bash', 'done'], ['f1', 'Edit', 'done']]
    );
  });

  it('falls back to plain Codex output when there is no JSON', () => {
    const { stdout, usage } = codexJsonParser().finish('answer', 'tokens used: 42');
    assert.equal(stdout, 'answer');
    assert.equal(usage?.totalTokens, 42);
  });

  it('reads cursor-agent stream-json tool calls and result', () => {
    const steps: any[] = [];
    const parser = cursorStreamJsonParser((a) => steps.push(a));
    const lines = [
      { type: 'thinking', subtype: 'delta', text: 'check a.ts' },
      { type: 'thinking', subtype: 'completed' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Reading.' }] } },
      { type: 'tool_call', subtype: 'started', call_id: 't1', tool_call: { readToolCall: { args: { path: 'a.ts' } } } },
      { type: 'tool_call', subtype: 'completed', call_id: 't1', tool_call: { readToolCall: { args: { path: 'a.ts' }, result: { success: {} } } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'All good.' }] } },
      { type: 'result', subtype: 'success', result: 'Reading.All good.', usage: { inputTokens: 7, outputTokens: 3 } },
    ];
    const live = parser.push(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    assert.match(live, /^<think>\ncheck a\.ts\n<\/think>\nReading\.\n\nAll good\.$/);
    const done = parser.finish('', '');
    assert.equal(done.stdout, 'Reading.\n\nAll good.');
    assert.equal(done.usage?.inputTokens, 7);
    assert.deepEqual(steps.map((s) => [s.tool, s.input, s.status]), [['Read', 'a.ts', 'running'], ['Read', 'a.ts', 'done']]);
  });

  it('reports Claude tool calls and their results', () => {
    const steps: any[] = [];
    const parser = claudeStreamJsonParser((a) => steps.push(a));
    parser.push(
      [
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: { command: 'npm test' } }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
      ]
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n'
    );
    assert.deepEqual(steps.map((s) => [s.id, s.status]), [['x', 'running'], ['x', 'done']]);
    assert.equal(steps[0].input, 'npm test');
  });
});
