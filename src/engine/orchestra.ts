import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { AdapterFactory } from '../adapters/factory.js';
import { WorktreeManager, type SandboxSession } from '../git/worktreeManager.js';
import { GitUtils } from '../git/gitUtils.js';
import { ContextOptimizer } from './contextOptimizer.js';
import { MemoryStore } from './memoryStore.js';
import { detectTestCommand } from './testPlan.js';
import type { CliExecutionResult, ICliAdapter } from '../types/index.js';

const execFileAsync = promisify(execFile);

/**
 * Orchestra: the orchestrator-worker pattern. A planner agent splits a goal
 * into a few tasks, worker agents run them at the same time (each in its own
 * git worktree, writing tests for its part), finished tasks are merged into
 * one integration copy, everything is tested together, a reviewer checks the
 * whole change, and the result is applied to the project's working tree.
 */

export type OrchestraTaskState = 'waiting' | 'running' | 'testing' | 'fixing' | 'merging' | 'done' | 'failed' | 'skipped';
export type OrchestraPhase =
  | 'checking'
  | 'planning'
  | 'working'
  | 'integrating'
  | 'reviewing'
  | 'awaiting-review'
  | 'done'
  | 'failed'
  | 'stopped';

export interface OrchestraTask {
  id: string;
  title: string;
  description: string;
  files: string[];
  dependsOn: string[];
  agent: string;
  state: OrchestraTaskState;
  note?: string;
}

export type OrchestraEvent =
  | { type: 'status'; phase: OrchestraPhase; text: string }
  | { type: 'plan'; summary: string; tasks: OrchestraTask[] }
  | { type: 'task'; id: string; state: OrchestraTaskState; note?: string }
  | { type: 'output'; id: string; text: string }
  | { type: 'log'; agent: string; text: string; time: string };

export type OrchestraLang = 'en' | 'tr';

export interface OrchestraOptions {
  planner?: string;
  workers?: string[];
  reviewer?: string;
  /** Command that must pass; empty: the project's own test command. */
  verifyCmd?: string;
  maxParallel?: number;
  /** Attempts per task (and for the combined fix) while tests fail. */
  maxRounds?: number;
  timeoutMs?: number;
  cwd?: string;
  lang?: OrchestraLang;
  /**
   * Apply the combined change to the working tree as soon as it is reviewed
   * (CLI). When false the change waits in its copy until the developer applies
   * (all or some files), discards or asks for changes; see applyReviewed().
   */
  autoApply?: boolean;
  onEvent?: (event: OrchestraEvent) => void;
}

export interface OrchestraResult {
  success: boolean;
  stopped?: boolean;
  summary?: string;
  tasks: OrchestraTask[];
  testsPassed?: boolean;
  testCommand?: string;
  review?: 'approved' | 'rejected' | 'skipped';
  reviewNotes?: string;
  /** The combined change was written into the project's working tree. */
  applied: boolean;
  /** Left in place when the change could not be applied automatically. */
  sandbox?: SandboxSession;
  /** The change is waiting for the developer (autoApply: false). */
  pendingReview?: boolean;
  /** Files in the combined change. */
  files?: string[];
  error?: string;
  durationMs: number;
}

const LABELS: Record<string, string> = {
  claude: 'Claude',
  agy: 'AGY',
  codex: 'Codex',
  opencode: 'OpenCode',
  cursor: 'Cursor Agent',
  gemini: 'Gemini',
  mock: 'Mock',
};
const label = (name: string) => LABELS[name] ?? name;

