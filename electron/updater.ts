import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { autoUpdater } = electronUpdater;

const RELEASES_URL = 'https://github.com/vulgrs/vulgr/releases';
/** A long-running app looks for a new version this often, not only at start. */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/**
 * Vulgr's own version. A packaged app knows it; started with `electron dist/...`
 * app.getVersion() is Electron's, so read package.json instead.
 */
function vulgrVersion(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkg, 'utf-8')).version || app.getVersion();
  } catch {
    return app.getVersion();
  }
}

/** What the renderer is told about a new version. */
export type UpdateNotice =
  | { kind: 'available'; version: string; url: string }
  | { kind: 'downloaded'; version: string };

/** Where updating stands, for Settings > Updates. */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  currentVersion: string;
  version?: string;
  /** Download progress, 0-100. */
  percent?: number;
  error?: string;
  /** When the last check finished (ms). */
  checkedAt?: number;
}

/**
 * Checks GitHub Releases (the `publish` setting in package.json) for a newer
 * version, at start and every few hours. Windows and Linux (AppImage) download
 * it in the background and install on restart. macOS builds are unsigned, so
 * Squirrel.Mac would refuse the update: there we only point the user at the
 * release page.
 */
export function setupAutoUpdates(getWindow: () => BrowserWindow | null): void {
  let pending: UpdateNotice | null = null;
  // Development runs and the npm-installed app have nothing to update through
  // electron-updater; on Linux only the AppImage can replace itself.
  const supported = app.isPackaged && !(process.platform === 'linux' && !process.env.APPIMAGE);
  const canInstall = process.platform !== 'darwin';
  let status: UpdateStatus = { state: supported ? 'idle' : 'unsupported', currentVersion: vulgrVersion() };

  const setStatus = (patch: Partial<UpdateStatus>) => {
    status = { ...status, ...patch };
    getWindow()?.webContents.send('update:status', status);
  };
  const notify = (notice: UpdateNotice) => {
    pending = notice;
    getWindow()?.webContents.send('update:notice', notice);
  };

  const check = async (): Promise<UpdateStatus> => {
    if (!supported || status.state === 'checking' || status.state === 'downloading' || status.state === 'downloaded') return status;
    setStatus({ state: 'checking', error: undefined });
    try {
      await autoUpdater.checkForUpdates();
    } catch (err: any) {
      setStatus({ state: 'error', error: err?.message ?? String(err), checkedAt: Date.now() });
    }
    return status;
  };

  ipcMain.handle('update:get-notice', () => pending);
  ipcMain.handle('update:get-status', () => status);
  ipcMain.handle('update:check', () => check());
  ipcMain.handle('update:open-release', () => shell.openExternal(pending?.kind === 'available' ? pending.url : RELEASES_URL));
  ipcMain.handle('update:install', () => {
    if (pending?.kind === 'downloaded') autoUpdater.quitAndInstall();
  });

  if (!supported) return;

  autoUpdater.allowPrerelease = true;
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;

  autoUpdater.on('update-available', (info) => {
    setStatus({ state: canInstall ? 'downloading' : 'available', version: info.version, percent: 0, checkedAt: Date.now() });
    if (!canInstall) notify({ kind: 'available', version: info.version, url: `${RELEASES_URL}/tag/v${info.version}` });
  });
  autoUpdater.on('update-not-available', () => setStatus({ state: 'up-to-date', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => setStatus({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version, percent: 100 });
    notify({ kind: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    console.warn('[Updater]', err?.message ?? err);
    setStatus({ state: 'error', error: err?.message ?? String(err), checkedAt: Date.now() });
  });

  void check();
  setInterval(() => void check(), CHECK_EVERY_MS).unref?.();
}
