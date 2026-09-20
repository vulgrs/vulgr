import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigManager } from '../engine/configManager.js';

describe('ConfigManager Suite', () => {
  const testFileName = '.test-warp-config.json';
  const testFilePath = join(process.cwd(), testFileName);

  beforeEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath);
    }
  });

  it('initializes with default configuration values', () => {
    const manager = new ConfigManager(process.cwd(), testFileName);
    const config = manager.getConfig();

    const expectedShell = process.platform === 'win32' ? 'powershell' : (process.platform === 'darwin' ? 'zsh' : 'bash');
    assert.strictEqual(config.defaultShell, expectedShell);
    assert.strictEqual(config.fontSize, 13);
    assert.strictEqual(config.cursorStyle, 'bar');
    assert.strictEqual(config.autoSandbox, true);
    assert.strictEqual(config.claude.skipPermissions, false);
    assert.strictEqual(config.claude.model, 'claude-3-7-sonnet');
    assert.strictEqual(config.agy.model, 'gemini-2.5-pro');
  });

  it('updates configuration and persists to disk', () => {
    const manager = new ConfigManager(process.cwd(), testFileName);
    manager.updateConfig({
      fontSize: 16,
      cursorStyle: 'block',
      claude: {
        skipPermissions: true,
        model: 'claude-3-5-sonnet',
        maxRetries: 5,
        additionalFlags: ['--verbose'],
      },
    });

    assert.ok(existsSync(testFilePath));

    // Create a new instance loading from the same file
    const reloadedManager = new ConfigManager(process.cwd(), testFileName);
    const reloaded = reloadedManager.getConfig();

    assert.strictEqual(reloaded.fontSize, 16);
    assert.strictEqual(reloaded.cursorStyle, 'block');
    assert.strictEqual(reloaded.claude.skipPermissions, true);
    assert.strictEqual(reloaded.claude.model, 'claude-3-5-sonnet');
    assert.strictEqual(reloaded.claude.maxRetries, 5);
    assert.deepStrictEqual(reloaded.claude.additionalFlags, ['--verbose']);
  });

  it('computes Claude CLI flags correctly based on permissions and model', () => {
    const manager = new ConfigManager(process.cwd(), testFileName);

    // Default: skipPermissions is false
    let flags = manager.getClaudeCliFlags();
    assert.ok(!flags.includes('--dangerously-skip-permissions'));
    assert.ok(flags.includes('--model'));
    assert.ok(flags.includes('claude-3-7-sonnet'));

    // Enable skipPermissions
    manager.updateConfig({
      claude: {
        skipPermissions: true,
        model: 'claude-3-5-haiku',
        maxRetries: 2,
        additionalFlags: ['--timeout', '60'],
      },
    });

    flags = manager.getClaudeCliFlags();
    assert.ok(flags.includes('--dangerously-skip-permissions'));
    assert.ok(flags.includes('claude-3-5-haiku'));
    assert.ok(flags.includes('--timeout'));
    assert.ok(flags.includes('60'));
  });

  it('resolves shell binary and flags correctly', () => {
    const manager = new ConfigManager(process.cwd(), testFileName);

    manager.updateConfig({ defaultShell: 'powershell' });
    const ps = manager.resolveShellBinary();
    assert.ok(ps.shell.includes('powershell') || ps.shell.includes('pwsh') || ps.shell.includes('sh'));

    manager.updateConfig({ defaultShell: 'cmd' });
    const cmd = manager.resolveShellBinary();
    assert.ok(cmd.shell.includes('cmd.exe') || cmd.shell.includes('sh'));

    manager.updateConfig({ defaultShell: 'wsl' });
    const wsl = manager.resolveShellBinary();
    assert.ok(wsl.shell.includes('wsl.exe') || wsl.shell.includes('sh'));

    manager.updateConfig({ defaultShell: 'zsh' });
    const zsh = manager.resolveShellBinary();
    assert.ok(zsh.shell.includes('zsh') || zsh.shell.includes('powershell'));
  });

  it('resets configuration back to defaults', () => {
    const manager = new ConfigManager(process.cwd(), testFileName);
    manager.updateConfig({
      fontSize: 20,
      claude: {
        skipPermissions: true,
        model: 'custom-model',
        maxRetries: 10,
        additionalFlags: [],
      },
    });

    const resetConfig = manager.resetConfig();
    assert.strictEqual(resetConfig.fontSize, 13);
    assert.strictEqual(resetConfig.claude.skipPermissions, false);
    assert.strictEqual(resetConfig.claude.model, 'claude-3-7-sonnet');
  });
});
