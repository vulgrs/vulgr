import type { WorkEntry } from '../types/warp.js';

/** Commands that look around rather than do work; they never name a tab. */
const TRIVIAL = new Set(['cd', 'ls', 'll', 'la', 'dir', 'clear', 'cls', 'pwd', 'exit', 'history', 'whoami', 'echo', 'cat', 'type']);
const AGENTS = new Set(['claude', 'codex', 'agy', 'gemini']);
const MAX_TITLE = 40;

const clip = (text: string, max = MAX_TITLE) => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
};

/**
 * What a submitted command contributes to its tab's title, or null when it is not work.
 * `claude '<request>'` yields the request itself; other commands keep the program and
 * its first argument ("npm test", "git commit").
 */
export function describeCommand(command: string): WorkEntry | null {
  const cmd = command.trim();
  if (!cmd) return null;
  const words = cmd.split(/\s+/);
  const bin = words[0].replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
  if (TRIVIAL.has(bin)) return null;

  if (AGENTS.has(bin)) {
    const quoted = cmd.match(/(['"])((?:(?!\1)[\s\S]|\1\1)+)\1\s*$/);
    if (quoted) return { text: quoted[2].replace(/''/g, "'").replace(/""/g, '"'), prompt: true };
  }

  const sub = words.slice(1).find((w) => !w.startsWith('-'));
  return { text: sub ? `${words[0]} ${sub}` : words[0], prompt: false };
}

/** Tab title summarizing its work: the latest AI request, else the last few distinct commands. */
export function titleFromWork(log: WorkEntry[]): string {
  const lastPrompt = [...log].reverse().find((e) => e.prompt);
  if (lastPrompt) {
    const text = clip(lastPrompt.text);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const recent: string[] = [];
  for (const entry of [...log].reverse()) {
    if (!recent.includes(entry.text)) recent.unshift(entry.text);
    if (recent.length === 3) break;
  }
  return clip(recent.join(' · '));
}