const TEXT = {
  en: {
    checking: 'Checking the agents and the project...',
    noGit: 'Orchestra works in a git repository with at least one commit, so each agent can get its own copy. Initialise git (git init, then commit) and start again.',
    missing: (names: string) => `Agent not installed: ${names}. Pick installed agents or install them first.`,
    planning: (agent: string) => `${agent} is splitting the goal into tasks...`,
    planFallback: 'The plan could not be read, so the goal runs as one task.',
    planned: (n: number) => `Plan ready: ${n} task${n === 1 ? '' : 's'}.`,
    working: (running: number, done: number, total: number) => `${running} agent${running === 1 ? '' : 's'} working · ${done}/${total} tasks done`,
    taskStarted: (agent: string, title: string) => `${agent} started "${title}".`,
    taskTesting: (cmd: string) => `Running "${cmd}"...`,
    taskFixing: (round: number, max: number) => `Tests failed, fixing (round ${round}/${max})...`,
    taskNoChange: 'Finished without changing any file.',
    taskTestsFailed: (max: number) => `Tests still failed after ${max} rounds.`,
    taskAgentFailed: (tail: string) => `The agent stopped: ${tail}`,
    taskMerging: 'Merging into the combined copy...',
    taskConflict: (files: string) => `Merge conflict in ${files}; resolving...`,
    taskConflictFailed: 'The merge conflict could not be resolved.',
    taskDone: (agent: string, title: string) => `${agent} finished "${title}" and it was merged.`,
    taskSkipped: 'Skipped: a task it depends on did not finish.',
    nothingDone: 'No task finished, so there is nothing to combine.',
    integrating: (cmd: string) => `Testing everything together with "${cmd}"...`,
    integrationNoTests: 'No test command found; the combined change was not tested.',
    integrationFixing: (agent: string, round: number, max: number) => `Tests failed together; ${agent} is fixing (round ${round}/${max})...`,
    reviewing: (agent: string) => `${agent} is reviewing the whole change...`,
    reviewRejected: (agent: string) => `${agent} found problems; they go back for one round of fixes.`,
    reviewFixing: (agent: string) => `${agent} is fixing what the reviewer found...`,
    revising: (agent: string) => `${agent} is making the changes you asked for...`,
    awaitingReview: 'Ready for your review.',
    applyFailed: 'The change could not be applied to your folder automatically; it is waiting in the Sandbox panel.',
    done: 'Done.',
    stopped: 'Stopped.',
  },
  tr: {
    checking: 'Ajanlar ve proje kontrol ediliyor...',
    noGit: 'Orkestra, her ajana ayrı bir kopya verebilmek için en az bir commit’i olan bir git deposunda çalışır. Önce git’i başlat (git init, sonra commit) ve tekrar dene.',
    missing: (names: string) => `Kurulu olmayan ajan: ${names}. Kurulu ajanları seç ya da önce onları kur.`,
    planning: (agent: string) => `${agent} hedefi görevlere bölüyor...`,
    planFallback: 'Plan okunamadı; hedef tek bir görev olarak yürütülecek.',
    planned: (n: number) => `Plan hazır: ${n} görev.`,
    working: (running: number, done: number, total: number) => `${running} ajan çalışıyor · ${done}/${total} görev bitti`,
    taskStarted: (agent: string, title: string) => `${agent} "${title}" görevine başladı.`,
    taskTesting: (cmd: string) => `"${cmd}" çalıştırılıyor...`,
    taskFixing: (round: number, max: number) => `Testler kırıldı, düzeltiliyor (tur ${round}/${max})...`,
    taskNoChange: 'Hiçbir dosyayı değiştirmeden bitti.',
    taskTestsFailed: (max: number) => `${max} turda testler geçmedi.`,
    taskAgentFailed: (tail: string) => `Ajan durdu: ${tail}`,
    taskMerging: 'Ortak kopyaya birleştiriliyor...',
    taskConflict: (files: string) => `${files} dosyasında çakışma var; çözülüyor...`,
    taskConflictFailed: 'Birleştirme çakışması çözülemedi.',
    taskDone: (agent: string, title: string) => `${agent} "${title}" görevini bitirdi, birleştirildi.`,
    taskSkipped: 'Atlandı: bağlı olduğu görev bitmedi.',
    nothingDone: 'Hiçbir görev bitmedi; birleştirilecek bir şey yok.',
    integrating: (cmd: string) => `Hepsi birlikte "${cmd}" ile test ediliyor...`,
    integrationNoTests: 'Test komutu bulunamadı; birleşik değişiklik test edilmedi.',
    integrationFixing: (agent: string, round: number, max: number) => `Birlikte testler kırıldı; ${agent} düzeltiyor (tur ${round}/${max})...`,
    reviewing: (agent: string) => `${agent} bütün değişikliği gözden geçiriyor...`,
    reviewRejected: (agent: string) => `${agent} sorun buldu; bir tur düzeltmeye gönderiliyor.`,
    reviewFixing: (agent: string) => `${agent} denetçinin bulduklarını düzeltiyor...`,
    revising: (agent: string) => `${agent} istediğin değişiklikleri yapıyor...`,
    awaitingReview: 'İncelemen için hazır.',
    applyFailed: 'Değişiklik klasörüne otomatik uygulanamadı; Sandbox panelinde seni bekliyor.',
    done: 'Tamamlandı.',
    stopped: 'Durduruldu.',
  },
};

