import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { claudeStreamJsonParser, codexTokensParser, addUsage, usageTokens } from '../adapters/outputParsers.js';
import { UsageLedger } from '../engine/usageLedger.js';

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
