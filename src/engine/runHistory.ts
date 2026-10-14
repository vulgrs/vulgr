import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type RunKind = 'duo' | 'swarm' | 'orchestra';
export type RunOutcome = 'success' | 'failed' | 'stopped';

/** A finished Duo Loop, Agent Swarm or Orchestrator run, as the app saved it. */
export interface RunRecord {
  id: string;
  kind: RunKind;
  goal: string;
  /** Project folder the run worked in. */
  cwd: string;
  startedAt: number;
  endedAt: number;
  outcome: RunOutcome;
  /** One line on how it ended. */
  summary?: string;
  /** Agents that took part, e.g. ['claude', 'codex']. */
  agents?: string[];
  /** Step log shown under the map. */
  log?: { at?: number; who?: string; text: string }[];
  /** The map as drawn at the end, plus every change of state, for replay. */
  map?: unknown;
  /** Tokens used: as the CLIs reported them when `tokensExact`, otherwise a rough count of what the agents wrote. */
  tokens?: number;
  tokensExact?: boolean;
  /** USD reported by the CLIs (Claude Code); a lower bound when some agents report none. */
  costUsd?: number;
}

/** What the list shows: a record without its log and map. */
export type RunSummary = Omit<RunRecord, 'log' | 'map'>;

const KINDS: RunKind[] = ['duo', 'swarm', 'orchestra'];
const OUTCOMES: RunOutcome[] = ['success', 'failed', 'stopped'];
const MAX_LOG = 300;

/** Ids become file names, so only plain characters. */
const safeId = (id: string) => /^[\w-]{1,80}$/.test(id);

/**
 * Finished runs, one JSON file each, so the history survives restarts and a
 * damaged file only loses that one run. The oldest runs go past `limit`.
 */
export class RunHistoryStore {
  constructor(private readonly dir: string, private readonly limit = 200) {}

  private file(id: string) {
    return join(this.dir, `${id}.json`);
  }

  private readAll(): RunRecord[] {
    if (!existsSync(this.dir)) return [];
    const out: RunRecord[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(readFileSync(join(this.dir, name), 'utf-8')));
      } catch {
        // A damaged file is skipped, not fatal.
      }
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Newest first; only the given project's runs when `cwd` is set. */
  list(cwd?: string): RunSummary[] {
    return this.readAll()
      .filter((r) => !cwd || r.cwd === cwd)
      .map(({ log: _log, map: _map, ...summary }) => summary);
  }

  get(id: string): RunRecord | null {
    if (!safeId(id) || !existsSync(this.file(id))) return null;
    try {
      return JSON.parse(readFileSync(this.file(id), 'utf-8'));
    } catch {
      return null;
    }
  }

  /** Saves (or replaces) a run; returns the stored record, or null when it is not a valid run. */
  save(input: RunRecord): RunRecord | null {
    if (!input || !safeId(String(input.id)) || !KINDS.includes(input.kind) || !OUTCOMES.includes(input.outcome)) return null;
    if (typeof input.goal !== 'string' || !Number.isFinite(input.startedAt) || !Number.isFinite(input.endedAt)) return null;
    const record: RunRecord = {
      ...input,
      goal: input.goal.slice(0, 2000),
      log: Array.isArray(input.log) ? input.log.slice(-MAX_LOG) : undefined,
    };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(record.id), JSON.stringify(record), 'utf-8');
    for (const old of this.readAll().slice(this.limit)) this.remove(old.id);
    return record;
  }

  remove(id: string): boolean {
    if (!safeId(id) || !existsSync(this.file(id))) return false;
    unlinkSync(this.file(id));
    return true;
  }

  /** Deletes every run, or only one project's. Returns how many went. */
  clear(cwd?: string): number {
    let n = 0;
    for (const r of this.readAll()) if (!cwd || r.cwd === cwd) n += this.remove(r.id) ? 1 : 0;
    return n;
  }
}
