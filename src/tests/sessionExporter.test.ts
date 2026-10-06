import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionExporter, type SessionReportData } from '../engine/sessionExporter.js';

describe('SessionExporter Suite', () => {
  const sampleData: SessionReportData = {
    title: 'Integration Test Session',
    workspacePath: 'C:/Users/ahmet/Desktop/Projeler/cli',
    branch: 'master',
    timestamp: '2026-09-17 13:00:00',
    commands: [
      {
        id: 'cmd-1',
        command: 'npm run build',
        exitCode: 0,
        timestamp: '13:00:05',
        durationMs: 420,
        stdout: '\u001b[32mBuild complete.\u001b[0m 1613 modules transformed.',
        stderr: '',
      },
      {
        id: 'cmd-2',
        command: 'npm test',
        exitCode: 1,
        timestamp: '13:00:15',
        durationMs: 890,
        stdout: '',
        stderr: 'AssertionError: expected true to be false',
      },
    ],
    agentEvents: [
      {
        agent: 'claude',
        role: 'Builder',
        action: 'Generated fix patch for AssertionError',
        status: 'success',
        timestamp: '13:00:20',
        details: 'Updated assertion to compare strict boolean values.',
      },
    ],
    gitDiff: 'diff --git a/test.ts b/test.ts\n+assert.strictEqual(a, b);',
    filesChanged: ['test.ts'],
  };

  it('generates rich GitHub Flavored Markdown with executive summary and timeline', () => {
    const md = SessionExporter.toMarkdown(sampleData, { includeDiff: true, stripAnsi: true });

    // Verify Title and Metadata
    assert.ok(md.includes('# ⚡ Vulgr Technical Session Report'));
    assert.ok(md.includes('C:/Users/ahmet/Desktop/Projeler/cli'));
    assert.ok(md.includes('master'));

    // Verify Executive Summary metrics
    assert.ok(md.includes('| **Total Commands** | 2 |'));
    assert.ok(md.includes('| **Passed** | 1 |'));
    assert.ok(md.includes('| **Failed** | 1 | ⚠️ 1 Failed |'));
    assert.ok(md.includes('| **Success Rate** | 50% |'));

    // Verify ANSI stripping
    assert.ok(!md.includes('\u001b[32m'));
    assert.ok(md.includes('Build complete.'));

    // Verify Timeline blocks and exit code badges
    assert.ok(md.includes('`npm run build` — `PASS (0)`'));
    assert.ok(md.includes('`npm test` — `FAIL (1)`'));
    assert.ok(md.includes('<details>'));
    assert.ok(md.includes('AssertionError: expected true to be false'));

    // Verify AI Agent events
    assert.ok(md.includes('**CLAUDE** (Builder): Generated fix patch'));

    // Verify Git Diff
    assert.ok(md.includes('Working Copy Git Changes'));
    assert.ok(md.includes('`test.ts`'));
  });

  it('generates standalone dark-mode HTML with embedded styling and search filter', () => {
    const html = SessionExporter.toHtml(sampleData, { includeDiff: true, stripAnsi: true });

    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes('Vulgr Technical Session Report'));
    assert.ok(html.includes('filterCards(this.value)'));

    // Check command cards
    assert.ok(html.includes('data-command="npm run build"'));
    assert.ok(html.includes('data-command="npm test"'));
    assert.ok(html.includes('badge-pass'));
    assert.ok(html.includes('badge-fail'));

    // Check HTML escaping
    assert.ok(!html.includes('<script>alert('));
  });

  it('generates formatted JSON output identical to source data', () => {
    const jsonStr = SessionExporter.toJson(sampleData);
    const parsed = JSON.parse(jsonStr);

    assert.strictEqual(parsed.title, 'Integration Test Session');
    assert.strictEqual(parsed.commands.length, 2);
    assert.strictEqual(parsed.agentEvents.length, 1);
  });

  it('handles empty commands list gracefully without errors', () => {
    const emptyData: SessionReportData = {
      title: 'Empty Session',
      workspacePath: process.cwd(),
      timestamp: '2026-09-17',
      commands: [],
    };

    const md = SessionExporter.toMarkdown(emptyData);
    assert.ok(md.includes('No command blocks recorded'));
    assert.ok(md.includes('| **Success Rate** | 100% |'));

    const html = SessionExporter.toHtml(emptyData);
    assert.ok(html.includes('Total Commands</div>\n        <div class="metric-val">0</div>'));
  });
});
