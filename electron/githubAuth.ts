import { safeStorage, shell, type BrowserWindow } from 'electron';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { needsRefresh, refreshTokenSet, tokenSetFrom, type GitHubTokenSet } from '../src/engine/githubTokens.js';

/** Public profile shown in the sidebar. */
export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

/**
 * Errors are sent to the renderer as codes ('missing-client-id', 'expired', 'denied',
 * 'no-profile', 'failed') so the UI can translate them; GitHub's own messages pass through.
 */
export interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

interface StoredAuth {
  token: string; // base64 of safeStorage ciphertext, or plain token when encryption is unavailable
  encrypted: boolean;
  user: GitHubUser;
  /** Stored like `token`. Absent in files from before tokens were refreshed. */
  refreshToken?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
}

/**
 * Client ID of the "Vulgr" GitHub App (owner @ahmetulkr, App ID 5211773) with
 * "Enable Device Flow" on. It is public by design — the device flow needs no
 * client secret — so it ships inside the app and released builds can sign in
 * without any setup. GITHUB_CLIENT_ID in the environment overrides it.
 */
const VULGR_GITHUB_CLIENT_ID = 'Iv23liFLUceKxsoc5zZe';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/**
 * GitHub sign-in via the OAuth device flow: no client secret and no redirect
 * server are needed, which suits a desktop app. Requires an OAuth App with
 * "Enable Device Flow" checked; see VULGR_GITHUB_CLIENT_ID.
 */
export class GitHubAuth {
  private window: BrowserWindow | null = null;
  private user: GitHubUser | null = null;
  private tokens: GitHubTokenSet | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(private storePath: string) {
    this.load();
  }

  setWindow(window: BrowserWindow) {
    this.window = window;
  }

  /**
   * Returns the signed-in user and refreshes the profile when the token allows.
   * Like Zed, the session lasts until the user signs out: a token that is
   * expired, rejected or unreadable (macOS keychain refusing an unsigned
   * update) only stops profile refreshes, and the cached profile stays.
   */
  async getUser(): Promise<GitHubUser | null> {
    if (!this.user) return null;
    if (!this.tokens) return this.user;
    try {
      if (needsRefresh(this.tokens) && !(await this.refresh())) return this.user;
      let fresh = await this.fetchUser(this.tokens!.accessToken);
      if (!fresh && this.tokens?.refreshToken && (await this.refresh())) {
        fresh = await this.fetchUser(this.tokens!.accessToken);
      }
      if (fresh) {
        this.user = fresh;
        this.save();
      }
    } catch {
      // Offline: keep showing the cached profile.
    }
    return this.user;
  }

  /** Renews the token pair; false when GitHub rejects the refresh token. Throws when offline. */
  private refresh(): Promise<boolean> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) return Promise.resolve(false);
    // getUser can run several times at once; they share one refresh.
    this.refreshing ??= refreshTokenSet(process.env.GITHUB_CLIENT_ID || VULGR_GITHUB_CLIENT_ID, refreshToken)
      .then((set) => {
        if (!set) return false;
        this.tokens = set;
        this.save();
        return true;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  async startLogin(): Promise<DeviceCodeInfo | { error: string }> {
    const clientId = process.env.GITHUB_CLIENT_ID || VULGR_GITHUB_CLIENT_ID;
    if (!clientId) {
      return { error: 'missing-client-id' };
    }
    this.cancelLogin();

    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'read:user' }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.device_code) {
      return { error: data.error_description || data.error || 'failed' };
    }

    if (typeof data.verification_uri === 'string' && /^https:\/\/github\.com\//i.test(data.verification_uri)) {
      shell.openExternal(data.verification_uri);
    }
    this.poll(clientId, data.device_code, (data.interval || 5) * 1000, Date.now() + data.expires_in * 1000);
    return { userCode: data.user_code, verificationUri: data.verification_uri, expiresIn: data.expires_in };
  }

  cancelLogin() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  logout() {
    this.cancelLogin();
    this.tokens = null;
    this.user = null;
    if (existsSync(this.storePath)) unlinkSync(this.storePath);
    this.emit('auth:changed', null);
  }

  private poll(clientId: string, deviceCode: string, intervalMs: number, deadline: number) {
    this.pollTimer = setTimeout(async () => {
      if (Date.now() > deadline) {
        this.pollTimer = null;
        this.emit('auth:error', 'expired');
        return;
      }
      try {
        const res = await fetch(ACCESS_TOKEN_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, device_code: deviceCode, grant_type: DEVICE_GRANT }),
        });
        const data: any = await res.json();

        const set = tokenSetFrom(data);
        if (set) {
          this.pollTimer = null;
          const user = await this.fetchUser(set.accessToken);
          if (!user) {
            this.emit('auth:error', 'no-profile');
            return;
          }
          this.tokens = set;
          this.user = user;
          this.save();
          this.emit('auth:changed', user);
          return;
        }

        switch (data.error) {
          case 'authorization_pending':
            break;
          case 'slow_down':
            intervalMs += 5000;
            break;
          case 'access_denied':
            this.pollTimer = null;
            this.emit('auth:error', 'denied');
            return;
          case 'expired_token':
            this.pollTimer = null;
            this.emit('auth:error', 'expired');
            return;
          default:
            this.pollTimer = null;
            this.emit('auth:error', data.error_description || data.error || 'failed');
            return;
        }
      } catch {
        // Transient network error: keep polling until the deadline.
      }
      if (this.pollTimer) this.poll(clientId, deviceCode, intervalMs, deadline);
    }, intervalMs);
  }

  /** Resolves to null when the token is rejected; throws on network failure. */
  private async fetchUser(token: string): Promise<GitHubUser | null> {
    const res = await fetch(USER_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Vulgr' },
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const u: any = await res.json();
    return { login: u.login, name: u.name, avatarUrl: u.avatar_url, htmlUrl: u.html_url };
  }

  private emit(channel: string, payload: unknown) {
    this.window?.webContents.send(channel, payload);
  }

  private load() {
    try {
      if (!existsSync(this.storePath)) return;
      const stored: StoredAuth = JSON.parse(readFileSync(this.storePath, 'utf-8'));
      this.user = stored.user ?? null;
      const open = (v: string) => (stored.encrypted ? safeStorage.decryptString(Buffer.from(v, 'base64')) : v);
      this.tokens = {
        accessToken: open(stored.token),
        refreshToken: stored.refreshToken ? open(stored.refreshToken) : undefined,
        expiresAt: stored.expiresAt,
        refreshExpiresAt: stored.refreshExpiresAt,
      };
    } catch {
      // Unreadable token (bad file, or a keychain that turned the app down): stay signed in on the cached profile.
      this.tokens = null;
    }
  }

  private save() {
    if (!this.tokens || !this.user) return;
    try {
      const encrypted = safeStorage.isEncryptionAvailable();
      const seal = (v: string) => (encrypted ? safeStorage.encryptString(v).toString('base64') : v);
      const stored: StoredAuth = {
        token: seal(this.tokens.accessToken),
        encrypted,
        user: this.user,
        refreshToken: this.tokens.refreshToken ? seal(this.tokens.refreshToken) : undefined,
        expiresAt: this.tokens.expiresAt,
        refreshExpiresAt: this.tokens.refreshExpiresAt,
      };
      writeFileSync(this.storePath, JSON.stringify(stored), { mode: 0o600 });
    } catch {
      // Keychain refused: the session lives on in memory and in the file already on disk.
    }
  }
}
