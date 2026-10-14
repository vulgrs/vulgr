import { app, type BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Smoke test (`npm run smoke`, or start with --smoke): starts the real app, waits for the interface,
 * opens the lazily loaded parts, and exits 0 when nothing went wrong or 1 with
 * the errors. VULGR_SMOKE_SHOT=<file.png> also saves a screenshot.
 */
export const smokeMode = process.env.VULGR_SMOKE === '1' || process.argv.includes('--smoke');

/** A throwaway profile, so a smoke run never touches the user's sessions. */
export function prepareSmokeProfile(): void {
  if (smokeMode) app.setPath('userData', join(tmpdir(), `vulgr-smoke-${process.pid}`));
}

export function watchSmoke(win: BrowserWindow): void {
  if (!smokeMode) return;
  const errors: string[] = [];
  const wc = win.webContents;
  wc.on('console-message', (event) => {
    if (event.level === 'error') errors.push(`console: ${event.message}`);
  });
  wc.on('preload-error', (_e, path, error) => errors.push(`preload ${path}: ${error.message}`));
  wc.on('render-process-gone', (_e, details) => errors.push(`renderer gone: ${details.reason}`));
  wc.on('did-fail-load', (_e, code, description, url) => errors.push(`load ${url}: [${code}] ${description}`));

  const finish = (code: number) => {
    if (code === 0) console.log('[smoke] OK');
    else console.error(`[smoke] FAILED\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    app.exit(code);
  };
  // A hung start fails too.
  const timer = setTimeout(() => {
    errors.push('interface did not load within 30 s');
    finish(1);
  }, 30_000);

  let reloaded = false;
  wc.on('did-finish-load', async () => {
    // The fresh profile shows the welcome screen; mark it seen once so the
    // main window (sidebar, terminals) is what gets checked.
    if (!reloaded) {
      reloaded = true;
      await wc.executeJavaScript(`localStorage.setItem('vulgr.onboarded', '1')`);
      wc.reload();
      return;
    }
    try {
      await new Promise((r) => setTimeout(r, 3000));
      const mounted = await wc.executeJavaScript(`document.getElementById('root')?.childElementCount ?? 0`);
      if (!mounted) errors.push('React did not render anything into #root');
      // Every lazily loaded window and language must load from the built files.
      const lazy: string[] = await wc.executeJavaScript(`window.__vulgrSmoke ? window.__vulgrSmoke() : Promise.resolve([])`);
      errors.push(...lazy.map((e) => `lazy: ${e}`));
      const shot = process.env.VULGR_SMOKE_SHOT;
      if (shot) writeFileSync(shot, (await wc.capturePage()).toPNG());
    } catch (err: any) {
      errors.push(`check failed: ${err?.message || err}`);
    }
    clearTimeout(timer);
    finish(errors.length ? 1 : 0);
  });
}

