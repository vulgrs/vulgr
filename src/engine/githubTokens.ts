/**
 * GitHub App user tokens last 8 hours; the refresh token that comes with them
 * lasts 6 months and buys a new pair. Without refreshing, a signed-in user is
 * signed out every 8 hours. Tokens from the device flow refresh without a
 * client secret.
 */

const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Refresh this long before the access token runs out, so a request never meets an expired one. */
const REFRESH_MARGIN_MS = 5 * 60_000;

export interface GitHubTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms; unset for tokens that don't expire (OAuth Apps, or expiry turned off). */
  expiresAt?: number;
  refreshExpiresAt?: number;
}

/** The token set in a token endpoint response, or null when it holds none. */
export function tokenSetFrom(data: any, now = Date.now()): GitHubTokenSet | null {
  if (!data || typeof data.access_token !== 'string' || !data.access_token) return null;
  const seconds = (v: unknown) => (typeof v === 'number' && v > 0 ? now + v * 1000 : undefined);
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : undefined,
    expiresAt: seconds(data.expires_in),
    refreshExpiresAt: seconds(data.refresh_token_expires_in),
  };
}

/** Whether the access token is about to expire and can be renewed. */
export function needsRefresh(set: GitHubTokenSet, now = Date.now()): boolean {
  if (!set.refreshToken || !set.expiresAt) return false;
  if (set.refreshExpiresAt && now >= set.refreshExpiresAt) return false;
  return now >= set.expiresAt - REFRESH_MARGIN_MS;
}

/**
 * Trades the refresh token for a new pair. Resolves to null when GitHub
 * rejects it (revoked or expired: the user has to sign in again); throws on a
 * network failure, which is no reason to sign anyone out.
 */
export async function refreshTokenSet(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now
): Promise<GitHubTokenSet | null> {
  const res = await fetchImpl(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (res.status >= 500) throw new Error(`GitHub ${res.status}`);
  const data: any = await res.json().catch(() => null);
  return tokenSetFrom(data, now());
}
