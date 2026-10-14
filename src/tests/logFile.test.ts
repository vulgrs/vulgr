import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LogFile, describeError } from '../engine/logFile.js';

describe('LogFile', () => {
  it('appends lines with time, level and source, indenting continuation lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vulgr-log-'));
    try {
      const log = new LogFile(join(dir, 'logs', 'vulgr.log'));
      log.write('error', 'main', 'boom\nat line 2');
      log.write('warn', 'renderer', 'careful');
      const text = readFileSync(log.file, 'utf-8');
      assert.match(text, /^\d{4}-\d\d-\d\dT.* ERROR \[main\] boom\n    at line 2\n/);
      assert.match(text, /WARN  \[renderer\] careful\n$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rolls over to .1 when the file would pass its size limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vulgr-log-'));
    try {
      const log = new LogFile(join(dir, 'vulgr.log'), 200);
      for (let i = 0; i < 6; i++) log.write('info', 'test', `line ${i} ${'x'.repeat(40)}`);
      assert.ok(existsSync(`${log.file}.1`));
      assert.ok(readFileSync(log.file, 'utf-8').length <= 200);
      assert.match(readFileSync(log.file, 'utf-8'), /line 5/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('describes errors, strings and other values', () => {
    assert.match(describeError(new Error('bad')), /Error: bad/);
    assert.equal(describeError('plain'), 'plain');
    assert.equal(describeError({ a: 1 }), '{"a":1}');
  });
});
