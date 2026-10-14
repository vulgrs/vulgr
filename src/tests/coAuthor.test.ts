import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VULGR_CO_AUTHOR, withVulgrCoAuthor } from '../git/coAuthor.js';

describe('Vulgr co-author trailer', () => {
  it('adds the trailer after a blank line', () => {
    assert.equal(withVulgrCoAuthor('feat: add export'), `feat: add export\n\n${VULGR_CO_AUTHOR}`);
    assert.equal(withVulgrCoAuthor('fix: x\n\nBody text.\n\n'), `fix: x\n\nBody text.\n\n${VULGR_CO_AUTHOR}`);
  });

  it('joins an existing trailer block and never adds it twice', () => {
    const signed = 'fix: x\n\nSigned-off-by: A <a@b.c>';
    assert.equal(withVulgrCoAuthor(signed), `${signed}\n${VULGR_CO_AUTHOR}`);
    const once = withVulgrCoAuthor('feat: y');
    assert.equal(withVulgrCoAuthor(once), once);
  });

  it('leaves an empty message empty', () => {
    assert.equal(withVulgrCoAuthor('  \n'), '');
  });
});
