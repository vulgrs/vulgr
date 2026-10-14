import { useSyncExternalStore } from 'react';
import type { WarpConfig } from './types/warp.js';

/** App actions that have a keyboard shortcut the user can change in Settings. */
export type ShortcutId =
  | 'palette'
  | 'newTab'
  | 'closePane'
  | 'splitH'
  | 'splitV'
  | 'toggleSidebar'
  | 'changes'
  | 'skills'
  | 'sandbox'
  | 'duoLoop'
  | 'history'
  | 'exportReport'
  | 'tokenHud'
  | 'settings'
  | 'guide';

/** "Ctrl" stands for Ctrl, or Cmd on macOS. */
export const SHORTCUT_DEFAULTS: Record<ShortcutId, string> = {
  palette: 'Ctrl+Shift+P',
  newTab: 'Ctrl+Shift+T',
  closePane: 'Ctrl+Shift+W',
  splitH: 'Ctrl+Shift+D',
  splitV: 'Ctrl+Shift+E',
  toggleSidebar: 'Ctrl+Shift+B',
  changes: 'Ctrl+Shift+G',
  skills: 'Ctrl+Shift+K',
  sandbox: 'Ctrl+Shift+U',
  duoLoop: 'Ctrl+Shift+S',
  history: 'Ctrl+Shift+H',
  exportReport: 'Ctrl+Shift+X',
  tokenHud: 'Ctrl+Shift+O',
  settings: 'Ctrl+,',
  guide: 'F1',
};

export const SHORTCUT_IDS = Object.keys(SHORTCUT_DEFAULTS) as ShortcutId[];

const CODE_KEYS: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/**
 * The shortcut a key press stands for, e.g. "Ctrl+Shift+T", read from the
 * physical key so Shift or the keyboard layout doesn't change it. Null for a
 * lone modifier, and for keys without Ctrl/Cmd or Alt (those are typing),
 * except the F-keys.
 */
export function comboFromEvent(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else key = CODE_KEYS[e.code];
  if (!key) return null;
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl && !e.altKey && !/^F\d/.test(key)) return null;
  return [ctrl && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+');
}

/** The action a combo runs, if any. */
export function shortcutFor(keymap: Record<ShortcutId, string>, combo: string): ShortcutId | undefined {
  return SHORTCUT_IDS.find((id) => keymap[id] === combo);
}

/** As shown to the user: Cmd/Option symbols on macOS. */
export function displayCombo(combo: string): string {
  if (!/Mac/i.test(navigator.platform)) return combo;
  return combo.replace(/\bCtrl\+/g, '⌘').replace(/\bAlt\+/g, '⌥').replace(/\bShift\+/g, '⇧');
}

let keymap: Record<ShortcutId, string> = { ...SHORTCUT_DEFAULTS };
const listeners = new Set<() => void>();
let loaded = false;

/** The defaults with the user's changes (only known actions with a usable combo count). */
export function keymapFrom(config: Pick<WarpConfig, 'shortcuts'> | null | undefined): Record<ShortcutId, string> {
  const out = { ...SHORTCUT_DEFAULTS };
  for (const [id, combo] of Object.entries(config?.shortcuts ?? {})) {
    if (id in out && typeof combo === 'string' && combo) out[id as ShortcutId] = combo;
  }
  return out;
}

export function setKeymap(next: Record<ShortcutId, string>): void {
  if (SHORTCUT_IDS.every((id) => next[id] === keymap[id])) return;
  keymap = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    window.warpApi
      ?.getConfig?.()
      .then((c: WarpConfig) => c && setKeymap(keymapFrom(c)))
      .catch(() => {});
  }
  return () => listeners.delete(listener);
}

/** The shortcuts in effect, updated as soon as Settings changes them. */
export function useShortcuts(): Record<ShortcutId, string> {
  return useSyncExternalStore(subscribe, () => keymap);
}
