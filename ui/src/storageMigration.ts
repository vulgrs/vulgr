/**
 * Earlier versions saved interface state under "warp.*" and "vulgaris.*".
 * Before anything reads it, each such key moves once to the same name under
 * "vulgr.*" (a value already saved under the new name wins).
 */
const OLD_PREFIXES = ['warp.', 'vulgaris.'];

try {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && OLD_PREFIXES.some((p) => key.startsWith(p))) keys.push(key);
  }
  for (const key of keys) {
    const next = `vulgr.${key.slice(key.indexOf('.') + 1)}`;
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value);
    localStorage.removeItem(key);
  }
} catch {
  // Storage unavailable: nothing to move.
}

export {};
