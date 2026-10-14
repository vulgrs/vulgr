import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { releaseHighlights } from '../engine/releaseNotes.js';

describe('releaseHighlights', () => {
  it('takes bullet lines from Markdown, without links and credits', () => {
    const md = '## Highlights\n- **Run history** with replay\n* Cost limit by @someone in https://github.com/x/y/pull/1\nText\n- [Docs](https://x) updated\n- Full Changelog: v1...v2';
    assert.deepEqual(releaseHighlights(md), ['Run history with replay', 'Cost limit', 'Docs updated']);
  });

  it('reads the HTML GitHub renders, and electron-updater note arrays', () => {
    assert.deepEqual(releaseHighlights('<ul><li>One &amp; two</li><li><b>Three</b></li></ul>'), ['One & two', 'Three']);
    assert.deepEqual(releaseHighlights([{ version: '1', note: '- Alpha\n- Beta' }]), ['Alpha', 'Beta']);
    assert.deepEqual(releaseHighlights(null), []);
  });

  it('keeps at most `max` short lines', () => {
    const many = Array.from({ length: 9 }, (_, i) => `- Item ${i} ${'x'.repeat(i === 0 ? 200 : 1)}`).join('\n');
    const out = releaseHighlights(many, 3);
    assert.equal(out.length, 3);
    assert.ok(out[0].length <= 110 && out[0].endsWith('…'));
  });
});
