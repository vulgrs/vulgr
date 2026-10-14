import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdapterFactory } from '../adapters/factory.js';
import type { ICliAdapter } from '../types/index.js';

const execFileAsync = promisify(execFile);

/** How much of the diff an agent sees; the file list always comes in full. */
const MAX_DIFF_CHARS = 14_000;
/** Agents tried in this order; the first one installed writes the message. */
const AGENT_ORDER = ['claude', 'codex', 'agy', 'gemini', 'opencode', 'cursor'];

const git = async (cwd: string, args: string[]) =>
  (await execFileAsync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 })).stdout;

/** What the agent needs to know about the change: file list, diff and the repo's own commit style. */
export interface CommitContext {
  stat: string;
  diff: string;
  recentSubjects: string[];
}

/** Everything uncommitted (staged, unstaged and new files), as `git add -A` would commit it. */
export async function readCommitContext(cwd: string): Promise<CommitContext> {
  const [tracked, untracked, log] = await Promise.all([
    git(cwd, ['diff', 'HEAD', '--stat=120']).catch(() => ''),
    git(cwd, ['ls-files', '--others', '--exclude-standard']).catch(() => ''),
    git(cwd, ['log', '-12', '--format=%s']).catch(() => ''),
  ]);
  const newFiles = untracked.split('\n').filter(Boolean);
  // git diff leaves new files out; show the start of a few so the agent knows what they are.
  const newParts = newFiles.slice(0, 8).map((f) => {
    try {
      const text = readFileSync(join(cwd, f), 'utf-8');
      if (text.includes('\u0000')) return '';
      return `--- new file: ${f}\n${text.slice(0, 1500)}${text.length > 1500 ? '\n[...]' : ''}`;
    } catch {
      return '';
    }
  });
  const trackedDiff = await git(cwd, ['diff', 'HEAD', '--no-color', '--no-ext-diff']).catch(() => '');
  const diff = [trackedDiff.trim(), ...newParts.filter(Boolean)].filter(Boolean).join('\n');
  const stat = [tracked.trim(), ...newFiles.map((f) => ` ${f} (new file)`)].filter(Boolean).join('\n');
  return { stat, diff, recentSubjects: log.split('\n').filter(Boolean) };
}

export function buildCommitPrompt(ctx: CommitContext, extraNote = ''): string {
  const diff = ctx.diff.length > MAX_DIFF_CHARS ? `${ctx.diff.slice(0, MAX_DIFF_CHARS)}\n[... diff cut here ...]` : ctx.diff;
  return [
    'Write a git commit message for the uncommitted changes below.',
    '',
    'Rules:',
    "- Match this repository's style, as in its recent commits below (e.g. a conventional-commit prefix like feat:/fix: if they use one, and the same language).",
    '- First line: what the change does, imperative mood, at most 72 characters.',
    '- If the change is not trivial: a blank line, then a short body (lines up to 72 characters) saying what changed and why. Plain sentences, no headings.',
    '- Do not add Co-Authored-By, "Generated with" or any other trailer, quotes or code fences.',
    '- Reply with the commit message only, nothing before or after it. Do not run commands or change files.',
    extraNote ? `- Also: ${extraNote}` : '',
    '',
    ctx.recentSubjects.length ? `Recent commits:\n${ctx.recentSubjects.map((s) => `- ${s}`).join('\n')}` : 'This repository has no commits yet.',
    '',
    `Changed files:\n${ctx.stat || '(none)'}`,
    '',
    `Diff:\n${diff || '(only new files; see the list above)'}`,
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
}

/**
 * The agent's reply turned into a clean commit message: no code fences, no
 * "Here is..." lead-in, no trailers, at most one blank line in a row.
 */
export function cleanCommitMessage(reply: string): string {
  let text = reply.replace(/\r\n/g, '\n').trim();
  const fenced = text.match(/```[\w-]*\n([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  const lines = text.split('\n');
  while (lines.length && /^(here('s| is)|commit message|suggested)\b.*:?\s*$/i.test(lines[0].trim())) lines.shift();
  const kept = lines.filter((l) => !/^(co-authored-by|signed-off-by|generated with|🤖)/i.test(l.trim()));
  let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // A subject wrapped in quotes or backticks.
  out = out.replace(/^["'`](.+?)["'`](\n|$)/, '$1$2');
  return out;
}

export interface SuggestResult {
  message?: string;
  agent?: string;
  error?: 'no-changes' | 'no-agent' | 'failed';
  detail?: string;
}

/** Asks the first installed agent (read-only) to write a commit message for the uncommitted changes in `cwd`. */
export async function suggestCommitMessage(cwd: string, options: { note?: string; signal?: AbortSignal } = {}): Promise<SuggestResult> {
  const ctx = await readCommitContext(cwd);
  if (!ctx.stat.trim()) return { error: 'no-changes' };

  let adapter: ICliAdapter | undefined;
  for (const name of AGENT_ORDER) {
    try {
      const candidate = AdapterFactory.getAdapter(name);
      if (await candidate.isAvailable()) {
        adapter = candidate;
        break;
      }
    } catch {
      // Not registered.
    }
  }
  if (!adapter) return { error: 'no-agent' };

  const res = await adapter.execute(buildCommitPrompt(ctx, options.note), {
    cwd,
    allowEdits: false,
    timeoutMs: 120_000,
    signal: options.signal,
    usageTag: 'commit',
    // A small, fast model is plenty for a commit message.
    extraArgs: adapter.name === 'claude' ? ['--model', 'haiku'] : undefined,
  });
  const message = cleanCommitMessage(res.stdout || '');
  if (!message) return { error: 'failed', agent: adapter.name, detail: (res.stderr || '').trim().split('\n').slice(-3).join('\n') };
  return { message, agent: adapter.name };
}
