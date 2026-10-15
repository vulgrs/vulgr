import { app, type BrowserWindow } from 'electron';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Smoke test (`npm run smoke`, or start with --smoke): starts the real app, waits for the interface,
 * opens the lazily loaded parts, and exits 0 when nothing went wrong or 1 with
 * the errors. VULGR_SMOKE_SHOT=<file.png> also saves a screenshot, after running
 * VULGR_SMOKE_JS in the page when set (e.g. to open a window first).
 */
export const smokeMode = process.env.VULGR_SMOKE === '1' || process.argv.includes('--smoke');

/**
 * A throwaway profile, so a smoke run never touches the user's sessions. The
 * same folder is emptied at each start, so runs don't pile up.
 */
export function prepareSmokeProfile(): void {
  if (!smokeMode) return;
  const profile = join(tmpdir(), 'vulgr-smoke');
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  app.setPath('userData', profile);
}

export function watchSmoke(win: BrowserWindow): void {
  if (!smokeMode) return;
  const errors: string[] = [];
  const wc = win.webContents;
  // The smoke window is often behind others; keep it painting so screenshots are current.
  wc.setBackgroundThrottling(false);
  wc.on('console-message', (event) => {
    if (event.level === 'error') errors.push(`console: ${event.message}`);
  });
  wc.on('preload-error', (_e, path, error) => errors.push(`preload ${path}: ${error.message}`));
  wc.on('render-process-gone', (_e, details) => errors.push(`renderer gone: ${details.reason}`));
  wc.on('did-fail-load', (_e, code, description, url) => errors.push(`load ${url}: [${code}] ${description}`));
  // When a step fails with "Object has been destroyed", these say why the window went away.
  let finishing = false;
  wc.on('destroyed', () => !finishing && console.error('[smoke] web contents destroyed'));
  win.on('closed', () => !finishing && console.error('[smoke] window closed'));
  wc.on('unresponsive', () => errors.push('window became unresponsive'));

  const finish = (code: number) => {
    finishing = true;
    if (code === 0) console.log('[smoke] OK');
    else console.error(`[smoke] FAILED\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    if (code !== 0) console.error(`[smoke] Profile and log kept in ${app.getPath('userData')}`);
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
    let step = 'waiting for the interface';
    try {
      await new Promise((r) => setTimeout(r, 3000));
      step = 'checking that React rendered';
      const mounted = await wc.executeJavaScript(`document.getElementById('root')?.childElementCount ?? 0`);
      if (!mounted) errors.push('React did not render anything into #root');
      // Every lazily loaded window and language must load from the built files.
      step = 'loading the on-demand windows and languages';
      const lazy: string[] = await wc.executeJavaScript(`window.__vulgrSmoke ? window.__vulgrSmoke() : Promise.resolve([])`);
      errors.push(...lazy.map((e) => `lazy: ${e}`));
      step = 'running VULGR_SMOKE_JS';
      if (process.env.VULGR_SMOKE_JS) {
        await wc.executeJavaScript(process.env.VULGR_SMOKE_JS);
        await new Promise((r) => setTimeout(r, 1500));
      }
      const shot = process.env.VULGR_SMOKE_SHOT;
      if (shot) {
        wc.invalidate();
        await new Promise((r) => setTimeout(r, 300));
        writeFileSync(shot, (await wc.capturePage()).toPNG());
      }
    } catch (err: any) {
      errors.push(`check failed (${step}): ${err?.message || err}${wc.isDestroyed() ? ' — the window was already gone' : ''}`);
    }
    clearTimeout(timer);
    finish(errors.length ? 1 : 0);
  });
}

