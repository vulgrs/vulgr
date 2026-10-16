import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelExtraArgs,
  classifyPromptComplexity,
  extractMentionedAgent,
  extractMentionedAgents,
  isUsageLimitReply,
  buildTeamMembers,
  parseTurnControl,
  stripTurnControl,
  pickQuotaBalancedAgents,
  TeamChatCoordinator,
  type TeamChatEvent,
} from '../engine/teamChat.js';
import { AdapterFactory } from '../adapters/factory.js';
import { MockCliAdapter } from '../adapters/mock.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** An empty folder: no package.json, so a team run doesn't start this repo's own test suite. */
const scratchDir = () => mkdtempSync(join(tmpdir(), 'teamchat-'));

describe('TeamChatCoordinator Suite', () => {
  it('classifies simple questions vs multi-step collaborative requests', () => {
    assert.strictEqual(classifyPromptComplexity('bu dosya ne işe yarıyor?'), 'simple');
    assert.strictEqual(classifyPromptComplexity('fix button padding'), 'simple');
    assert.strictEqual(
      classifyPromptComplexity(
        'Kullanıcı yetkilendirme modülü, backend API servisi ve React ekranlarını baştan sona oluştur'
      ),
      'collaborative'
    );
  });

  it('orders team agents from lowest weekly token usage to highest', async () => {
    // Register mock adapters so availability check succeeds
    AdapterFactory.registerAdapter('claude', () => new MockCliAdapter('claude'));
    AdapterFactory.registerAdapter('agy', () => new MockCliAdapter('agy'));
    AdapterFactory.registerAdapter('codex', () => new MockCliAdapter('codex'));

    const usage = {
      total: { calls: 10, tokens: 60000, inputTokens: 40000, outputTokens: 20000, cacheTokens: 0, costUsd: 1, unpricedCalls: 0 },
      byAgent: {
        claude: { calls: 7, tokens: 50000, inputTokens: 35000, outputTokens: 15000, cacheTokens: 0, costUsd: 0.9, unpricedCalls: 0 },
        agy: { calls: 2, tokens: 8000, inputTokens: 4000, outputTokens: 4000, cacheTokens: 0, costUsd: 0.1, unpricedCalls: 0 },
        codex: { calls: 1, tokens: 2000, inputTokens: 1000, outputTokens: 1000, cacheTokens: 0, costUsd: 0, unpricedCalls: 1 },
      },
      byProject: {},
      byDay: [],
    };

    const ordered = await pickQuotaBalancedAgents(['claude', 'agy', 'codex'], usage);
    assert.deepStrictEqual(ordered, ['codex', 'agy', 'claude']);
  });

  it('runs Solo mode with the selected agent and emits agent_start, agent_done, and done events', async () => {
    AdapterFactory.registerAdapter('agy', () => new MockCliAdapter('agy'));
    const coordinator = new TeamChatCoordinator();
    const events: TeamChatEvent[] = [];

    await coordinator.run({
      id: 'test-solo-1',
      prompt: 'Explain the project structure',
      cwd: scratchDir(),
      mode: 'solo',
      soloAgent: 'agy',
      soloModel: 'gemini-2.5-flash',
      lang: 'tr',
      onEvent: (e) => events.push(e),
    });

    assert.ok(events.some((e) => e.type === 'agent_start' && e.agent === 'agy'));
    assert.ok(events.some((e) => e.type === 'agent_done' && e.agent === 'agy'));
    assert.ok(events.some((e) => e.type === 'done'));
  });

  it('uses Fast Economy Path for simple prompts even when Team mode is enabled', async () => {
    AdapterFactory.registerAdapter('claude', () => new MockCliAdapter('claude'));
    AdapterFactory.registerAdapter('agy', () => new MockCliAdapter('agy'));
    const coordinator = new TeamChatCoordinator();
    const events: TeamChatEvent[] = [];

    await coordinator.run({
      id: 'test-team-economy',
      prompt: 'nedir bu fonksiyon?',
      cwd: scratchDir(),
      mode: 'team',
      teamAgents: ['claude', 'agy'],
      lang: 'tr',
      onEvent: (e) => events.push(e),
    });

    const agentStarts = events.filter((e) => e.type === 'agent_start');
    assert.strictEqual(agentStarts.length, 1, 'Simple prompt should only wake 1 agent to save quota');
    assert.ok(events.some((e) => e.type === 'system_note'));
    assert.ok(events.some((e) => e.type === 'done'));
  });

  it('lets the agents talk: each turn answers the previous speaker and the team stops on DONE', async () => {
    const said: string[] = [];
    class TalkingMock extends MockCliAdapter {
      override async execute(prompt: string, options: { onStdout?: (c: string) => void } = {}) {
        said.push(`${this.name}:${prompt.includes('CURSOR:') || prompt.includes('CLAUDE:') ? 'saw-chat' : 'opens'}`);
        const out =
          this.name === 'claude'
            ? 'Plan: add the module. NEXT: cursor'
            : 'It would be better if inputs were validated. Done on my side.\nDONE';
        options.onStdout?.(out);
        return { exitCode: 0, stdout: out, stderr: '', executionTimeMs: 1, timedOut: false };
      }
    }
    AdapterFactory.registerAdapter('claude', () => new TalkingMock('claude'));
    AdapterFactory.registerAdapter('cursor', () => new TalkingMock('cursor'));
    const coordinator = new TeamChatCoordinator();
    const events: TeamChatEvent[] = [];

    await coordinator.run({
      id: 'test-team-talk',
      prompt: 'Kullanıcı profili için backend API servisi ve React arayüz modülünü baştan sona oluştur',
      cwd: scratchDir(),
      mode: 'team',
      teamAgents: ['claude', 'cursor'],
      lang: 'tr',
      onEvent: (e) => events.push(e),
    });

    const starts = events.filter((e) => e.type === 'agent_start');
    assert.strictEqual(starts.length, 2, 'claude opens, cursor answers and closes with DONE');
    assert.ok(starts[1].type === 'agent_start' && starts[1].replyTo === 'claude');
    assert.deepStrictEqual(said, ['claude:opens', 'cursor:saw-chat']);
    const done = events.filter((e) => e.type === 'agent_done');
    assert.ok(done.every((e) => e.type === 'agent_done' && !/NEXT:|DONE$/.test(e.text)));
    assert.ok(events.some((e) => e.type === 'done'));
  });

  it('folds <think> blocks into a thinking event and keeps them out of the reply', async () => {
    class ThinkingMock extends MockCliAdapter {
      override async execute(_prompt: string, options: { onStdout?: (c: string) => void } = {}) {
        const out = '<think>check the index usage first</think>Indexes refactored.';
        options.onStdout?.(out);
        return { exitCode: 0, stdout: out, stderr: '', executionTimeMs: 1, timedOut: false };
      }
    }
    AdapterFactory.registerAdapter('cursor', () => new ThinkingMock('cursor'));
    const coordinator = new TeamChatCoordinator();
    const events: TeamChatEvent[] = [];

    await coordinator.run({
      id: 'test-solo-thinking',
      prompt: 'Refactor database indexing',
      cwd: scratchDir(),
      mode: 'solo',
      soloAgent: 'cursor',
      soloModel: 'claude-fable-5-1-thinking-max',
      lang: 'tr',
      onEvent: (e) => events.push(e),
    });

    const thinking = events.filter((e) => e.type === 'thinking');
    assert.ok(thinking.length > 0);
    assert.ok(thinking.every((e) => e.type === 'thinking' && e.text === 'check the index usage first'));
    const done = events.find((e) => e.type === 'agent_done');
    assert.ok(done && done.type === 'agent_done' && done.text === 'Indexes refactored.');
  });

  it('emits no thinking card when the agent did not reason out loud', async () => {
    AdapterFactory.registerAdapter('agy', () => new MockCliAdapter('agy'));
    const coordinator = new TeamChatCoordinator();
    const events: TeamChatEvent[] = [];

    await coordinator.run({
      id: 'test-solo-plain',
      prompt: 'Explain the project structure',
      cwd: scratchDir(),
      mode: 'solo',
      soloAgent: 'agy',
      lang: 'tr',
      onEvent: (e) => events.push(e),
    });

    assert.ok(!events.some((e) => e.type === 'thinking'));
  });

  it('passes effort the way each CLI expects it', () => {
    assert.deepStrictEqual(buildModelExtraArgs('claude', 'opus', 'high'), ['--model', 'opus', '--effort', 'high']);
    assert.deepStrictEqual(buildModelExtraArgs('codex', 'gpt-6.1-sol', 'max'), [
      '-m',
      'gpt-6.1-sol',
      '-c',
      'model_reasoning_effort=xhigh',
    ]);
    assert.deepStrictEqual(buildModelExtraArgs('cursor', 'gpt-5.3-codex-high', 'high'), ['--model', 'gpt-5.3-codex-high']);
    assert.deepStrictEqual(buildModelExtraArgs('claude', 'default', 'bogus; rm'), []);
  });

  it('extracts mentioned agent from prompt start and cleans the prompt', () => {
    assert.deepStrictEqual(extractMentionedAgent('@cursor fix the button styles'), {
      agent: 'cursor',
      cleanPrompt: 'fix the button styles',
    });
    assert.deepStrictEqual(extractMentionedAgent('@claude: write tests'), {
      agent: 'claude',
      cleanPrompt: 'write tests',
    });
    assert.deepStrictEqual(extractMentionedAgent('@agy refactor this module'), {
      agent: 'agy',
      cleanPrompt: 'refactor this module',
    });
    assert.deepStrictEqual(extractMentionedAgent('just a normal message without mention'), {
      agent: undefined,
      cleanPrompt: 'just a normal message without mention',
    });
  });

  it('reads every @agent so two or more tags form a team', () => {
    assert.deepStrictEqual(extractMentionedAgents('@claude @cursor rate limiter yaz'), {
      agents: ['claude', 'cursor'],
      leading: ['claude', 'cursor'],
      cleanPrompt: 'rate limiter yaz',
    });
    assert.deepStrictEqual(extractMentionedAgents('@claude ve @cursor: birlikte tasarlayın'), {
      agents: ['claude', 'cursor'],
      leading: ['claude', 'cursor'],
      cleanPrompt: 'birlikte tasarlayın',
    });
    assert.deepStrictEqual(extractMentionedAgents('@codex write it, then @claude reviews it'), {
      agents: ['codex', 'claude'],
      leading: ['codex'],
      cleanPrompt: 'write it, then @claude reviews it',
    });
    assert.deepStrictEqual(extractMentionedAgents('mail me at a@b.com @unknown hi').agents, []);
  });

  it('runs tagged agents as a discussion with the models picked for each, even in solo mode', async () => {
    const calls: Array<{ agent: string; extraArgs: string[] }> = [];
    for (const id of ['claude', 'cursor'] as const) {
      AdapterFactory.registerAdapter(id, (opts?: any) => {
        const mock = new MockCliAdapter(id);
        const original = mock.execute.bind(mock);
        mock.execute = async (prompt: string, o: any) => {
          calls.push({ agent: id, extraArgs: opts?.extraArgs ?? [] });
          const res = await original(prompt, o);
          return { ...res, stdout: `${id} reply\nDONE` };
        };
        return mock;
      });
    }
    const events: TeamChatEvent[] = [];
    await new TeamChatCoordinator().run({
      id: 't-multi',
      prompt: '@claude @cursor fix it',
      cwd: scratchDir(),
      mode: 'solo',
      soloAgent: 'claude',
      teamModels: { claude: { model: 'opus', effort: 'high' }, cursor: { model: 'gpt-5.3-codex' } },
      onEvent: (e) => events.push(e),
    });
    assert.deepStrictEqual(
      calls.slice(0, 2).map((c) => c.agent),
      ['claude', 'cursor']
    );
    assert.deepStrictEqual(calls[0].extraArgs, ['--model', 'opus', '--effort', 'high']);
    assert.deepStrictEqual(calls[1].extraArgs, ['--model', 'gpt-5.3-codex']);
    assert.ok(!events.some((e) => e.type === 'system_note' && /Kota Koruma/.test(e.badge ?? '')));
  });

  it('recognises a CLI quota notice so the team stops instead of talking on', () => {
    assert.ok(isUsageLimitReply("You've hit your session limit · resets 8:30pm (Europe/Istanbul)"));
    assert.ok(!isUsageLimitReply('Rate limiter now handles the session limit option.\n' + 'x'.repeat(400)));
    assert.ok(!isUsageLimitReply('CURSOR, I agree with the limit semantics.'));
  });

  it('numbers the seats of an agent that is in the team twice', () => {
    assert.deepStrictEqual(
      buildTeamMembers(['claude', 'cursor', 'claude']).map((m) => m.key),
      ['claude-1', 'cursor', 'claude-2']
    );
    assert.deepStrictEqual(parseTurnControl('ok\nNEXT: CLAUDE-2', ['claude-1', 'claude-2']), {
      next: 'claude-2',
      done: false,
    });
    assert.deepStrictEqual(extractMentionedAgents('@claude @claude bunu tartışın').agents, ['claude', 'claude']);
  });

  it('runs two seats of the same agent, each with its own model, and tells each about its twin', async () => {
    const calls: Array<{ extraArgs: string[]; prompt: string }> = [];
    AdapterFactory.registerAdapter('claude', (opts?: any) => {
      const mock = new MockCliAdapter('claude');
      mock.execute = async (prompt: string) => {
        calls.push({ extraArgs: opts?.extraArgs ?? [], prompt });
        return { exitCode: 0, stdout: 'görüşüm\nDONE', stderr: '', executionTimeMs: 1, timedOut: false };
      };
      return mock;
    });
    const events: TeamChatEvent[] = [];
    await new TeamChatCoordinator().run({
      id: 't-twins',
      prompt: '@claude @claude cache katmanını tasarlayın',
      cwd: scratchDir(),
      mode: 'team',
      teamModels: { 'claude-1': { model: 'opus' }, 'claude-2': { model: 'sonnet' } },
      onEvent: (e) => events.push(e),
    });
    assert.deepStrictEqual(calls.slice(0, 2).map((c) => c.extraArgs), [['--model', 'opus'], ['--model', 'sonnet']]);
    assert.match(calls[0].prompt, /Sen CLAUDE-1'sin/);
    assert.match(calls[0].prompt, /CLAUDE-2 seninle aynı ajan/);
    const starts = events.filter((e): e is Extract<TeamChatEvent, { type: 'agent_start' }> => e.type === 'agent_start');
    assert.deepStrictEqual(starts.slice(0, 2).map((e) => [e.member, e.replyToMember]), [
      ['CLAUDE-1', undefined],
      ['CLAUDE-2', 'CLAUDE-1'],
    ]);
  });

  it('gives agents left on default a fast model in fast mode, keeping explicit picks', async () => {
    const calls: Array<{ agent: string; extraArgs: string[] }> = [];
    for (const id of ['claude', 'cursor'] as const) {
      AdapterFactory.registerAdapter(id, (opts?: any) => {
        const mock = new MockCliAdapter(id);
        mock.execute = async () => {
          calls.push({ agent: id, extraArgs: opts?.extraArgs ?? [] });
          return { exitCode: 0, stdout: 'tamam\nDONE', stderr: '', executionTimeMs: 1, timedOut: false };
        };
        return mock;
      });
    }
    await new TeamChatCoordinator().run({
      id: 't-fast',
      prompt: '@claude @cursor fix it',
      cwd: scratchDir(),
      mode: 'team',
      fast: true,
      teamModels: { claude: { model: 'opus' } },
      onEvent: () => {},
    });
    assert.deepStrictEqual(calls.slice(0, 2), [
      { agent: 'claude', extraArgs: ['--model', 'opus'] },
      { agent: 'cursor', extraArgs: ['--model', 'gpt-5.3-codex-low-fast'] },
    ]);
  });
});
