import type { AgentUsage } from '../types/index.js';

export interface UsageEvent {
  agent: string;
  cwd: string;
  tag?: string;
  usage: AgentUsage;
  at: number;
}

const listeners = new Set<(event: UsageEvent) => void>();

/** Called after every agent call whose CLI reported its usage; returns an unsubscribe. */
export function onAgentUsage(listener: (event: UsageEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportAgentUsage(event: UsageEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A broken listener must not fail the agent call.
    }
  }
}
