import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ChatAgentId } from './teamChat.js';

const execFileAsync = promisify(execFile);

export interface DiscoveredModel {
  id: string;
  label: string;
  thinking?: boolean;
  fast?: boolean;
  source?: 'cli' | 'builtin';
}

export type AgentModelCatalog = Record<ChatAgentId, DiscoveredModel[]>;

/** Up-to-date 2026 fallback & curated models per CLI agent. */
export const DEFAULT_2026_MODELS: AgentModelCatalog = {
  // Claude Code takes model aliases; effort is a separate `--effort` flag.
  claude: [
    { id: 'default', label: 'Varsayılan (CLI Default)', source: 'builtin' },
    { id: 'fable', label: 'Claude Fable 5.1', thinking: true, source: 'builtin' },
    { id: 'opus', label: 'Claude Opus 5.5', thinking: true, source: 'builtin' },
    { id: 'sonnet', label: 'Claude Sonnet 5.5', source: 'builtin' },
    { id: 'haiku', label: 'Claude Haiku 5.5', fast: true, source: 'builtin' },
  ],
  agy: [
    { id: 'default', label: 'Varsayılan (AGY Default)', source: 'builtin' },
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon High (En Yeni 🧠)', thinking: true, source: 'builtin' },
    { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon Medium', thinking: true, source: 'builtin' },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash High (Kota Dostu ⚡)', fast: true, source: 'builtin' },
    { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash Medium ⚡', fast: true, source: 'builtin' },
    { id: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash High ⚡', fast: true, source: 'builtin' },
    { id: 'gemini-3.6-flash-high', label: 'Gemini 3.6 Flash High', fast: true, source: 'builtin' },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (Derin Mimari 🧠)', thinking: true, source: 'builtin' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', source: 'builtin' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash ⚡', fast: true, source: 'builtin' },
  ],
  codex: [
    { id: 'default', label: 'Varsayılan (Codex Default)', source: 'builtin' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (En Yeni 🧠)', thinking: true, source: 'builtin' },
    { id: 'gpt-6.1-sol-fast', label: 'GPT-6.1 Sol Fast ⚡', fast: true, source: 'builtin' },
    { id: 'gpt-6-sol', label: 'GPT-6 Sol 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-6-astra-fast', label: 'GPT-6 Astra Fast ⚡', fast: true, source: 'builtin' },
    { id: 'gpt-5.6-terra-high', label: 'GPT-5.6 Terra 1M High 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-5.6-sol-high', label: 'GPT-5.6 Sol 1M High 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-5.6-luna-high', label: 'GPT-5.6 Luna 1M High', source: 'builtin' },
    { id: 'gpt-5.5-fast', label: 'GPT-5.5 Fast ⚡', fast: true, source: 'builtin' },
    { id: 'gpt-5.4-high', label: 'GPT-5.4 1M High', source: 'builtin' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini (Kota Dostu ⚡)', fast: true, source: 'builtin' },
    { id: 'gpt-5.3-codex-high', label: 'Codex 5.3 High 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-5.3-codex-fast', label: 'Codex 5.3 Fast ⚡', fast: true, source: 'builtin' },
  ],
  cursor: [
    { id: 'default', label: 'Auto (Cursor Varsayılan)', source: 'builtin' },
    { id: 'claude-fable-5-1-thinking-max', label: 'Claude Fable 5.1 1M Max Thinking 🧠', thinking: true, source: 'builtin' },
    { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 1M High 🧠', thinking: true, source: 'builtin' },
    { id: 'claude-opus-5-thinking-high', label: 'Claude Opus 5 1M Thinking 🧠', thinking: true, source: 'builtin' },
    { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 High', source: 'builtin' },
    { id: 'claude-sonnet-5-thinking-high', label: 'Claude Sonnet 5 1M Thinking 🧠', thinking: true, source: 'builtin' },
    { id: 'claude-haiku-5-5-thinking-medium', label: 'Claude Haiku 5.5 Thinking ⚡', thinking: true, fast: true, source: 'builtin' },
    { id: 'gpt-5.6-terra-high', label: 'GPT-5.6 Terra 1M High 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-5.6-sol-high', label: 'GPT-5.6 Sol 1M High 🧠', thinking: true, source: 'builtin' },
    { id: 'gpt-5.3-codex-high', label: 'Codex 5.3 High', source: 'builtin' },
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon High 🧠', thinking: true, source: 'builtin' },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash High ⚡', fast: true, source: 'builtin' },
    { id: 'composer-2.5', label: 'Cursor Composer 2.5', source: 'builtin' },
    { id: 'grok-4.7-high', label: 'Grok 4.7 High', source: 'builtin' },
  ],
  opencode: [
    { id: 'default', label: 'Varsayılan (OpenCode Default)', source: 'builtin' },
    { id: 'openai/gpt-6.1-sol', label: 'OpenAI GPT-6.1 Sol 🧠', thinking: true, source: 'builtin' },
    { id: 'openai/gpt-6.1-sol-fast', label: 'OpenAI GPT-6.1 Sol Fast ⚡', fast: true, source: 'builtin' },
    { id: 'openai/gpt-6-astra', label: 'OpenAI GPT-6 Astra 🧠', thinking: true, source: 'builtin' },
    { id: 'openai/gpt-6-luna', label: 'OpenAI GPT-6 Luna', source: 'builtin' },
    { id: 'openai/gpt-5.6-terra', label: 'OpenAI GPT-5.6 Terra', source: 'builtin' },
    { id: 'openai/gpt-5.4-mini', label: 'OpenAI GPT-5.4 Mini ⚡', fast: true, source: 'builtin' },
    { id: 'openai/gpt-5.3-codex-spark', label: 'OpenAI GPT-5.3 Codex Spark ⚡', fast: true, source: 'builtin' },
    { id: 'opencode/deepseek-v4.1-flash-free', label: 'DeepSeek v4.1 Flash (Ücretsiz ⚡)', fast: true, source: 'builtin' },
    { id: 'opencode/glm-5.3-flash-free', label: 'GLM 5.3 Flash (Ücretsiz ⚡)', fast: true, source: 'builtin' },
    { id: 'opencode/nemotron-3.5-super-vl-free', label: 'Nemotron 3.5 Super VL (Ücretsiz)', fast: true, source: 'builtin' },
  ],
  gemini: [
    { id: 'default', label: 'Varsayılan (Gemini CLI Default)', source: 'builtin' },
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon High (En Yeni 🧠)', thinking: true, source: 'builtin' },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash High (Kota Dostu ⚡)', fast: true, source: 'builtin' },
    { id: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash High ⚡', fast: true, source: 'builtin' },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro 🧠', thinking: true, source: 'builtin' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', source: 'builtin' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash ⚡', fast: true, source: 'builtin' },
  ],
};

function buildDiscoveryEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extra = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.opencode', 'bin'),
    path.join(home, 'AppData', 'Local', 'agy', 'bin'),
    path.join(home, 'AppData', 'Local', 'cursor-agent'),
    path.join(home, 'AppData', 'Roaming', 'npm'),
  ];
  const env = { ...process.env };
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const merged = [...extra, env[key] || ''].filter(Boolean).join(path.delimiter);
  env[key] = merged;
  env.PATH = merged;
  return env;
}

function dedupeModels(models: DiscoveredModel[]): DiscoveredModel[] {
  const seen = new Set<string>();
  const out: DiscoveredModel[] = [];
  for (const m of models) {
    if (!m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

let cachedCatalog: AgentModelCatalog | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Dynamically queries installed CLI tools (`cursor-agent --list-models`, `opencode models`)
 * and merges discovered live models with the 2026 baseline catalog.
 */
export async function discoverAgentModels(forceRefresh = false): Promise<AgentModelCatalog> {
  if (!forceRefresh && cachedCatalog && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  const env = buildDiscoveryEnv();
  const result: AgentModelCatalog = {
    claude: [...DEFAULT_2026_MODELS.claude],
    agy: [...DEFAULT_2026_MODELS.agy],
    codex: [...DEFAULT_2026_MODELS.codex],
    cursor: [{ id: 'default', label: 'Auto (Cursor Varsayılan)', source: 'builtin' }],
    opencode: [{ id: 'default', label: 'Varsayılan (OpenCode Default)', source: 'builtin' }],
    gemini: [...DEFAULT_2026_MODELS.gemini],
  };

  // 1. Query `cursor-agent --list-models`
  try {
    const { stdout } = await execFileAsync('cursor-agent', ['--list-models'], {
      env,
      timeout: 4500,
      windowsHide: true,
    });
    const lines = stdout.split(/\r?\n/);
    const cursorDiscovered: DiscoveredModel[] = [];
    for (const line of lines) {
      const m = line.trim().match(/^([a-zA-Z0-9._:/-]+)\s+-\s+(.+)$/);
      if (!m) continue;
      const id = m[1].trim();
      const rawLabel = m[2].trim().replace(/\s*\(NO ZDR\)\s*/gi, '');
      if (id === 'auto') continue;
      const isThinking = /thinking|fable|opus-5|argon/i.test(id) || /thinking/i.test(rawLabel);
      const isFast = /fast|flash|mini|nano|haiku/i.test(id);
      const badge = isThinking ? ' 🧠' : isFast ? ' ⚡' : '';
      const entry: DiscoveredModel = {
        id,
        label: `${rawLabel}${badge}`,
        thinking: isThinking,
        fast: isFast,
        source: 'cli',
      };
      // Cursor's ids (e.g. `claude-opus-4-7-thinking-high`) are its own; the
      // native CLIs reject them, so they stay in Cursor's list only.
      cursorDiscovered.push(entry);
    }
    if (cursorDiscovered.length > 0) {
      result.cursor.push(...cursorDiscovered);
    } else {
      result.cursor.push(...DEFAULT_2026_MODELS.cursor.slice(1));
    }
  } catch {
    result.cursor.push(...DEFAULT_2026_MODELS.cursor.slice(1));
  }

  // 2. Query `opencode models`
  try {
    const { stdout } = await execFileAsync('opencode', ['models'], {
      env,
      timeout: 4500,
      windowsHide: true,
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._:-]+)+$/.test(l));

    if (lines.length > 0) {
      // Put high-priority / newest models first (gpt-6*, gpt-5*, deepseek*, glm*, ollama*)
      const sorted = [...lines].sort((a, b) => {
        const score = (s: string) =>
          s.includes('gpt-6') ? 0 : s.includes('gpt-5') ? 1 : s.includes('deepseek') ? 2 : s.includes('ollama') ? 3 : 4;
        return score(a) - score(b);
      });
      for (const id of sorted) {
        const isFast = /fast|flash|mini|free|spark|lightning/i.test(id);
        const isThinking = /gpt-6|sol|terra|luna|astra|ultra|deepseek/i.test(id);
        const badge = isThinking ? ' 🧠' : isFast ? ' ⚡' : '';
        result.opencode.push({
          id,
          label: `${id}${badge}`,
          thinking: isThinking,
          fast: isFast,
          source: 'cli',
        });
      }
    } else {
      result.opencode.push(...DEFAULT_2026_MODELS.opencode.slice(1));
    }
  } catch {
    result.opencode.push(...DEFAULT_2026_MODELS.opencode.slice(1));
  }

  cachedCatalog = {
    claude: dedupeModels(result.claude),
    agy: dedupeModels(result.agy),
    codex: dedupeModels(result.codex),
    cursor: dedupeModels(result.cursor),
    opencode: dedupeModels(result.opencode),
    gemini: dedupeModels(result.gemini),
  };
  lastFetchedAt = Date.now();
  return cachedCatalog;
}
