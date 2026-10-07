import { useCallback, useEffect, useSyncExternalStore } from 'react';

export interface AgentStatus {
  id: string;
  name: string;
  vendor: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  command: string | null;
  missing: string | null;
  login: string;
  docs: string;
}

export type InstallPhase = 'idle' | 'installing' | 'done' | 'failed';

interface State {
  agents: AgentStatus[];
  checking: boolean;
  phase: Record<string, InstallPhase>;
  log: Record<string, string>;
}

/*
 * Module-level store: an install keeps running in the main process when the
 * dialog closes, so its progress and output must outlive the component.
 */
let state: State = { agents: [], checking: false, phase: {}, log: {} };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Output is kept short enough to render cheaply; installers print a lot.
const MAX_LOG = 20_000;
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\r(?!\n)/g, '');

let outputBound = false;
function bindOutput() {
  if (outputBound || !window.warpApi?.onAgentInstallOutput) return;
  outputBound = true;
  window.warpApi.onAgentInstallOutput(({ id, chunk }: { id: string; chunk: string }) => {
    const next = ((state.log[id] || '') + stripAnsi(chunk)).slice(-MAX_LOG);
    set({ log: { ...state.log, [id]: next } });
  });
}

async function refresh(): Promise<AgentStatus[]> {
  if (!window.warpApi?.getAgentStatus) return state.agents;
  set({ checking: true });
  try {
    const agents: AgentStatus[] = await window.warpApi.getAgentStatus();
    set({ agents, checking: false });
    return agents;
  } catch {
    set({ checking: false });
    return state.agents;
  }
}

export type InstallResult = 'installed' | 'not-on-path' | 'failed';

async function install(id: string): Promise<InstallResult> {
  bindOutput();
  set({ phase: { ...state.phase, [id]: 'installing' }, log: { ...state.log, [id]: '' } });
  const res = await window.warpApi.installAgent(id);
  if (res.error) set({ log: { ...state.log, [id]: (state.log[id] || '') + `\n${res.error}\n` } });
  const agents = await refresh();
  const found = agents.find((a) => a.id === id)?.installed;
  set({ phase: { ...state.phase, [id]: res.ok ? 'done' : 'failed' } });
  return res.ok ? (found ? 'installed' : 'not-on-path') : 'failed';
}

/** `check: false` reads the shared state without re-detecting the installed CLIs. */
export function useAgentSetup({ check = true }: { check?: boolean } = {}) {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    bindOutput();
    if (check) void refresh();
  }, [check]);
  const cancel = useCallback((id: string) => window.warpApi?.cancelAgentInstall?.(id), []);
  return { ...snapshot, refresh, install, cancel };
}
