import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toEngineLang, LANG_NAMES } from '../engine/engineLang.js';
import { MESH_TEXT } from '../engine/text/meshText.js';
import { ORCHESTRA_TEXT } from '../engine/text/orchestraText.js';

describe('engine languages', () => {
  it('accepts every interface language and falls back to English', () => {
    for (const lang of Object.keys(LANG_NAMES)) assert.strictEqual(toEngineLang(lang), lang);
    assert.strictEqual(toEngineLang('xx'), 'en');
    assert.strictEqual(toEngineLang(undefined), 'en');
  });

  it('has status texts for every language', () => {
    for (const lang of Object.keys(LANG_NAMES) as (keyof typeof LANG_NAMES)[]) {
      assert.match(MESH_TEXT[lang].verifying('npm test', 1, 3), /npm test/);
      assert.match(ORCHESTRA_TEXT[lang].planned(4), /4/);
    }
  });
});
