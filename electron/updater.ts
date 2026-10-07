import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

const RELEASES_URL = 'https://github.com/vulgrs/vulgr/releases';

/** What the renderer is told about a new version. */
export type UpdateNotice =
  | { kind: 'available'; version: string; url: string }
  | { kind: 'downloaded'; version: string };

/**
 * Checks GitHub Releases (the `publish` setting in package.json) for a newer
 * version. Windows and Linux (AppImage) download it in the background and
 * install on restart. macOS builds are unsigned, so Squirrel.Mac would refuse
 * the update: there we only point the user at the release page.
 */
export function setupAutoUpdates(getWindow: () => BrowserWindow | null): void {
  let pending: UpdateNotice | null = null;
  const notify = (notice: UpdateNotice) => {
    pending = notice;
    getWindow()?.webContents.send('update:notice', notice);
  };

  ipcMain.handle('update:get-notice', () => pending);
  ipcMain.handle('update:open-release', () => shell.openExternal(pending?.kind === 'available' ? pending.url : RELEASES_URL));
  ipcMain.handle('update:install', () => {
    if (pending?.kind === 'downloaded') autoUpdater.quitAndInstall();
  });

  // Development runs and the npm-installed app have nothing to update through
  // electron-updater; on Linux only the AppImage can replace itself.
  if (!app.isPackaged) return;
  if (process.platform === 'linux' && !process.env.APPIMAGE) return;

  const canInstall = process.platform !== 'darwin';
  autoUpdater.allowPrerelease = true;
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;

  autoUpdater.on('update-available', (info) => {
    if (!canInstall) notify({ kind: 'available', version: info.version, url: `${RELEASES_URL}/tag/v${info.version}` });
  });
  autoUpdater.on('update-downloaded', (info) => notify({ kind: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => console.warn('[Updater]', err?.message ?? err));

  autoUpdater.checkForUpdates().catch((err) => console.warn('[Updater] Update check failed:', err?.message ?? err));
}
