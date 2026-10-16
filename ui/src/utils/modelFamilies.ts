/**
 * CLI model catalogs list every effort variant as its own model
 * (`gpt-5.3-codex-high`, `claude-opus-4-7-thinking-medium`, …). The chat shows
 * one entry per model instead and picks the effort separately, like zeron.
 */

export type ChatEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_ORDER: ChatEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const EFFORT_LABEL: Record<ChatEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
};

export interface RawModel {
  id: string;
  label: string;
  thinking?: boolean;
  fast?: boolean;
}

export interface ModelFamily {
  /** The id without effort / thinking suffixes. */
  id: string;
  label: string;
  /** The catalog id with no effort suffix, when the catalog has one. */
  baseId?: string;
  /** Catalog id per effort, for CLIs that encode effort in the model id. */
  variants: Partial<Record<ChatEffort, string>>;
  thinking?: boolean;
  fast?: boolean;
}

const VARIANT_RE = /^(.+?)(-thinking)?-(minimal|none|low|medium|high|xhigh|max)$/;

function splitVariant(id: string): { family: string; effort?: ChatEffort } {
  const m = id.match(VARIANT_RE);
  if (m) {
    const raw = m[3];
    const effort: ChatEffort = raw === 'minimal' || raw === 'none' ? 'low' : (raw as ChatEffort);
    return { family: m[1], effort };
  }
  const t = id.match(/^(.+)-thinking$/);
  if (t) return { family: t[1] };
  return { family: id };
}

/** "Claude Opus 5.5 1M High 🧠" → "Claude Opus 5.5 1M". */
function cleanLabel(label: string): string {
  return label
    .replace(/[🧠⚡]/gu, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(max|x?high|medium|low|minimal|thinking)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function groupModelFamilies(models: RawModel[]): ModelFamily[] {
  const byId = new Map<string, ModelFamily>();
  const order: string[] = [];
  for (const m of models) {
    if (m.id === 'default') continue;
    const { family, effort } = splitVariant(m.id);
    let entry = byId.get(family);
    if (!entry) {
      entry = { id: family, label: cleanLabel(m.label) || family, variants: {} };
      byId.set(family, entry);
      order.push(family);
    }
    if (effort) {
      if (!entry.variants[effort]) entry.variants[effort] = m.id;
    } else {
      entry.baseId = m.id;
      entry.label = cleanLabel(m.label) || entry.label;
    }
    entry.thinking = entry.thinking || m.thinking;
    entry.fast = entry.fast || m.fast;
  }
  return order.map((id) => byId.get(id)!);
}

/** CLIs that take effort as a flag rather than in the model id. */
const FLAG_EFFORTS: Record<string, ChatEffort[]> = {
  claude: EFFORT_ORDER,
  codex: ['low', 'medium', 'high', 'xhigh'],
};

/** Effort levels the user can pick for this agent + model (empty = none). */
export function effortsFor(agent: string, family?: ModelFamily): ChatEffort[] {
  if (FLAG_EFFORTS[agent]) return FLAG_EFFORTS[agent];
  if (!family) return [];
  return EFFORT_ORDER.filter((e) => family.variants[e]);
}

function nearestEffort(wanted: ChatEffort, allowed: ChatEffort[]): ChatEffort | undefined {
  if (allowed.length === 0) return undefined;
  if (allowed.includes(wanted)) return wanted;
  const idx = EFFORT_ORDER.indexOf(wanted);
  return [...allowed].sort(
    (a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - idx) - Math.abs(EFFORT_ORDER.indexOf(b) - idx)
  )[0];
}

/** The effort that will actually be used for this selection. */
export function effectiveEffort(agent: string, family: ModelFamily | undefined, wanted: ChatEffort) {
  return nearestEffort(wanted, effortsFor(agent, family));
}

/** Turns a model family + effort choice into the CLI's model id and effort flag. */
export function resolveModel(
  agent: string,
  family: ModelFamily | undefined,
  wanted: ChatEffort
): { model: string; effort?: ChatEffort } {
  const effort = effectiveEffort(agent, family, wanted);
  if (!family) return { model: 'default', effort: FLAG_EFFORTS[agent] ? effort : undefined };
  if (FLAG_EFFORTS[agent]) return { model: family.baseId ?? family.id, effort };
  const variant = effort ? family.variants[effort] : undefined;
  return { model: variant ?? family.baseId ?? family.id };
}
