import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * Self-update for the unsigned macOS build, the way Warp-style apps do it
 * without Squirrel: download the release DMG, copy the app out of it, and on
 * restart swap the installed .app for the new one and open it again.
 */

/** The installed .app bundle of the running app, from its executable (…/Vulgr.app/Contents/MacOS/Vulgr). */
export function bundleFromExecutable(execPath: string): string | null {
  const m = execPath.match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
  return m ? m[1] : null;
}

/**
 * Whether the app can replace itself: it must be a real install (not run from
 * the DMG or a translocated quarantine copy) in a folder we may write to.
 */
export function canReplaceBundle(bundle: string | null): boolean {
  if (!bundle || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return false;
  try {
    accessSync(dirname(bundle), constants.W_OK);
    accessSync(bundle, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function releaseDmgUrl(owner: string, repo: string, version: string, arch: string): string {
  const a = arch === 'arm64' ? 'arm64' : 'x64';
  return `https://github.com/${owner}/${repo}/releases/download/v${version}/Vulgr-${version}-${a}.dmg`;
}

/** Downloads `url` to `file`, reporting progress 0-100 when the size is known. */
export async function download(url: string, file: string, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { redirect: 'follow', signal });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  mkdirSync(dirname(file), { recursive: true });
  const out = createWriteStream(file);
  let received = 0;
  let last = -1;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      const percent = total ? Math.floor((received / total) * 100) : 0;
      if (percent !== last) onProgress?.((last = percent));
    }
  } finally {
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  }
}

/** A file's SHA-512 in base64, as electron-builder writes it in latest-mac.yml. */
export async function sha512Base64(file: string): Promise<string> {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('base64');
}

/** The version in an app bundle's Info.plist. */
export async function bundleVersion(app: string): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(app, 'Contents', 'Info.plist')]);
  return stdout.trim();
}

/**
 * Copies the .app out of a DMG into `stagingDir` and returns its path. The DMG
 * is mounted read-only, without showing it in Finder, and always unmounted.
 */
export async function extractAppFromDmg(dmg: string, stagingDir: string): Promise<string> {
  const mount = mkdtempSync(join(tmpdir(), 'vulgr-dmg-'));
  await execFileAsync('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg]);
  try {
    const app = readdirSync(mount).find((n) => n.endsWith('.app'));
    if (!app) throw new Error('No app in the downloaded disk image');
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    const staged = join(stagingDir, app);
    await execFileAsync('/usr/bin/ditto', [join(mount, app), staged]);
    return staged;
  } finally {
    await execFileAsync('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => {});
    rmSync(mount, { recursive: true, force: true });
  }
}

/**
 * The script that swaps the app once this process has exited: the old bundle
 * is moved aside, the new one copied in, and the old one put back if anything
 * fails. Then the app is opened again.
 */
export const SWAP_SCRIPT = `#!/bin/sh
PID="$1"; TARGET="$2"; STAGED="$3"; RELAUNCH="$4"
while kill -0 "$PID" 2>/dev/null; do sleep 0.2; done
rm -rf "$TARGET.old"
if mv "$TARGET" "$TARGET.old"; then
  if /usr/bin/ditto "$STAGED" "$TARGET"; then
    /usr/bin/xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
    rm -rf "$TARGET.old" "$STAGED"
  else
    rm -rf "$TARGET"; mv "$TARGET.old" "$TARGET"
  fi
fi
[ "$RELAUNCH" = "1" ] && /usr/bin/open "$TARGET"
exit 0
`;

/** Starts the swap in the background; the caller quits right after. */
export function startSwap(opts: { pid: number; target: string; staged: string; relaunch?: boolean; scriptDir?: string }): void {
  const dir = opts.scriptDir ?? mkdtempSync(join(tmpdir(), 'vulgr-swap-'));
  const script = join(dir, 'swap.sh');
  writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 });
  const child = spawn('/bin/sh', [script, String(opts.pid), opts.target, opts.staged, opts.relaunch === false ? '0' : '1'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

export const stagingDirFor = (version: string) => join(tmpdir(), 'vulgr-update', version);
export const hasStaged = (version: string) => existsSync(stagingDirFor(version));
