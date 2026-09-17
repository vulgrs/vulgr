import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextOptimizer } from '../engine/contextOptimizer.js';

describe('ContextOptimizer Suite', () => {
  it('strips ANSI color codes, VT100 escapes, and carriage returns cleanly', () => {
    const rawWithAnsi = '\x1b[31mError:\x1b[0m Failed with \x1b[32mcode 1\x1b[0m\r\nDone.';
    const cleaned = ContextOptimizer.cleanAnsi(rawWithAnsi);
    assert.strictEqual(cleaned, 'Error: Failed with code 1\nDone.');
  });

  it('cleans progress bar and spinner overwrites', () => {
    const rawSpinner = 'Loading...\rDownloading [===  ] 30%\rDownloading [======] 100%\nCompleted!';
    const cleaned = ContextOptimizer.cleanSpinners(rawSpinner);
    assert.ok(!cleaned.includes('30%'));
    assert.ok(cleaned.includes('100%'));
    assert.ok(cleaned.includes('Completed!'));
  });

  it('squashes duplicate consecutive lines into a compact summary marker', () => {
    const lines = [
      'Building module A',
      'warning: deprecated flag',
      'warning: deprecated flag',
      'warning: deprecated flag',
      'Building module B',
    ];
    const squashed = ContextOptimizer.squashDuplicateLines(lines);
    assert.strictEqual(squashed.length, 4);
    assert.strictEqual(squashed[0], 'Building module A');
    assert.strictEqual(squashed[1], 'warning: deprecated flag');
    assert.strictEqual(squashed[2], '  ... [repeated 2 more times]');
    assert.strictEqual(squashed[3], 'Building module B');
  });

  it('applies sliding-window truncation to preserve head context and error tail', () => {
    // Generate 100 lines of mock log
    const lines: string[] = ['START BUILD'];
    for (let i = 1; i <= 98; i++) {
      lines.push(`step ${i}: compile file_${i}.ts`);
    }
    lines.push('FATAL ERROR: Type mismatch at line 42');

    const raw = lines.join('\n');
    const optimized = ContextOptimizer.optimizeTerminalLog(raw, {
      maxLines: 20,
      preserveHeadLines: 3,
      preserveTailLines: 3,
    });

    assert.ok(optimized.includes('START BUILD'));
    assert.ok(optimized.includes('FATAL ERROR: Type mismatch at line 42'));
    assert.ok(optimized.includes('Context Optimizer: 94 intermediate lines omitted to save tokens'));
  });

  it('compacts large git diffs without blowing context budget', () => {
    const diffLines: string[] = [
      'diff --git a/bigfile.ts b/bigfile.ts',
      '--- a/bigfile.ts',
      '+++ b/bigfile.ts',
    ];
    for (let i = 0; i < 200; i++) {
      diffLines.push(`+ const x_${i} = ${i};`);
    }

    const diff = diffLines.join('\n');
    const compacted = ContextOptimizer.optimizeDiff(diff, 20);

    assert.ok(compacted.includes('diff --git a/bigfile.ts'));
    assert.ok(compacted.includes('Diff compacted:'));
    assert.ok(compacted.includes('+ const x_199'));
  });

  it('estimates token cost heuristics', () => {
    const text = 'Hello world, this is a test.';
    const tokens = ContextOptimizer.estimateTokenCost(text);
    assert.ok(tokens > 0 && tokens < 20);
  });
});
