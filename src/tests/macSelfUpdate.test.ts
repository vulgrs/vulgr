import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bundleFromExecutable, bundleVersion, canReplaceBundle, extractAppFromDmg, releaseDmgUrl, startSwap } from '../engine/macSelfUpdate.js';

const mac = process.platform === 'darwin';

/** A minimal .app with a version and a marker file. */
function fakeApp(dir: string, version: string): string {
  const app = join(dir, 'Vulgr.app');
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`
  );
  writeFileSync(join(app, 'Contents', 'MacOS', 'marker'), version);
  return app;
}

describe('macOS self-update', () => {
  it('finds the bundle and the release DMG', () => {
    assert.equal(bundleFromExecutable('/Applications/Vulgr.app/Contents/MacOS/Vulgr'), '/Applications/Vulgr.app');
    assert.equal(bundleFromExecutable('/usr/local/bin/node'), null);
    assert.equal(canReplaceBundle('/private/var/folders/x/AppTranslocation/ABC/d/Vulgr.app'), false);
    assert.equal(canReplaceBundle('/Volumes/Vulgr/Vulgr.app'), false);
    assert.equal(
      releaseDmgUrl('vulgrs', 'vulgr', '0.2.0-beta', 'arm64'),
      'https://github.com/vulgrs/vulgr/releases/download/v0.2.0-beta/Vulgr-0.2.0-beta-arm64.dmg'
    );
  });

  it('copies the app out of a DMG and swaps it in after the process exits', { skip: !mac }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vulgr-selfupdate-'));
    try {
      // The installed old version, and a DMG holding the new one.
      const installed = fakeApp(join(dir, 'Applications'), '0.1.0');
      const src = join(dir, 'dmg-src');
      fakeApp(src, '0.2.0');
      const dmg = join(dir, 'Vulgr.dmg');
      execFileSync('/usr/bin/hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', src, '-volname', 'Vulgr', dmg]);

      const staged = await extractAppFromDmg(dmg, join(dir, 'staging'));
      assert.equal(await bundleVersion(staged), '0.2.0');
      assert.equal(canReplaceBundle(installed), true);

      // A stand-in for the running app: the swap waits for it to exit.
      const running = spawn('/bin/sleep', ['1']);
      startSwap({ pid: running.pid!, target: installed, staged, relaunch: false, scriptDir: dir });
      assert.equal(readFileSync(join(installed, 'Contents', 'MacOS', 'marker'), 'utf-8'), '0.1.0', 'untouched while running');
      await new Promise((r) => setTimeout(r, 2500));
      assert.equal(readFileSync(join(installed, 'Contents', 'MacOS', 'marker'), 'utf-8'), '0.2.0');
      assert.equal(existsSync(`${installed}.old`), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
