import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export type TemplateKind = 'duo' | 'swarm' | 'orchestra';

/** A saved goal and team setup that starts a Duo Loop, Agent Swarm or Orchestrator run in one click. */
export interface RunTemplate {
  id: string;
  kind: TemplateKind;
  name: string;
  goal: string;
  /** The flow's own choices (agents, test command, rounds...), as the dialog stores them. */
  settings: Record<string, string | number | boolean | string[]>;
  createdAt: number;
  /** Last time it was used, for ordering. */
  usedAt?: number;
}

const KINDS: TemplateKind[] = ['duo', 'swarm', 'orchestra'];

/** Only plain values survive, so a template can't carry anything unexpected into a dialog. */
function cleanSettings(input: unknown): RunTemplate['settings'] {
  const out: RunTemplate['settings'] = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input).slice(0, 30)) {
    if (!/^[\w-]{1,40}$/.test(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 2000);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) out[key] = value.slice(0, 20).map((v) => v.slice(0, 200));
  }
  return out;
}

/** Templates kept in one JSON file, most recently used first. */
export class TemplateStore {
  constructor(private readonly file: string) {}

  list(kind?: TemplateKind): RunTemplate[] {
    return this.read()
      .filter((t) => !kind || t.kind === kind)
      .sort((a, b) => (b.usedAt ?? b.createdAt) - (a.usedAt ?? a.createdAt));
  }

  /** Adds a template, or replaces the one with the same id; null when it is not valid. */
  save(input: Partial<RunTemplate>): RunTemplate | null {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
    if (!name || !KINDS.includes(input.kind as TemplateKind)) return null;
    const all = this.read();
    const existing = all.find((t) => t.id === input.id);
    const template: RunTemplate = {
      id: existing?.id ?? randomBytes(6).toString('hex'),
      kind: input.kind as TemplateKind,
      name,
      goal: typeof input.goal === 'string' ? input.goal.slice(0, 4000) : '',
      settings: cleanSettings(input.settings),
      createdAt: existing?.createdAt ?? Date.now(),
      usedAt: existing?.usedAt,
    };
    this.write([...all.filter((t) => t.id !== template.id), template]);
    return template;
  }

  /** Marks a template as just used, so it moves to the front. */
  touch(id: string): void {
    const all = this.read();
    const t = all.find((x) => x.id === id);
    if (!t) return;
    t.usedAt = Date.now();
    this.write(all);
  }

  remove(id: string): boolean {
    const all = this.read();
    const kept = all.filter((t) => t.id !== id);
    if (kept.length === all.length) return false;
    this.write(kept);
    return true;
  }

  private read(): RunTemplate[] {
    if (!existsSync(this.file)) return [];
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private write(all: RunTemplate[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(all, null, 2), 'utf-8');
  }
}
