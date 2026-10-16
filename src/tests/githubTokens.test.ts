import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { needsRefresh, refreshTokenSet, tokenSetFrom } from '../engine/githubTokens.js';

const HOUR = 3_600_000;

describe('githubTokens', () => {
  it('reads the expiring pair a GitHub App hands out', () => {
    assert.deepStrictEqual(
      tokenSetFrom({ access_token: 'ghu_a', expires_in: 28800, refresh_token: 'ghr_b', refresh_token_expires_in: 15897600 }, 1000),
      { accessToken: 'ghu_a', refreshToken: 'ghr_b', expiresAt: 1000 + 28_800_000, refreshExpiresAt: 1000 + 15_897_600_000 }
    );
    assert.deepStrictEqual(tokenSetFrom({ access_token: 'gho_x' }, 1000), {
      accessToken: 'gho_x',
      refreshToken: undefined,
      expiresAt: undefined,
      refreshExpiresAt: undefined,
    });
    assert.strictEqual(tokenSetFrom({ error: 'bad_refresh_token' }), null);
  });

  it('refreshes shortly before the 8 hours are up, and never without a live refresh token', () => {
    const set = { accessToken: 'a', refreshToken: 'r', expiresAt: 8 * HOUR, refreshExpiresAt: 1000 * HOUR };
    assert.strictEqual(needsRefresh(set, 1 * HOUR), false);
    assert.strictEqual(needsRefresh(set, 8 * HOUR - 60_000), true);
    assert.strictEqual(needsRefresh(set, 9 * HOUR), true);
    assert.strictEqual(needsRefresh({ ...set, refreshExpiresAt: 2 * HOUR }, 9 * HOUR), false);
    assert.strictEqual(needsRefresh({ accessToken: 'a' }, 9 * HOUR), false);
  });

  it('sends the device-flow refresh without a client secret and tells rejection from network failure', async () => {
    let sent: any;
    const ok = (async (_url: string, init: any) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28800 }), { status: 200 });
    }) as typeof fetch;
    const set = await refreshTokenSet('Iv23client', 'ghr_old', ok, () => 0);
    assert.deepStrictEqual(sent, { client_id: 'Iv23client', grant_type: 'refresh_token', refresh_token: 'ghr_old' });
    assert.strictEqual(set?.accessToken, 'ghu_new');
    assert.strictEqual(set?.refreshToken, 'ghr_new');

    const rejected = (async () => new Response(JSON.stringify({ error: 'bad_refresh_token' }), { status: 200 })) as typeof fetch;
    assert.strictEqual(await refreshTokenSet('c', 'r', rejected), null);

    const down = (async () => new Response('', { status: 502 })) as typeof fetch;
    await assert.rejects(refreshTokenSet('c', 'r', down));
  });
});
