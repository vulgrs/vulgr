import { useSyncExternalStore } from 'react';
import type { CursorStyleType, WarpConfig } from './types/warp.js';

/**
 * The terminal look chosen in Settings, shared by every open pane. Settings
 * pushes changes here as they are made, so open terminals follow at once.
 */
export interface TerminalPrefs {
  fontSize: number;
  cursorStyle: CursorStyleType;
}

let prefs: TerminalPrefs = { fontSize: 13, cursorStyle: 'bar' };
const listeners = new Set<() => void>();
let loaded = false;

export function setTerminalPrefs(next: Partial<TerminalPrefs>): void {
  const merged = { ...prefs, ...next };
  if (merged.fontSize === prefs.fontSize && merged.cursorStyle === prefs.cursorStyle) return;
  prefs = merged;
  listeners.forEach((l) => l());
}

export function terminalPrefsFrom(config: Pick<WarpConfig, 'fontSize' | 'cursorStyle'>): TerminalPrefs {
  return { fontSize: config.fontSize, cursorStyle: config.cursorStyle };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Read the saved settings the first time a terminal asks.
  if (!loaded) {
    loaded = true;
    window.warpApi
      ?.getConfig?.()
      .then((c: WarpConfig) => c && setTerminalPrefs(terminalPrefsFrom(c)))
      .catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function useTerminalPrefs(): TerminalPrefs {
  return useSyncExternalStore(subscribe, () => prefs);
}