/** Runs async work one at a time (git commands that touch shared refs). */
class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
const lastLine = (res: CliExecutionResult) =>
  stripAnsi([res.stderr, res.stdout].filter(Boolean).join('\n')).trim().split('\n').slice(-3).join(' ').slice(0, 300) ||
  (res.timedOut ? 'timeout' : `exit ${res.exitCode}`);

/** The plan JSON from the planner's reply, or null if it can't be read. */
export function parsePlan(output: string): { summary: string; tasks: Array<Omit<OrchestraTask, 'agent' | 'state'>> } | null {
  const text = stripAnsi(output);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter(Boolean) as string[];
  for (const raw of candidates) {
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.tasks) || data.tasks.length === 0) continue;
      const tasks = data.tasks.slice(0, 6).map((t: any, i: number) => ({
        id: String(t.id || `t${i + 1}`).replace(/[^\w-]/g, '').slice(0, 20) || `t${i + 1}`,
        title: String(t.title || `Task ${i + 1}`).slice(0, 120),
        description: String(t.description || t.title || ''),
        files: Array.isArray(t.files) ? t.files.map(String).slice(0, 20) : [],
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
      }));
      // Unique ids, known dependencies only, and no cycles.
      const ids = new Set<string>();
      for (const t of tasks) {
        while (ids.has(t.id)) t.id = `${t.id}x`;
        ids.add(t.id);
      }
      for (const t of tasks) t.dependsOn = t.dependsOn.filter((d: string) => ids.has(d) && d !== t.id);
      const byId = new Map(tasks.map((t: any) => [t.id, t]));
      const visiting = new Set<string>();
      const cyclic = (id: string): boolean => {
        if (visiting.has(id)) return true;
        visiting.add(id);
        const hit = (byId.get(id) as any)?.dependsOn.some(cyclic);
        visiting.delete(id);
        return hit;
      };
      if (tasks.some((t: any) => cyclic(t.id))) for (const t of tasks) t.dependsOn = [];
      return { summary: String(data.summary || ''), tasks };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export class Orchestra {
  private readonly cwd: string;
  private readonly planner: string;
  private readonly workers: string[];
  private readonly reviewer: string;
  private readonly verifyCmd: string;
  private readonly maxParallel: number;
  private readonly maxRounds: number;
  private readonly timeoutMs: number;
  private readonly lang: OrchestraLang;
  private readonly text: (typeof TEXT)[OrchestraLang];
  private readonly onEvent?: (event: OrchestraEvent) => void;
  private readonly autoApply: boolean;
  private readonly abort = new AbortController();
  private readonly serial = new Serial();
  private readonly wm: WorktreeManager;
  /** Copies of the tasks being worked on, for the live view. */
  private readonly taskSandboxes = new Map<string, SandboxSession>();
  /** The combined change waiting for the developer (autoApply: false). */
  private pending: { goal: string; base: string; integration: SandboxSession; cmd: string } | null = null;

  constructor(options: OrchestraOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.planner = (options.planner || 'claude').toLowerCase();
    this.workers = (options.workers?.length ? options.workers : [this.planner]).map((w) => w.toLowerCase());
    this.reviewer = (options.reviewer || this.planner).toLowerCase();
    this.verifyCmd = options.verifyCmd?.trim() || '';
    this.maxParallel = Math.max(1, Math.min(options.maxParallel ?? 3, 6));
    this.maxRounds = Math.max(1, options.maxRounds ?? 2);
    this.timeoutMs = options.timeoutMs ?? 15 * 60_000;
    this.lang = options.lang ?? 'tr';
    this.text = TEXT[this.lang];
    this.onEvent = options.onEvent;
    this.autoApply = options.autoApply ?? true;
    this.wm = new WorktreeManager(this.cwd);
  }

  /** Stops every running agent; run() then cleans up and resolves as stopped. */
  stop(): void {
    this.abort.abort();
  }

  private get stopped() {
    return this.abort.signal.aborted;
  }

  private emit(event: OrchestraEvent) {
    this.onEvent?.(event);
  }

  private status(phase: OrchestraPhase, text: string) {
    this.emit({ type: 'status', phase, text });
  }

  private log(agent: string, text: string) {
    this.emit({ type: 'log', agent, text, time: new Date().toISOString() });
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  }

  private async tryGit(cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
    try {
      return { ok: true, out: await this.git(cwd, args) };
    } catch (err: any) {
      return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}` };
    }
  }

  private async runCommand(cmd: string, cwd: string): Promise<{ ok: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/d', '/s', '/c', cmd] : ['-c', cmd], {
        cwd,
        timeout: 5 * 60_000,
        maxBuffer: 5 * 1024 * 1024,
        signal: this.abort.signal,
      });
      return { ok: true, output: ContextOptimizer.optimizeTerminalLog([stdout, stderr].join('\n'), { maxLines: 60, maxBytes: 8192 }) };
    } catch (err: any) {
      const raw = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
      return { ok: false, output: ContextOptimizer.optimizeTerminalLog(raw, { maxLines: 60, maxBytes: 8192 }) };
    }
  }

  private adapter(name: string): ICliAdapter {
    return AdapterFactory.getAdapter(name);
  }

  /** Runs an agent, streaming its last output lines to the UI for this task. */
  private execAgent(name: string, prompt: string, cwd: string, allowEdits: boolean, taskId?: string) {
    let buffer = '';
    let last = 0;
    const flush = () => {
      if (!taskId) return;
      const lines = stripAnsi(buffer).trim().split('\n').filter(Boolean).slice(-4).join('\n');
      if (lines) this.emit({ type: 'output', id: taskId, text: lines.slice(-600) });
    };
    return this.adapter(name).execute(prompt, {
      cwd,
      allowEdits,
      timeoutMs: this.timeoutMs,
      signal: this.abort.signal,
      onStdout: (chunk) => {
        buffer = (buffer + chunk).slice(-4000);
        if (Date.now() - last > 700) {
          last = Date.now();
          flush();
        }
      },
    }).then((res) => {
      buffer = res.stdout || buffer;
      flush();
      return res;
    });
  }

  async run(goal: string): Promise<OrchestraResult> {
    const start = Date.now();
    const runId = `orchestra-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
    const wm = this.wm;
    let tasks: OrchestraTask[] = [];
    const taskSandboxes = this.taskSandboxes;
    let integration: SandboxSession | undefined;

    const finish = async (partial: Partial<OrchestraResult>): Promise<OrchestraResult> => {
      for (const sb of taskSandboxes.values()) await wm.destroySandbox(sb.worktreePath, sb.branchName, true);
      const keep = partial.sandbox;
      if (integration && !keep) await wm.destroySandbox(integration.worktreePath, integration.branchName, true);
      const result: OrchestraResult = { success: false, applied: false, tasks, durationMs: Date.now() - start, ...partial };
      if (this.stopped) {
        result.success = false;
        result.stopped = true;
        this.status('stopped', this.text.stopped);
      } else this.status(result.success ? 'done' : 'failed', result.success ? this.text.done : result.error || '');
      return result;
    };

    // 0. Agents installed, and a git repo with a commit to branch from.
    this.status('checking', this.text.checking);
    const names = [...new Set([this.planner, this.reviewer, ...this.workers])];
    const missing: string[] = [];
    for (const n of names) {
      try {
        if (!(await this.adapter(n).isAvailable())) missing.push(label(n));
      } catch {
        missing.push(label(n));
      }
    }
    if (missing.length) return finish({ error: this.text.missing(missing.join(', ')) });

    const head = await this.tryGit(this.cwd, ['rev-parse', 'HEAD']);
    if (!head.ok) return finish({ error: this.text.noGit });
    // Uncommitted tracked edits are part of the starting point, without touching them.
    const stash = await this.tryGit(this.cwd, ['stash', 'create']);
    // Only a real commit id counts: on failure tryGit returns the error text.
    const sha = (r: { ok: boolean; out: string }) => (r.ok && /^[0-9a-f]{40,64}$/.test(r.out.trim()) ? r.out.trim() : '');
    const base = sha(stash) || head.out.trim();

    try {
      integration = await this.serial.run(() => wm.createSandbox(runId, base));
    } catch (err: any) {
      return finish({ error: err.message || String(err) });
    }
    const intCwd = integration.worktreePath;
    const memory = new MemoryStore(this.cwd).toPromptSnippet();
    const replyLang = this.lang === 'tr' ? 'Turkish' : 'English';

    // 1. Plan.
    this.status('planning', this.text.planning(label(this.planner)));
    const files = (await this.tryGit(intCwd, ['ls-files'])).out.split('\n').filter(Boolean);
    const planPrompt = [
      `You are the lead of a small team of coding agents. Goal: "${goal}"`,
      '',
      'Split the goal into tasks that different agents can do at the same time, each in its own copy of this repository.',
      'Rules:',
      '- 2 to 5 tasks; a single task if the goal is small.',
      '- Tasks that run at the same time must not change the same files.',
      '- Put shared groundwork (e.g. a module the others import) in its own task and make the others depend on it.',
      '- Each task writes tests for its own part.',
      `- Write "title" and "description" in ${replyLang}. Titles are short (max ~6 words); descriptions are concrete (functions, files, behaviour).`,
      'You may read files to understand the project, but do not change anything.',
      '',
      `Files in the repository (${files.length}):`,
      files.slice(0, 300).join('\n'),
      '',
      memory,
      '',
      'Reply with only this JSON, nothing else:',
      '{"summary":"<one sentence>","tasks":[{"id":"t1","title":"...","description":"...","files":["paths it creates or changes"],"dependsOn":[]}]}',
    ].join('\n');
    const planRes = await this.execAgent(this.planner, planPrompt, intCwd, false);
    if (this.stopped) return finish({});
    const plan = planRes.exitCode === 0 ? parsePlan(planRes.stdout) : null;
    if (!plan) this.log('orchestrator', this.text.planFallback);
    const planned = plan?.tasks ?? [{ id: 't1', title: goal.slice(0, 80), description: goal, files: [], dependsOn: [] }];
    tasks = planned.map((t, i) => ({ ...t, agent: this.workers[i % this.workers.length], state: 'waiting' as const }));
    const summary = plan?.summary || '';
    this.emit({ type: 'plan', summary, tasks: tasks.map((t) => ({ ...t })) });
    this.log(this.planner, this.text.planned(tasks.length));

    const setTask = (task: OrchestraTask, state: OrchestraTaskState, note?: string) => {
      task.state = state;
      task.note = note;
      this.emit({ type: 'task', id: task.id, state, note });
    };

    // 2. Workers, as many at once as allowed, each task once its dependencies merged.
    const runTask = async (task: OrchestraTask) => {
      setTask(task, 'running');
      this.log(task.agent, this.text.taskStarted(label(task.agent), task.title));
      let sb: SandboxSession;
      try {
        sb = await this.serial.run(() => wm.createSandbox(`${runId}-${task.id}`, integration!.branchName));
      } catch (err: any) {
        setTask(task, 'failed', err.message || String(err));
        return;
      }
      taskSandboxes.set(task.id, sb);
      const cmd = this.verifyCmd || detectTestCommand(sb.worktreePath) || '';
      const others = tasks.filter((t) => t.id !== task.id).map((t) => `- ${t.title}${t.files.length ? ` (${t.files.join(', ')})` : ''}`);
      let prompt = [
        `You are one of several coding agents working in parallel on this goal: "${goal}"`,
        '',
        `Your task: ${task.title}`,
        task.description,
        task.files.length ? `Files for your task: ${task.files.join(', ')}` : '',
        others.length ? `Other agents are doing these at the same time; do not do their work or edit their files:\n${others.join('\n')}` : '',
        '',
        'Write or update tests for your part.',
        cmd ? `Your work is checked with: ${cmd}` : '',
        'Do not ask questions; make reasonable assumptions. Finish with a short summary of what you changed.',
        memory,
      ].filter(Boolean).join('\n');

      let passed = !cmd;
      for (let round = 1; round <= this.maxRounds; round++) {
        if (round > 1) setTask(task, 'fixing', this.text.taskFixing(round, this.maxRounds));
        const before = (await this.tryGit(sb.worktreePath, ['status', '--porcelain'])).out;
        const res = await this.execAgent(task.agent, prompt, sb.worktreePath, true, task.id);
        if (this.stopped) return;
        const after = (await this.tryGit(sb.worktreePath, ['status', '--porcelain'])).out;
        if (after === before && (res.exitCode !== 0 || res.timedOut)) {
          setTask(task, 'failed', this.text.taskAgentFailed(lastLine(res)));
          return;
        }
        if (!cmd) break;
        setTask(task, 'testing', this.text.taskTesting(cmd));
        const check = await this.runCommand(cmd, sb.worktreePath);
        if (this.stopped) return;
        if (check.ok) {
          passed = true;
          break;
        }
        prompt = [
          `Still working on: "${task.title}" (part of "${goal}").`,
          `"${cmd}" failed:`,
          check.output,
          '',
          'Fix it with the smallest correct change. Do not ask questions.',
        ].join('\n');
      }
      if (!passed) {
        setTask(task, 'failed', this.text.taskTestsFailed(this.maxRounds));
        return;
      }

      await this.tryGit(sb.worktreePath, ['add', '-A']);
      const committed = await this.tryGit(sb.worktreePath, ['commit', '--no-verify', '-q', '-m', `orchestra: ${task.title}`]);
      if (!committed.ok) {
        setTask(task, 'failed', this.text.taskNoChange);
        return;
      }

      // Merge one at a time into the shared copy; an agent resolves conflicts.
      await this.serial.run(async () => {
        setTask(task, 'merging', this.text.taskMerging);
        const merge = await this.tryGit(intCwd, ['merge', '--no-ff', '--no-edit', '-q', sb.branchName]);
        if (!merge.ok) {
          const conflicted = (await this.tryGit(intCwd, ['diff', '--name-only', '--diff-filter=U'])).out.split('\n').filter(Boolean);
          if (!conflicted.length) {
            await this.tryGit(intCwd, ['merge', '--abort']);
            setTask(task, 'failed', merge.out.slice(-300));
            return;
          }
          setTask(task, 'merging', this.text.taskConflict(conflicted.join(', ')));
          await this.execAgent(
            this.planner,
            [
              `Two agents changed the same files while working on "${goal}". Git left conflict markers in: ${conflicted.join(', ')}.`,
              'Resolve every conflict so that both sides\' intent is kept, remove all conflict markers, and make the tests pass. Do not ask questions.',
            ].join('\n'),
            intCwd,
            true,
            task.id
          );
          const markers = await this.tryGit(intCwd, ['grep', '-l', '-E', '^(<<<<<<<|>>>>>>>) ', '--', ...conflicted]);
          await this.tryGit(intCwd, ['add', '-A']);
          // git grep succeeds only when it finds a leftover marker.
          const done = !markers.ok && (await this.tryGit(intCwd, ['commit', '--no-verify', '--no-edit', '-q'])).ok;
          if (!done) {
            await this.tryGit(intCwd, ['merge', '--abort']);
            setTask(task, 'failed', this.text.taskConflictFailed);
            return;
          }
        }
        setTask(task, 'done');
        this.log(task.agent, this.text.taskDone(label(task.agent), task.title));
      });
      await wm.destroySandbox(sb.worktreePath, sb.branchName, true);
      taskSandboxes.delete(task.id);
    };

    this.status('working', this.text.working(0, 0, tasks.length));
    const running = new Map<string, Promise<void>>();
    const progress = () =>
      this.status('working', this.text.working(running.size, tasks.filter((t) => t.state === 'done').length, tasks.length));
    while (!this.stopped) {
      for (const t of tasks) {
        if (t.state === 'waiting' && t.dependsOn.some((d) => ['failed', 'skipped'].includes(tasks.find((x) => x.id === d)?.state ?? ''))) {
          setTask(t, 'skipped', this.text.taskSkipped);
        }
      }
      const ready = tasks.filter(
        (t) => t.state === 'waiting' && !running.has(t.id) && t.dependsOn.every((d) => tasks.find((x) => x.id === d)?.state === 'done')
      );
      for (const t of ready) {
        if (running.size >= this.maxParallel) break;
        running.set(t.id, runTask(t).finally(() => running.delete(t.id)));
      }
      progress();
      if (running.size === 0) break;
      await Promise.race(running.values());
    }
    await Promise.allSettled(running.values());
    if (this.stopped) return finish({});

    const doneTasks = tasks.filter((t) => t.state === 'done');
    if (!doneTasks.length) return finish({ summary, error: this.text.nothingDone });

    // 3+4. Test everything together and review the whole change.
    const cmd = this.verifyCmd || detectTestCommand(intCwd) || '';
    const checked = await this.checkAndReview(goal, intCwd, base, cmd, 1);
    if (this.stopped) return finish({});
    const changedFiles = (await this.tryGit(intCwd, ['diff', '--name-only', base, 'HEAD'])).out.split('\n').filter(Boolean);

    // 5. Wait for the developer, or apply right away.
    if (!this.autoApply) {
      for (const sb of taskSandboxes.values()) await wm.destroySandbox(sb.worktreePath, sb.branchName, true);
      taskSandboxes.clear();
      this.pending = { goal, base, integration: integration!, cmd };
      this.status('awaiting-review', this.text.awaitingReview);
      return {
        success: true,
        summary,
        tasks,
        testCommand: cmd || undefined,
        ...checked,
        files: changedFiles,
        applied: false,
        pendingReview: true,
        durationMs: Date.now() - start,
      };
    }
    const applied = await this.applyPatch(intCwd, base);
    if (!applied) this.log('orchestrator', this.text.applyFailed);

    return finish({
      success: true,
      summary,
      testCommand: cmd || undefined,
      ...checked,
      files: changedFiles,
      applied,
      sandbox: applied ? undefined : integration,
    });
  }

  /**
   * Runs the tests in the combined copy (letting the planner fix failures),
   * then the reviewer; a rejection goes back to the planner up to
   * reviewFixes times.
   */
  private async checkAndReview(
    goal: string,
    intCwd: string,
    base: string,
    cmd: string,
    reviewFixes: number
  ): Promise<{ testsPassed?: boolean; review: OrchestraResult['review']; reviewNotes: string }> {
    const replyLang = this.lang === 'tr' ? 'Turkish' : 'English';
    let testsPassed: boolean | undefined;
    let review: OrchestraResult['review'] = 'skipped';
    let reviewNotes = '';
    for (let pass = 0; ; pass++) {
      if (cmd) {
        for (let round = 1; ; round++) {
          this.status('integrating', this.text.integrating(cmd));
          const check = await this.runCommand(cmd, intCwd);
          if (this.stopped) return { review, reviewNotes };
          testsPassed = check.ok;
          if (check.ok || round > this.maxRounds) break;
          this.status('integrating', this.text.integrationFixing(label(this.planner), round, this.maxRounds));
          await this.execAgent(
            this.planner,
            [
              `Several agents' work on "${goal}" was merged, and "${cmd}" now fails:`,
              check.output,
              '',
              "Fix it with the smallest correct change, keeping every task's behaviour. Do not ask questions.",
            ].join('\n'),
            intCwd,
            true
          );
          if (this.stopped) return { review, reviewNotes };
          await this.commitAll(intCwd, 'orchestra: fix combined tests');
        }
      } else if (pass === 0) this.log('orchestrator', this.text.integrationNoTests);

      this.status('reviewing', this.text.reviewing(label(this.reviewer)));
      const diff = (await this.tryGit(intCwd, ['diff', base, 'HEAD'])).out;
      const reviewRes = await this.execAgent(
        this.reviewer,
        [
          `You are reviewing the combined work of several agents for the goal "${goal}".${testsPassed ? ' Tests pass.' : ''}`,
          'Everything you need is included in this message: do not run any commands and do not read or modify any files, answer directly. Look for bugs, missed requirements and parts that do not fit together in this git diff:',
          ContextOptimizer.optimizeDiff(diff, 2000),
          '',
          'Only reject for real bugs or missed requirements, not for style or optional extras.',
          'End your reply with exactly one line: "VERDICT: APPROVED" or "VERDICT: REJECTED: <reason>".',
          `Write your reply in ${replyLang}. Keep the VERDICT line in English.`,
        ].join('\n'),
        intCwd,
        false
      );
      if (this.stopped) return { testsPassed, review, reviewNotes };
      const ran = reviewRes.exitCode === 0 && !reviewRes.timedOut;
      review = !ran
        ? 'skipped'
        : /VERDICT:\s*REJECTED/i.test(reviewRes.stdout)
          ? 'rejected'
          : /VERDICT:\s*APPROVED/i.test(reviewRes.stdout)
            ? 'approved'
            : 'skipped';
      reviewNotes = stripAnsi(reviewRes.stdout).trim().slice(-4000);
      if (review !== 'rejected' || pass >= reviewFixes) break;

      this.status('integrating', this.text.reviewFixing(label(this.planner)));
      this.log(this.reviewer, this.text.reviewRejected(label(this.reviewer)));
      await this.execAgent(
        this.planner,
        [
          `Several agents' work on "${goal}" was merged. A reviewer rejected it:`,
          reviewNotes,
          '',
          'Fix the real bugs and the parts that do not fit together, with tests for each fix. Skip optional extras. Do not ask questions.',
        ].join('\n'),
        intCwd,
        true
      );
      if (this.stopped) return { testsPassed, review, reviewNotes };
      await this.commitAll(intCwd, 'orchestra: address review');
    }
    return { testsPassed, review, reviewNotes };
  }

  private async commitAll(cwd: string, message: string) {
    await this.tryGit(cwd, ['add', '-A']);
    await this.tryGit(cwd, ['commit', '--no-verify', '-q', '-m', message]);
  }

  /** Writes the combined change (or only `files`) into the project's working tree. */
  private async applyPatch(intCwd: string, base: string, files?: string[]): Promise<boolean> {
    const patch = (await this.tryGit(intCwd, ['diff', '--binary', base, 'HEAD', ...(files?.length ? ['--', ...files] : [])])).out;
    if (!patch.trim()) return false;
    // A plain apply leaves the changes unstaged like any agent's edits; --3way
    // (which stages them) only when the user's own edits overlap.
    for (const mode of [[], ['--3way']]) {
      const res = spawnSync('git', ['apply', ...mode, '--whitespace=nowarn', '-'], { cwd: this.cwd, input: patch, encoding: 'utf-8' });
      if (res.status === 0) return true;
    }
    return false;
  }

  /**
   * What an agent has written so far: the uncommitted diff of a running task's
   * copy, or of the combined copy (no taskId) while it is checked or reviewed.
   */
  async liveDiff(taskId?: string): Promise<string> {
    const cwd = taskId ? this.taskSandboxes.get(taskId)?.worktreePath : this.pending?.integration.worktreePath;
    if (!cwd) return '';
    if (!taskId && this.pending) return (await this.tryGit(cwd, ['diff', this.pending.base, 'HEAD'])).out;
    return (await new GitUtils(cwd).getDiffAsync()).diff;
  }

  /** Applies the reviewed change (all files, or only `files`) and removes its copy. */
  async applyReviewed(files?: string[]): Promise<{ applied: boolean }> {
    const p = this.pending;
    if (!p) return { applied: false };
    const applied = await this.applyPatch(p.integration.worktreePath, p.base, files);
    if (applied) await this.discardReviewed();
    return { applied };
  }

  /** Drops the waiting change without touching the project. */
  async discardReviewed(): Promise<void> {
    const p = this.pending;
    this.pending = null;
    if (p) await this.wm.destroySandbox(p.integration.worktreePath, p.integration.branchName, true);
  }

  /** The developer asked for changes: the planner makes them, then tests and review run again. */
  async revise(feedback: string): Promise<Pick<OrchestraResult, 'testsPassed' | 'review' | 'reviewNotes' | 'files'>> {
    const p = this.pending;
    if (!p) return { review: 'skipped', reviewNotes: '' };
    const intCwd = p.integration.worktreePath;
    this.status('integrating', this.text.revising(label(this.planner)));
    await this.execAgent(
      this.planner,
      [
        `Several agents implemented "${p.goal}". The developer reviewed the result and asks for these changes:`,
        feedback,
        '',
        'Make them with the smallest correct change and keep the tests passing. Do not ask questions.',
      ].join('\n'),
      intCwd,
      true
    );
    await this.commitAll(intCwd, 'orchestra: changes requested in review');
    const checked = await this.checkAndReview(p.goal, intCwd, p.base, p.cmd, 0);
    const files = (await this.tryGit(intCwd, ['diff', '--name-only', p.base, 'HEAD'])).out.split('\n').filter(Boolean);
    this.status('awaiting-review', this.text.awaitingReview);
    return { ...checked, files };
  }
}
