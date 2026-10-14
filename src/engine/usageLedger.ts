import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentUsage } from '../types/index.js';
import { usageTokens } from '../adapters/outputParsers.js';

/** One agent call's usage, as stored. */
export interface UsageEntry {
  at: number;
  agent: string;
  cwd: string;
  tag?: string;
  usage: AgentUsage;
}

export interface UsageTotals {
  calls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  /** USD over the calls that reported a cost. */
  costUsd: number;
  /** Calls without a reported cost (e.g. Codex), so the sum is a lower bound. */
  unpricedCalls: number;
}

export interface UsageSummary {
  total: UsageTotals;
  byAgent: Record<string, UsageTotals>;
  byProject: Record<string, UsageTotals>;
  /** Local calendar day (YYYY-MM-DD) to totals, oldest first. */
  byDay: { day: string; totals: UsageTotals }[];
}

const empty = (): UsageTotals => ({ calls: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, costUsd: 0, unpricedCalls: 0 });

function add(t: UsageTotals, u: AgentUsage): void {
  t.calls++;
  t.tokens += usageTokens(u);
  t.inputTokens += u.inputTokens;
  t.outputTokens += u.outputTokens;
  t.cacheTokens += (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0);
  if (typeof u.costUsd === 'number') t.costUsd += u.costUsd;
  else t.unpricedCalls++;
}

const dayOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Every agent call's real usage, one JSON line each in `file`. Entries older
 * than `keepDays` are dropped the first time the ledger is read.
 */
export class UsageLedger {
  private pruned = false;

  constructor(private readonly file: string, private readonly keepDays = 180) {}

  add(entry: UsageEntry): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch (err) {
      console.error('[UsageLedger] Could not save usage:', err);
    }
  }

  entries(): UsageEntry[] {
    if (!existsSync(this.file)) return [];
    const out: UsageEntry[] = [];
    for (const line of readFileSync(this.file, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (Number.isFinite(e.at) && e.usage) out.push(e);
      } catch {
        // A half-written line is skipped.
      }
    }
    if (!this.pruned) {
      this.pruned = true;
      const cutoff = Date.now() - this.keepDays * 86_400_000;
      const kept = out.filter((e) => e.at >= cutoff);
      if (kept.length < out.length) {
        writeFileSync(this.file, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''), 'utf-8');
        return kept;
      }
    }
    return out;
  }

  /** Totals since `since` (ms), for one project when `cwd` is set. */
  summary(since = 0, cwd?: string): UsageSummary {
    const result: UsageSummary = { total: empty(), byAgent: {}, byProject: {}, byDay: [] };
    const days = new Map<string, UsageTotals>();
    for (const e of this.entries()) {
      if (e.at < since || (cwd && e.cwd !== cwd)) continue;
      add(result.total, e.usage);
      add((result.byAgent[e.agent] ??= empty()), e.usage);
      add((result.byProject[e.cwd] ??= empty()), e.usage);
      const day = dayOf(e.at);
      if (!days.has(day)) days.set(day, empty());
      add(days.get(day)!, e.usage);
    }
    result.byDay = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, totals]) => ({ day, totals }));
    return result;
  }

  clear(): void {
    if (existsSync(this.file)) writeFileSync(this.file, '', 'utf-8');
  }
}
