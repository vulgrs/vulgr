import { safeStorage, shell, type BrowserWindow } from 'electron';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

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
}

/**
 * Client ID of Vulgr's GitHub OAuth App (with "Enable Device Flow" on). It is
 * public by design — the device flow needs no client secret — so it ships inside
 * the app and released builds can sign in without any setup. GITHUB_CLIENT_ID in
 * the environment overrides it (e.g. a separate dev app).
 */
const VULGR_GITHUB_CLIENT_ID = '';

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
  private token: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(private storePath: string) {
    this.load();
  }

  setWindow(window: BrowserWindow) {
    this.window = window;
  }

  /** Returns the signed-in user, refreshing the profile and dropping a revoked token. */
  async getUser(): Promise<GitHubUser | null> {
    if (!this.token) return null;
    try {
      const fresh = await this.fetchUser(this.token);
      if (fresh) {
        this.user = fresh;
        this.save();
      } else {
        this.logout();
      }
    } catch {
      // Offline: keep showing the cached profile.
    }
    return this.user;
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

    shell.openExternal(data.verification_uri);
    this.poll(clientId, data.device_code, (data.interval || 5) * 1000, Date.now() + data.expires_in * 1000);
    return { userCode: data.user_code, verificationUri: data.verification_uri, expiresIn: data.expires_in };
  }

  cancelLogin() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  logout() {
    this.cancelLogin();
    this.token = null;
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

        if (data.access_token) {
          this.pollTimer = null;
          const user = await this.fetchUser(data.access_token);
          if (!user) {
            this.emit('auth:error', 'no-profile');
            return;
          }
          this.token = data.access_token;
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
      this.token = stored.encrypted
        ? safeStorage.decryptString(Buffer.from(stored.token, 'base64'))
        : stored.token;
      this.user = stored.user;
    } catch {
      this.token = null;
      this.user = null;
    }
  }

  private save() {
    if (!this.token || !this.user) return;
    const encrypted = safeStorage.isEncryptionAvailable();
    const stored: StoredAuth = {
      token: encrypted ? safeStorage.encryptString(this.token).toString('base64') : this.token,
      encrypted,
      user: this.user,
    };
    writeFileSync(this.storePath, JSON.stringify(stored), { mode: 0o600 });
  }
}
