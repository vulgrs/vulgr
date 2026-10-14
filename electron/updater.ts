import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleFromExecutable,
  bundleVersion,
  canReplaceBundle,
  download,
  extractAppFromDmg,
  releaseDmgUrl,
  sha512Base64,
  stagingDirFor,
  startSwap,
} from '../src/engine/macSelfUpdate.js';

const { autoUpdater } = electronUpdater;

const OWNER = 'vulgrs';
const REPO = 'vulgr';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;
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
 * version, at start and every few hours, and downloads it in the background;
 * "Update Vulgr" in the top bar then restarts into it. Windows and Linux
 * (AppImage) use electron-updater. macOS builds are unsigned, which
 * Squirrel.Mac refuses, so there the release DMG is downloaded and the app
 * bundle swapped on restart (see src/engine/macSelfUpdate.ts). A Mac copy that
 * can't replace itself (run from the DMG, or in a read-only folder) is pointed
 * at the release page instead.
 */
export function setupAutoUpdates(getWindow: () => BrowserWindow | null): void {
  let pending: UpdateNotice | null = null;
  // Development runs and the npm-installed app have nothing to update through
  // electron-updater; on Linux only the AppImage can replace itself.
  const supported = app.isPackaged && !(process.platform === 'linux' && !process.env.APPIMAGE);
  const isMac = process.platform === 'darwin';
  const macBundle = isMac ? bundleFromExecutable(process.execPath) : null;
  const macSelfUpdate = isMac && canReplaceBundle(macBundle);
  const canInstall = !isMac || macSelfUpdate;
  // macOS: the new app, copied out of the downloaded DMG, waiting for the restart.
  let macStaged: string | null = null;
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
    if (pending?.kind !== 'downloaded') return;
    if (isMac && macStaged && macBundle) {
      startSwap({ pid: process.pid, target: macBundle, staged: macStaged });
      app.quit();
    } else {
      autoUpdater.quitAndInstall();
    }
  });

  /** macOS: fetch the release DMG and copy the new app out of it, ready for the restart. */
  const downloadForMac = async (version: string, files: { url: string; sha512?: string }[]) => {
    setStatus({ state: 'downloading', version, percent: 0 });
    try {
      const dir = stagingDirFor(version);
      const dmg = join(dir, 'Vulgr.dmg');
      const url = releaseDmgUrl(OWNER, REPO, version, process.arch);
      await download(url, dmg, (percent) => setStatus({ state: 'downloading', percent }));
      // The checksum from the release's latest-mac.yml: a broken or altered download is never installed.
      const expected = files.find((f) => url.endsWith(`/${f.url}`))?.sha512;
      if (!expected) throw new Error('The release lists no checksum for this disk image');
      if ((await sha512Base64(dmg)) !== expected) throw new Error('The downloaded disk image does not match its checksum');
      const staged = await extractAppFromDmg(dmg, join(dir, 'app'));
      rmSync(dmg, { force: true });
      // Never swap in an app that isn't the version we meant to install.
      const found = await bundleVersion(staged);
      if (found !== version) throw new Error(`The downloaded app is version ${found}, expected ${version}`);
      macStaged = staged;
      setStatus({ state: 'downloaded', version, percent: 100 });
      notify({ kind: 'downloaded', version });
    } catch (err: any) {
      console.warn('[Updater] macOS download failed:', err?.message ?? err);
      // Fall back to the release page, so the user can still update by hand.
      setStatus({ state: 'available', version, error: err?.message ?? String(err) });
      notify({ kind: 'available', version, url: `${RELEASES_URL}/tag/v${version}` });
    }
  };

  if (!supported) return;

  autoUpdater.allowPrerelease = true;
  // electron-updater downloads and installs on Windows/Linux; macOS does its own (above).
  autoUpdater.autoDownload = !isMac;
  autoUpdater.autoInstallOnAppQuit = !isMac;

  autoUpdater.on('update-available', (info) => {
    setStatus({ state: canInstall ? 'downloading' : 'available', version: info.version, percent: 0, checkedAt: Date.now() });
    if (macSelfUpdate) void downloadForMac(info.version, info.files ?? []);
    else if (!canInstall) notify({ kind: 'available', version: info.version, url: `${RELEASES_URL}/tag/v${info.version}` });
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
