import { app, ipcMain, shell } from 'electron';
import { dirname, join } from 'node:path';
import { LogFile, describeError, type LogLevel } from '../src/engine/logFile.js';

const ISSUES_URL = 'https://github.com/vulgrs/vulgr/issues/new';

/**
 * Writes errors and crashes from the main process, the window and helper
 * processes to <userData>/logs/vulgr.log, so a user can attach it to a bug
 * report. Call once, after the user data folder is final.
 */
export function setupErrorLog(): LogFile {
  const log = new LogFile(join(app.getPath('userData'), 'logs', 'vulgr.log'));

  // Main-process errors and warnings still print as before, and are kept too.
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      log.write(level, 'main', args.map((a) => (typeof a === 'string' ? a : describeError(a))).join(' '));
    };
  }
  process.on('uncaughtException', (err) => log.write('error', 'main', `Uncaught: ${describeError(err)}`));
  process.on('unhandledRejection', (reason) => log.write('error', 'main', `Unhandled rejection: ${describeError(reason)}`));
  app.on('render-process-gone', (_e, _wc, details) =>
    log.write('error', 'renderer', `Window process gone: ${details.reason} (exit code ${details.exitCode})`)
  );
  app.on('child-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') log.write('error', details.type, `Process gone: ${details.reason} (exit code ${details.exitCode})`);
  });

  ipcMain.handle('log:write', (_, level: LogLevel, message: string) =>
    log.write(['error', 'warn', 'info'].includes(level) ? level : 'error', 'renderer', String(message).slice(0, 20_000))
  );
  ipcMain.handle('log:open-folder', () => shell.openPath(dirname(log.file)));
  ipcMain.handle('log:report-bug', () => shell.openExternal(ISSUES_URL));

  log.write('info', 'main', `Vulgr started (Electron ${process.versions.electron}, ${process.platform} ${process.arch})`);
  return log;
}
