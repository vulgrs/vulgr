/**
 * CLI model catalogs list every effort variant as its own model
 * (`gpt-5.3-codex-high-fast`, `claude-opus-4-8-thinking-medium`, …). The chat
 * shows one entry per model instead and picks effort, thinking and fast
 * separately, like zeron.
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

export interface ModelVariant {
  id: string;
  effort?: ChatEffort;
  thinking: boolean;
  fast: boolean;
}

export interface ModelFamily {
  /** The id without effort / thinking / fast suffixes. */
  id: string;
  label: string;
  variants: ModelVariant[];
  /** True when the catalog offers both thinking and non-thinking variants. */
  thinkingToggle?: boolean;
  /** True when the catalog offers both fast and normal variants. */
  fastToggle?: boolean;
  /** Every variant is a thinking one. */
  thinking?: boolean;
  /** Every variant is a fast one. */
  fast?: boolean;
}

export interface ModelFlags {
  thinking: boolean;
  fast: boolean;
}

type RawEffort = ChatEffort | 'none' | 'minimal';

// Cursor writes both `claude-opus-4-8-thinking-high` and `claude-4.6-opus-high-thinking`.
const VARIANT_RE =
  /^(.+?)(-thinking)?(?:-(none|minimal|low|medium|high|xhigh|extra-high|max))?(-thinking)?(-fast)?$/;

function splitVariant(id: string): { family: string; effort?: RawEffort; thinking: boolean; fast: boolean } {
  const m = id.match(VARIANT_RE);
  if (!m) return { family: id, thinking: false, fast: false };
  const raw = m[3] === 'extra-high' ? 'xhigh' : (m[3] as RawEffort | undefined);
  return { family: m[1], effort: raw, thinking: !!(m[2] || m[4]), fast: !!m[5] };
}

/** "Claude Opus 5 1M Extra High Thinking Fast (NO ZDR) 🧠" → "Claude Opus 5 1M". */
function cleanLabel(label: string): string {
  return label
    .replace(/[​-‍﻿]/g, '')
    .replace(/[🧠⚡]/gu, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(extra high|no thinking)\b/gi, '')
    .replace(/\b(max|x?high|medium|low|minimal|none|thinking|fast)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function groupModelFamilies(models: RawModel[]): ModelFamily[] {
  const byId = new Map<string, { label: string; raw: Array<ModelVariant & { rawEffort?: RawEffort }> }>();
  const order: string[] = [];
  for (const m of models) {
    if (m.id === 'default' || m.id === 'auto') continue;
    const v = splitVariant(m.id);
    let entry = byId.get(v.family);
    if (!entry) {
      entry = { label: cleanLabel(m.label) || v.family, raw: [] };
      byId.set(v.family, entry);
      order.push(v.family);
    }
    entry.raw.push({ id: m.id, rawEffort: v.effort, thinking: v.thinking, fast: v.fast });
  }

  return order.map((id) => {
    const { label, raw } = byId.get(id)!;
    const variants: ModelVariant[] = [];
    for (const r of raw) {
      const sameKind = raw.filter((o) => o.thinking === r.thinking && o.fast === r.fast);
      let effort: ChatEffort | undefined;
      if (r.rawEffort === 'none' || r.rawEffort === 'minimal') {
        // Only stands in for "low" when the model has no real low level.
        if (sameKind.some((o) => o.rawEffort === 'low')) continue;
        if (r.rawEffort === 'none' && sameKind.some((o) => o.rawEffort === 'minimal')) continue;
        effort = 'low';
      } else if (r.rawEffort) {
        effort = r.rawEffort;
      } else if (sameKind.some((o) => o.rawEffort) && !sameKind.some((o) => o.rawEffort === 'medium')) {
        // A bare id next to effort variants (`gpt-5.3-codex` beside `-high`) is the middle level.
        effort = 'medium';
      }
      variants.push({ id: r.id, effort, thinking: r.thinking, fast: r.fast });
    }
    const anyThinking = variants.some((v) => v.thinking);
    const allThinking = variants.every((v) => v.thinking);
    const anyFast = variants.some((v) => v.fast);
    const allFast = variants.every((v) => v.fast);
    return {
      id,
      label,
      variants,
      thinkingToggle: anyThinking && !allThinking,
      fastToggle: anyFast && !allFast,
      thinking: allThinking,
      fast: allFast,
    };
  });
}

/** CLIs that take effort as a flag rather than in the model id. */
const FLAG_EFFORTS: Record<string, ChatEffort[]> = {
  claude: EFFORT_ORDER,
  codex: ['low', 'medium', 'high', 'xhigh'],
};

/** Variants that match the thinking / fast switches, loosening them when nothing matches. */
function candidates(family: ModelFamily, flags: ModelFlags): ModelVariant[] {
  const wantThinking = family.thinkingToggle ? flags.thinking : family.thinking ?? false;
  const wantFast = family.fastToggle ? flags.fast : family.fast ?? false;
  const exact = family.variants.filter((v) => v.thinking === wantThinking && v.fast === wantFast);
  if (exact.length > 0) return exact;
  const byFast = family.variants.filter((v) => v.fast === wantFast);
  return byFast.length > 0 ? byFast : family.variants;
}

/** Effort levels the user can pick for this agent + model (empty = none). */
export function effortsFor(agent: string, family: ModelFamily | undefined, flags: ModelFlags): ChatEffort[] {
  if (FLAG_EFFORTS[agent]) return FLAG_EFFORTS[agent];
  if (!family) return [];
  const have = new Set(candidates(family, flags).map((v) => v.effort).filter(Boolean));
  return have.size > 1 ? EFFORT_ORDER.filter((e) => have.has(e)) : [];
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
export function effectiveEffort(
  agent: string,
  family: ModelFamily | undefined,
  wanted: ChatEffort,
  flags: ModelFlags
): ChatEffort | undefined {
  return nearestEffort(wanted, effortsFor(agent, family, flags));
}

/** Turns a model + effort + switches into the CLI's model id and effort flag. */
export function resolveModel(
  agent: string,
  family: ModelFamily | undefined,
  wanted: ChatEffort,
  flags: ModelFlags
): { model: string; effort?: ChatEffort } {
  const flagAgent = !!FLAG_EFFORTS[agent];
  const effort = effectiveEffort(agent, family, wanted, flags);
  if (!family) return { model: 'default', effort: flagAgent ? effort : undefined };
  if (flagAgent) {
    const base = family.variants.find((v) => !v.effort && !v.thinking && !v.fast);
    return { model: base?.id ?? family.id, effort };
  }
  const pool = candidates(family, flags);
  const pick =
    (effort && pool.find((v) => v.effort === effort)) ||
    pool.find((v) => v.effort === nearestEffort(wanted, pool.map((p) => p.effort).filter(Boolean) as ChatEffort[])) ||
    pool[0];
  return { model: pick.id };
}
