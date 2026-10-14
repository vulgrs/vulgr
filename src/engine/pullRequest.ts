import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { AdapterFactory } from '../adapters/factory.js';
import type { ICliAdapter } from '../types/index.js';
import { cleanCommitMessage } from './commitMessage.js';

const execFileAsync = promisify(execFile);
const git = async (cwd: string, args: string[]) =>
  (await execFileAsync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024, windowsHide: true })).stdout;

const MAX_DIFF_CHARS = 14_000;
const AGENT_ORDER = ['claude', 'codex', 'agy', 'gemini', 'opencode', 'cursor'];

/** owner/repo of a GitHub remote URL (https or ssh), or null for anything else. */
export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const m = url.trim().match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** GitHub's "open a pull request" page, with title and body filled in. */
export function compareUrl(owner: string, repo: string, base: string, head: string, title: string, body: string): string {
  const q = new URLSearchParams({ expand: '1', title, body });
  return `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?${q.toString()}`;
}

/** First line is the title, the rest the body (Markdown). */
export function splitPrReply(reply: string): { title: string; body: string } {
  const text = cleanCommitMessage(reply).replace(/^#+\s*/, '');
  const [first = '', ...rest] = text.split('\n');
  return { title: first.replace(/^title:\s*/i, '').trim().slice(0, 120), body: rest.join('\n').replace(/^\s*\n/, '').trim() };
}

export interface PrInfo {
  branch: string | null;
  base: string | null;
  github: { owner: string; repo: string } | null;
  /** Commits on the branch that the base doesn't have. */
  commits: number;
  ghReady: boolean;
}

/** The base the repository's remote points HEAD at, else main or master. */
async function detectBase(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).trim().replace(/^origin\//, '');
  } catch {
    for (const name of ['main', 'master']) {
      try {
        await git(cwd, ['rev-parse', '--verify', '--quiet', name]);
        return name;
      } catch {}
    }
    return null;
  }
}

/** Whether the GitHub CLI is installed and signed in. */
async function ghReady(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('gh', ['auth', 'status'], { cwd, windowsHide: true, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function pullRequestInfo(cwd: string): Promise<PrInfo> {
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim() || null;
  const base = await detectBase(cwd);
  const github = parseGitHubRemote(await git(cwd, ['remote', 'get-url', 'origin']).catch(() => ''));
  let commits = 0;
  if (branch && base && branch !== base) {
    commits = Number((await git(cwd, ['rev-list', '--count', `${base}..HEAD`]).catch(() => '0')).trim()) || 0;
  }
  return { branch: branch === 'HEAD' ? null : branch, base, github, commits, ghReady: await ghReady(cwd) };
}

export function buildPrPrompt(ctx: { base: string; log: string; stat: string; diff: string; template?: string }): string {
  const diff = ctx.diff.length > MAX_DIFF_CHARS ? `${ctx.diff.slice(0, MAX_DIFF_CHARS)}\n[... diff cut here ...]` : ctx.diff;
  return [
    `Write a GitHub pull request title and description for the changes on this branch (compared with ${ctx.base}).`,
    '',
    'Reply in exactly this shape, nothing before or after:',
    'Line 1: the title, at most 70 characters, in the style of the commits below.',
    'Line 2: empty.',
    'Then the description in Markdown: a short "## Summary" with 2-5 bullet points on what changed and why, then "## Testing" with how it was or can be checked.',
    'Do not add Co-Authored-By, "Generated with" or similar lines. Do not run commands or change files.',
    ctx.template ? `\nThe repository's pull request template, to follow:\n${ctx.template.slice(0, 3000)}` : '',
    '',
    `Commits:\n${ctx.log || '(none)'}`,
    '',
    `Changed files:\n${ctx.stat || '(none)'}`,
    '',
    `Diff:\n${diff}`,
  ].join('\n');
}

/** Asks the first installed agent (read-only) for a title and description of the branch. */
export async function suggestPullRequest(cwd: string, base: string): Promise<{ title?: string; body?: string; agent?: string; error?: string }> {
  const range = `${base}...HEAD`;
  const [log, stat, diff, template] = await Promise.all([
    git(cwd, ['log', '--format=- %s%n%b', `${base}..HEAD`]).catch(() => ''),
    git(cwd, ['diff', '--stat=120', range]).catch(() => ''),
    git(cwd, ['diff', '--no-color', '--no-ext-diff', range]).catch(() => ''),
    git(cwd, ['show', 'HEAD:.github/pull_request_template.md']).catch(() => ''),
  ]);
  if (!log.trim() && !diff.trim()) return { error: 'no-changes' };
  let adapter: ICliAdapter | undefined;
  for (const name of AGENT_ORDER) {
    try {
      const a = AdapterFactory.getAdapter(name);
      if (await a.isAvailable()) {
        adapter = a;
        break;
      }
    } catch {}
  }
  if (!adapter) return { error: 'no-agent' };
  const res = await adapter.execute(buildPrPrompt({ base, log: log.trim(), stat: stat.trim(), diff, template }), {
    cwd,
    allowEdits: false,
    timeoutMs: 180_000,
    usageTag: 'pull-request',
    extraArgs: adapter.name === 'claude' ? ['--model', 'haiku'] : undefined,
  });
  const { title, body } = splitPrReply(res.stdout || '');
  if (!title) return { error: 'failed', agent: adapter.name };
  return { title, body, agent: adapter.name };
}

/**
 * Pushes the branch, then opens the pull request: with the GitHub CLI when it
 * is signed in, otherwise returns GitHub's pre-filled "open a pull request" page.
 */
export async function createPullRequest(
  cwd: string,
  opts: { base: string; title: string; body: string }
): Promise<{ url?: string; viaBrowser?: boolean; error?: string }> {
  const info = await pullRequestInfo(cwd);
  if (!info.branch) return { error: 'Not on a branch' };
  if (info.branch === opts.base) return { error: `You are on ${opts.base}; switch to the branch with your changes first.` };
  try {
    await git(cwd, ['push', '-u', 'origin', info.branch]);
  } catch (err: any) {
    return { error: String(err?.stderr || err?.message || err).trim().split('\n').slice(-3).join('\n') };
  }
  if (info.ghReady) {
    const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn('gh', ['pr', 'create', '--base', opts.base, '--head', info.branch!, '--title', opts.title, '--body-file', '-'], {
        cwd,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => resolve({ code: 1, stdout, stderr: String(e) }));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(opts.body);
    });
    const url = out.stdout.match(/https:\/\/\S+\/pull\/\d+/)?.[0] ?? out.stderr.match(/https:\/\/\S+\/pull\/\d+/)?.[0];
    if (url) return { url };
    if (!info.github) return { error: out.stderr.trim().split('\n').slice(-3).join('\n') || 'gh pr create failed' };
  }
  if (!info.github) return { error: 'The origin remote is not on GitHub' };
  return { url: compareUrl(info.github.owner, info.github.repo, opts.base, info.branch, opts.title, opts.body), viaBrowser: true };
}
