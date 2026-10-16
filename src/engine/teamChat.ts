import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AdapterFactory } from '../adapters/factory.js';
import { ContextOptimizer } from './contextOptimizer.js';
import { MemoryStore } from './memoryStore.js';
import { GitUtils } from '../git/gitUtils.js';
import { detectTestCommand, parseTestCommand } from './testPlan.js';
import type { UsageSummary } from './usageLedger.js';
import type { AgentActivity, ToolApprovalRequest } from '../types/index.js';

const execFileAsync = promisify(execFile);

export type ChatAgentId = 'claude' | 'agy' | 'codex' | 'cursor' | 'opencode' | 'gemini';

export interface TeamChatTurn {
  role: 'user' | 'agent';
  agent?: ChatAgentId;
  text: string;
}

export interface AgentModelChoice {
  model?: string;
  effort?: string;
}

export interface TeamChatOptions {
  id: string;
  prompt: string;
  cwd: string;
  mode: 'solo' | 'team';
  /** For solo mode: which agent to run. */
  soloAgent?: ChatAgentId;
  /** For solo mode: optional model id ('default', 'haiku', 'sonnet', 'opus', 'gemini-2.5-flash', 'gemini-2.5-pro', 'o3-mini', 'gpt-4o'). */
  soloModel?: string;
  /** For solo mode: reasoning effort (low | medium | high | xhigh | max) for CLIs that take it as a flag. */
  soloEffort?: string;
  /** For team mode: which agents the user allowed to collaborate. Empty = auto-pick from installed. */
  teamAgents?: ChatAgentId[];
  /** For team mode: the model + effort the user picked for each agent. Missing = the CLI's default. */
  teamModels?: Partial<Record<ChatAgentId, AgentModelChoice>>;
  /** Previous compact conversation turns for continuity (automatically trimmed to save tokens). */
  history?: TeamChatTurn[];
  /** Optional weekly usage summary from UsageLedger to balance load across subscriptions. */
  weeklyUsage?: UsageSummary;
  /** UI language ('tr' | 'en' | ...). */
  lang?: string;
  /** Asks the user about a tool an agent's permission mode doesn't allow. Unset = refused. */
  onToolApproval?: (request: ToolApprovalRequest & { agent: ChatAgentId }) => Promise<boolean>;
  onEvent: (event: TeamChatEvent) => void;
}

export type TeamChatEvent =
  | {
      type: 'system_note';
      text: string;
      badge?: string;
    }
  | {
      type: 'thinking';
      id: string;
      agent?: ChatAgentId;
      roleLabel: string;
      text: string;
      model?: string;
      streaming?: boolean;
    }
  | {
      type: 'agent_start';
      messageId: string;
      agent: ChatAgentId;
      roleLabel: string;
      model?: string;
      /** The teammate this turn answers, in a team discussion. */
      replyTo?: ChatAgentId;
    }
  | {
      type: 'agent_chunk';
      messageId: string;
      agent: ChatAgentId;
      /** The reply so far, with any <think> blocks removed. */
      text: string;
    }
  | {
      /** A step the agent took while answering (command, file read or edit...). */
      type: 'agent_activity';
      messageId: string;
      agent: ChatAgentId;
      activity: AgentActivity;
    }
  | {
      type: 'agent_done';
      messageId: string;
      agent: ChatAgentId;
      roleLabel: string;
      text: string;
      model?: string;
      tokensUsed?: number;
      costUsd?: number;
    }
  | {
      type: 'tool_card';
      agent: ChatAgentId;
      title: string;
      detail?: string;
      isError?: boolean;
    }
  | {
      type: 'task_plan';
      tasks: Array<{ id: string; agent: ChatAgentId; roleLabel: string; title: string }>;
    }
  | {
      type: 'done';
      savedTokensEstimate: number;
    }
  | {
      type: 'error';
      message: string;
    };

/** A chat turn may read, edit and test a whole feature; the adapters' 3-minute default cut real work off. */
const CHAT_TURN_TIMEOUT_MS = 15 * 60_000;

/** CLIs whose JSON output already reports each step; the rest show their stderr as a log. */
const REPORTS_STEPS = new Set<ChatAgentId>(['claude', 'codex', 'cursor']);

/** Drops terminal colour codes and blank lines from a CLI's stderr. */
export function cleanLogText(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .join('\n');
}

const SAFE_MODEL_RE = /^[a-zA-Z0-9._:/-]+$/;
const EFFORT_RE = /^(low|medium|high|xhigh|max)$/;

/**
 * Builds CLI extraArgs for an agent + model + effort choice. Claude takes the
 * effort as `--effort`, Codex as a reasoning-effort config override; the other
 * CLIs encode effort in the model id itself (e.g. `gpt-5.3-codex-high`).
 */
export function buildModelExtraArgs(agent: ChatAgentId, model?: string, effort?: string): string[] {
  const args: string[] = [];
  if (model && model !== 'default' && SAFE_MODEL_RE.test(model)) {
    if (agent === 'codex' || agent === 'opencode') args.push('-m', model);
    else args.push('--model', model);
  }
  if (effort && EFFORT_RE.test(effort)) {
    if (agent === 'claude') args.push('--effort', effort);
    if (agent === 'codex') args.push('-c', `model_reasoning_effort=${effort === 'max' ? 'xhigh' : effort}`);
  }
  return args;
}

/** Classifies whether a user prompt is a quick/simple turn vs. a multi-step engineering build. */
export function classifyPromptComplexity(prompt: string): 'simple' | 'collaborative' {
  const clean = prompt.trim();
  const wordCount = clean.split(/\s+/).length;
  const multiStepKeywords =
    /\b(mimari|modül|sistem|uygulama|baştan sona|full|architecture|module|feature|implement|refactor|tüm|birden fazla|backend.*frontend|api.*ui|ekran.*servis|hem.*hem)\b/i;
  const questionOnly =
    /^(nedir|nasıl|neden|ne işe|açıkla|what is|how does|why|explain|where is)\b/i.test(clean) &&
    wordCount < 25;

  if (questionOnly) return 'simple';
  if (multiStepKeywords.test(clean) || wordCount >= 18) return 'collaborative';
  return 'simple';
}

/**
 * Picks installed agents ordered from lowest weekly token usage to highest so
 * no single subscription burns through its weekly quota prematurely.
 */
export async function pickQuotaBalancedAgents(
  requested: ChatAgentId[] | undefined,
  weeklyUsage?: UsageSummary
): Promise<ChatAgentId[]> {
  const candidates: ChatAgentId[] =
    requested && requested.length > 0
      ? requested
      : ['claude', 'agy', 'codex', 'cursor', 'opencode'];

  const checks = await Promise.all(
    candidates.map(async (id) => {
      try {
        const ok = await AdapterFactory.getAdapter(id).isAvailable();
        return ok ? id : null;
      } catch {
        return null;
      }
    })
  );

  const available = checks.filter((x): x is ChatAgentId => x !== null);
  const pool: ChatAgentId[] = available.length > 0 ? available : ['claude'];

  if (!weeklyUsage?.byAgent) return pool;

  return [...pool].sort((a, b) => {
    const tokensA = weeklyUsage.byAgent[a]?.tokens ?? 0;
    const tokensB = weeklyUsage.byAgent[b]?.tokens ?? 0;
    return tokensA - tokensB;
  });
}

/** Runs a local shell test/check command with zero LLM tokens. */
async function runZeroTokenVerify(cmd: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  const safe = parseTestCommand(`TEST_COMMAND: ${cmd}`);
  if (!safe) return { ok: true, output: '' };
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ok: true, output: '' };
  try {
    const { stdout, stderr } = await execFileAsync(parts[0], parts.slice(1), {
      cwd,
      timeout: 60_000,
      windowsHide: true,
    });
    return { ok: true, output: `${stdout}\n${stderr}`.trim() };
  } catch (err: any) {
    const out = `${err?.stdout || ''}\n${err?.stderr || ''}\n${err?.message || ''}`.trim();
    return { ok: false, output: out };
  }
}

/** Removes the closing `NEXT: <agent>` / `DONE` line an agent uses to pass the turn. */
export function stripTurnControl(text: string): string {
  return text
    .replace(/\s*(NEXT|SIRA)\s*:\s*[a-zA-Z_-]+\s*$/i, '')
    .replace(/\s*(DONE|TAMAM|BİTTİ)\s*\.?\s*$/i, '')
    .trim();
}

/** Reads who the agent handed the turn to, or whether it called the work done. */
export function parseTurnControl(
  text: string,
  team: ChatAgentId[]
): { next?: ChatAgentId; done: boolean } {
  const tail = text.trim().split(/\r?\n/).slice(-3).join('\n');
  const done = /(^|\n)\s*(DONE|TAMAM|BİTTİ)\s*\.?\s*$/i.test(tail);
  const m = tail.match(/(NEXT|SIRA)\s*:\s*([a-zA-Z_-]+)/i);
  const named = m?.[2]?.toLowerCase() as ChatAgentId | undefined;
  return { next: named && team.includes(named) ? named : undefined, done };
}

function nextSpeaker(team: ChatAgentId[], current: ChatAgentId): ChatAgentId {
  const i = team.indexOf(current);
  return team[(i + 1) % team.length];
}

/** The prompt for one turn of the team conversation. */
export function buildConversationPrompt(p: {
  isTr: boolean;
  request: string;
  rules: string;
  history: string;
  team: ChatAgentId[];
  speaker: ChatAgentId;
  conversation: Array<{ agent: ChatAgentId; text: string; files: string[] }>;
  lastTurn: boolean;
}): string {
  const me = p.speaker.toUpperCase();
  const others = p.team.filter((a) => a !== p.speaker);
  // Recent turns in full, older ones shortened, so long talks stay affordable.
  const lines = p.conversation.map((t, i) => {
    const recent = i >= p.conversation.length - 4;
    const body = recent ? t.text.slice(0, 1800) : `${t.text.replace(/\s+/g, ' ').slice(0, 240)}…`;
    const files = t.files.length ? ` [${p.isTr ? 'değiştirdi' : 'changed'}: ${t.files.join(', ')}]` : '';
    return `${t.agent.toUpperCase()}${files}:\n${body}`;
  });
  const last = p.conversation[p.conversation.length - 1];

  if (p.isTr) {
    return [
      `Bir yazılım ekibinin sohbetindesin. Ekip: ${p.team.map((a) => a.toUpperCase()).join(', ')}. Sen ${me}'sin.`,
      `Kullanıcının isteği: "${p.request}"`,
      p.rules ? `Proje kuralları: ${p.rules}` : '',
      p.history ? `Önceki sohbet:\n${p.history}` : '',
      lines.length ? `Ekip sohbeti şu ana kadar:\n\n${lines.join('\n\n')}` : '',
      last
        ? `Doğrudan ${last.agent.toUpperCase()}'a yanıt ver. Katıldığın yerde bunu söyle, katılmadığın yerde nedenini açıkla. Güvenlik açığı (doğrulanmamış girdi, enjeksiyon, gizli bilgi, yetki), hata ya da daha iyi bir tasarım görürsen "Şöyle olsa daha iyi olur: …" diye öner. Ekip arkadaşının değiştirdiği dosyalara bakıp incele.`
        : `Konuşmayı sen açıyorsun: isteği nasıl ele alacağınızı öner, işi kimin hangi kısmını yapacağını teklif et ve uygun gördüğün kısmı yapmaya başla.`,
      'Yapılması gereken ve senin üstlendiğin bir iş varsa dosyalarda doğrudan uygula; ne yaptığını kısaca anlat. Sadece konuşmak yeterliyse dosyalara dokunma.',
      p.lastTurn
        ? 'Bu son tur: açık kalan bir şey varsa kullanıcıya kısaca söyle ve son satıra DONE yaz.'
        : `Son satıra tek başına ya sözü devrettiğin ajanı (NEXT: ${others.join(' | ') || p.speaker}) ya da iş bittiyse ve ekip hemfikirse DONE yaz.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  return [
    `You are in a software team's chat. Team: ${p.team.map((a) => a.toUpperCase()).join(', ')}. You are ${me}.`,
    `The user's request: "${p.request}"`,
    p.rules ? `Project rules: ${p.rules}` : '',
    p.history ? `Earlier chat:\n${p.history}` : '',
    lines.length ? `Team conversation so far:\n\n${lines.join('\n\n')}` : '',
    last
      ? `Reply directly to ${last.agent.toUpperCase()}. Say where you agree; where you don't, say why. If you see a security hole (unvalidated input, injection, secrets, authorization), a bug or a better design, propose it as "It would be better if …". Look over the files your teammate changed.`
      : 'You open the conversation: propose how to approach the request, offer who does which part, and start on the part you take.',
    'If there is work you take on, apply it in the files directly and say briefly what you did. If talking is enough, leave the files alone.',
    p.lastTurn
      ? 'This is the last turn: tell the user briefly about anything left open and end with DONE.'
      : `End with a line that is either the agent you hand over to (NEXT: ${others.join(' | ') || p.speaker}) or DONE if the work is finished and the team agrees.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const MENTION_ALIASES: Record<string, ChatAgentId> = {
  claude: 'claude',
  claudecode: 'claude',
  codex: 'codex',
  agy: 'agy',
  antigravity: 'agy',
  cursor: 'cursor',
  opencode: 'opencode',
  gemini: 'gemini',
};

/**
 * Reads every `@agent` in a prompt, in order and without repeats. Leading
 * mentions (`@claude @cursor …`) are cut from the prompt and returned in
 * `leading`; ones inside the sentence stay, since they are part of the ask.
 */
export function extractMentionedAgents(
  prompt: string,
  allowedAgents?: ChatAgentId[]
): { agents: ChatAgentId[]; leading: ChatAgentId[]; cleanPrompt: string } {
  const known = (raw: string): ChatAgentId | undefined => {
    const target = MENTION_ALIASES[raw.toLowerCase()];
    return target && (!allowedAgents || allowedAgents.includes(target)) ? target : undefined;
  };
  const agents: ChatAgentId[] = [];
  const add = (a?: ChatAgentId) => {
    if (a && !agents.includes(a)) agents.push(a);
  };

  let rest = prompt;
  for (;;) {
    const m = rest.match(/^\s*@([a-zA-Z0-9_-]+)(?:\s*[:,&+]|\s+(?:ve|and|ile)\b)?\s*/i);
    const target = m ? known(m[1]) : undefined;
    if (!m || !target) break;
    add(target);
    rest = rest.slice(m[0].length);
  }
  const leading = [...agents];
  for (const m of rest.matchAll(/(?:^|\s)@([a-zA-Z0-9_-]+)/g)) add(known(m[1]));

  const cleanPrompt = rest.trim();
  return { agents, leading, cleanPrompt: leading.length && cleanPrompt ? cleanPrompt : prompt };
}

/** Detects `@agent` mention at the start of a prompt to route tasks directly. */
export function extractMentionedAgent(
  prompt: string,
  allowedAgents?: ChatAgentId[]
): { agent?: ChatAgentId; cleanPrompt: string } {
  const { leading, cleanPrompt } = extractMentionedAgents(prompt, allowedAgents);
  return { agent: leading[0], cleanPrompt };
}

export class TeamChatCoordinator {
  private aborted = false;
  private abortController = new AbortController();
  private approve?: TeamChatOptions['onToolApproval'];

  stop(): void {
    this.aborted = true;
    this.abortController.abort();
  }

  async run(opts: TeamChatOptions): Promise<void> {
    this.aborted = false;
    this.abortController = new AbortController();
    this.approve = opts.onToolApproval;
    const isTr = (opts.lang ?? 'tr').startsWith('tr');
    const memory = new MemoryStore(opts.cwd);
    const memorySnippet = memory.toPromptSnippet().slice(0, 500);
    const gitUtils = new GitUtils(opts.cwd);

    // `@agent` mentions: one routes the task, two or more make those agents the team.
    const mentions = extractMentionedAgents(opts.prompt);
    const mentioned = { agent: mentions.leading[0] };
    const effectivePrompt = mentions.cleanPrompt;
    const mentionedTeam = mentions.agents.length >= 2 ? mentions.agents : undefined;
    const modelFor = (a: ChatAgentId): AgentModelChoice => opts.teamModels?.[a] ?? {};

    // Compact recent history (last 4 turns, max 160 chars each) so context never explodes
    const compactHistory = (opts.history ?? [])
      .slice(-4)
      .map((h) => `${h.role === 'user' ? 'User' : (h.agent || 'Agent').toUpperCase()}: ${h.text.slice(0, 180)}`)
      .join('\n');

    if (opts.mode === 'solo' && !mentionedTeam) {
      const agent: ChatAgentId = mentioned.agent || opts.soloAgent || 'claude';
      if (mentioned.agent && mentioned.agent !== opts.soloAgent) {
        opts.onEvent({
          type: 'system_note',
          badge: `@${mentioned.agent.toUpperCase()}`,
          text: isTr
            ? `Görev kullanıcı isteği üzerine @${mentioned.agent.toUpperCase()} ajanına yönlendirildi.`
            : `Task routed to @${mentioned.agent.toUpperCase()} per user request.`,
        });
      }
      const roleLabel = isTr ? 'Tekli Ajan' : 'Solo Agent';
      await this.runSingleAgentTurn({
        agent,
        model: opts.soloModel,
        effort: opts.soloEffort,
        roleLabel,
        prompt: [
          memorySnippet ? `[Workspace Rules]\n${memorySnippet}` : '',
          compactHistory ? `[Recent Context]\n${compactHistory}` : '',
          effectivePrompt,
        ]
          .filter(Boolean)
          .join('\n\n'),
        cwd: opts.cwd,
        allowEdits: true,
        onEvent: opts.onEvent,
        isTr,
      });
      opts.onEvent({ type: 'done', savedTokensEstimate: ContextOptimizer.getTelemetry().savedTokensTotal });
      return;
    }

    // ---- TEAM MODE (Quota-Aware Autonomous Collaboration) ----
    const balancedAgents = mentionedTeam
      ? [...mentionedTeam]
      : await pickQuotaBalancedAgents(opts.teamAgents, opts.weeklyUsage);
    if (mentionedTeam) {
      opts.onEvent({
        type: 'system_note',
        badge: mentionedTeam.map((a) => `@${a.toUpperCase()}`).join(' '),
        text: isTr
          ? `Etiketlenen ajanlar birlikte çalışacak: ${mentionedTeam.map((a) => a.toUpperCase()).join(' · ')}.`
          : `The tagged agents will work together: ${mentionedTeam.map((a) => a.toUpperCase()).join(' · ')}.`,
      });
    } else if (mentioned.agent) {
      const idx = balancedAgents.indexOf(mentioned.agent);
      if (idx > -1) {
        balancedAgents.splice(idx, 1);
        balancedAgents.unshift(mentioned.agent);
      } else {
        balancedAgents.unshift(mentioned.agent);
      }
      opts.onEvent({
        type: 'system_note',
        badge: `@${mentioned.agent.toUpperCase()}`,
        text: isTr
          ? `Görevi başlatması ve koordine etmesi için @${mentioned.agent.toUpperCase()} seçildi.`
          : `Assigned to @${mentioned.agent.toUpperCase()} to lead and coordinate.`,
      });
    }

    const complexity = classifyPromptComplexity(effectivePrompt);
    const quotaBreakdown = balancedAgents
      .map((a) => {
        const used = opts.weeklyUsage?.byAgent?.[a]?.tokens ?? 0;
        return `${a.toUpperCase()}: ${used.toLocaleString()} tok`;
      })
      .join(' | ');

    opts.onEvent({
      type: 'system_note',
      badge: isTr ? 'Koordinatör' : 'Coordinator',
      text: isTr
        ? `${complexity === 'simple' || balancedAgents.length === 1 ? 'Tek adımlık iş' : 'Çok adımlı iş'} · haftalık kullanım: ${quotaBreakdown}`
        : `${complexity === 'simple' || balancedAgents.length === 1 ? 'Single-step task' : 'Multi-step task'} · weekly usage: ${quotaBreakdown}`,
    });

    // Shield 1: If the prompt is simple or only 1 agent is selected, use Fast Economy Path (1 agent).
    // Tagging two or more agents asks for a discussion, so it always goes to the team.
    if (!mentionedTeam && (complexity === 'simple' || balancedAgents.length === 1)) {
      const chosen = balancedAgents[0];
      const picked = modelFor(chosen);
      const userPicked = !!picked.model && picked.model !== 'default';
      const economyModel = userPicked
        ? picked.model
        : chosen === 'claude'
        ? 'haiku'
        : chosen === 'agy' || chosen === 'gemini'
        ? 'gemini-3.8-flash-high'
        : chosen === 'codex'
        ? 'gpt-5.4-mini'
        : undefined;

      opts.onEvent({
        type: 'system_note',
        badge: isTr ? '⚡ Kota Koruma Modu' : '⚡ Smart Quota Saver',
        text: isTr
          ? `Görev tek adımda çözülebilecek boyutta olduğu için gereksiz tartışma başlatılmadı; en uygun ajan (${chosen.toUpperCase()}) seçildi. Tartışma istersen birden fazla ajanı @ ile etiketle.`
          : `Handled in a single step by ${chosen.toUpperCase()} to preserve your weekly agent quotas. Tag two or more agents with @ to make them discuss it.`,
      });

      await this.runSingleAgentTurn({
        agent: chosen,
        model: economyModel,
        effort: picked.effort,
        roleLabel: isTr ? 'Hızlı Çözüm Ajanı' : 'Fast Resolver',
        prompt: [
          memorySnippet ? `[Workspace Rules]\n${memorySnippet}` : '',
          compactHistory ? `[Recent Context]\n${compactHistory}` : '',
          effectivePrompt,
        ]
          .filter(Boolean)
          .join('\n\n'),
        cwd: opts.cwd,
        allowEdits: true,
        onEvent: opts.onEvent,
        isTr,
      });
      opts.onEvent({ type: 'done', savedTokensEstimate: 1200 });
      return;
    }

    // Multi-agent collaborative workflow: an open conversation. Each agent
    // answers the previous speaker, raises security or design points, does its
    // share of the work, and picks who speaks next; the team stops when it agrees.
    const leadAgent = balancedAgents[0];
    const thirdAgent = balancedAgents[2] ?? balancedAgents[0];

    opts.onEvent({
      type: 'system_note',
      badge: isTr ? '🤝 Ortak Çalışma' : '🤝 Team Chat',
      text: isTr
        ? `Takım: ${balancedAgents.map((a) => a.toUpperCase()).join(' · ')}. Ajanlar konuşarak ilerleyecek.`
        : `Team: ${balancedAgents.map((a) => a.toUpperCase()).join(' · ')}. The agents will work it out by talking.`,
    });

    const conversation: Array<{ agent: ChatAgentId; text: string; files: string[] }> = [];
    const maxTurns = Math.min(10, 3 + balancedAgents.length * 2);
    const spoken = new Set<ChatAgentId>();
    let speaker: ChatAgentId = leadAgent;

    for (let turn = 0; turn < maxTurns; turn++) {
      if (this.aborted) return;
      const previous = conversation[conversation.length - 1];
      const prompt = buildConversationPrompt({
        isTr,
        request: effectivePrompt,
        rules: memorySnippet,
        history: compactHistory,
        team: balancedAgents,
        speaker,
        conversation,
        lastTurn: turn === maxTurns - 1,
      });

      const filesBefore = new Set(await gitUtils.getChangedFilesAsync());
      const reply = await this.runSingleAgentTurn({
        agent: speaker,
        model: modelFor(speaker).model,
        effort: modelFor(speaker).effort,
        roleLabel: previous
          ? isTr
            ? `${previous.agent.toUpperCase()}'a yanıt`
            : `to ${previous.agent.toUpperCase()}`
          : isTr
          ? 'Konuşmayı açıyor'
          : 'Opens the discussion',
        replyTo: previous?.agent,
        prompt,
        display: stripTurnControl,
        cwd: opts.cwd,
        allowEdits: true,
        onEvent: opts.onEvent,
        isTr,
      });
      if (this.aborted) return;

      const afterFiles = await gitUtils.getChangedFilesAsync();
      const touched = afterFiles.filter((f: string) => !filesBefore.has(f));
      if (touched.length > 0) {
        opts.onEvent({
          type: 'tool_card',
          agent: speaker,
          title: isTr
            ? `${speaker.toUpperCase()} → ${touched.length} dosya üzerinde çalıştı`
            : `${speaker.toUpperCase()} → updated ${touched.length} file(s)`,
          detail: touched.join(', '),
        });
      }

      conversation.push({ agent: speaker, text: stripTurnControl(reply), files: touched });
      spoken.add(speaker);

      const control = parseTurnControl(reply, balancedAgents);
      // Only stop once everyone has had a say, so no agent's objection is skipped.
      if (control.done && balancedAgents.every((a) => spoken.has(a))) break;
      speaker = control.next && control.next !== speaker ? control.next : nextSpeaker(balancedAgents, speaker);
    }

    if (this.aborted) return;

    // 4. Shield 4: Zero-Token Local Verification (runs test/typecheck locally without spending LLM tokens)
    const testCmd = detectTestCommand(opts.cwd);
    if (testCmd) {
      const verifyRes = await runZeroTokenVerify(testCmd, opts.cwd);
      if (verifyRes.ok) {
        opts.onEvent({
          type: 'tool_card',
          agent: thirdAgent,
          title: isTr
            ? `0-Token Yerel Doğrulama Geçti (${testCmd})`
            : `0-Token Local Verification Passed (${testCmd})`,
          detail: isTr
            ? 'AI kotası harcamadan yerel testler doğrulandı.'
            : 'Verified locally without spending agent tokens.',
        });
      } else {
        const compressedErr = ContextOptimizer.optimizeTerminalLog(verifyRes.output, { maxLines: 25 }).slice(0, 1200);
        opts.onEvent({
          type: 'tool_card',
          agent: thirdAgent,
          title: isTr ? `Doğrulama Uyarısı (${testCmd})` : `Verification Issue (${testCmd})`,
          detail: compressedErr.slice(0, 300),
          isError: true,
        });

        // 1 surgical repair round by the least-used agent
        if (!this.aborted) {
          const fixPrompt = isTr
            ? `Takım çalışması sonrası "${testCmd}" komutu şu hatayı verdi:\n${compressedErr}\n\nSadece bu hatayı düzeltecek minimal yamayı uygula ve 2 cümleyle açıkla.`
            : `After team changes, "${testCmd}" failed with:\n${compressedErr}\n\nApply the minimal fix and explain in 2 sentences.`;
          await this.runSingleAgentTurn({
            agent: thirdAgent,
            model: modelFor(thirdAgent).model,
            effort: modelFor(thirdAgent).effort,
            roleLabel: isTr ? 'Onarım & Doğrulama' : 'Surgical Fixer',
            prompt: fixPrompt,
            cwd: opts.cwd,
            allowEdits: true,
            onEvent: opts.onEvent,
            isTr,
          });
        }
      }
    }

    const savedEst = Math.max(1800, ContextOptimizer.getTelemetry().savedTokensTotal);
    opts.onEvent({ type: 'done', savedTokensEstimate: savedEst });
  }

  private async runSingleAgentTurn(params: {
    agent: ChatAgentId;
    model?: string;
    effort?: string;
    roleLabel: string;
    prompt: string;
    cwd: string;
    allowEdits: boolean;
    onEvent: (event: TeamChatEvent) => void;
    isTr: boolean;
    display?: (text: string) => string;
    replyTo?: ChatAgentId;
  }): Promise<string> {
    const shown = params.display ?? ((t: string) => t);
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const thinkingId = `think-${messageId}`;
    const resolvedModel = params.model && params.model !== 'default' ? params.model : undefined;
    const modelLabel = resolvedModel
      ? params.effort
        ? `${resolvedModel} · ${params.effort}`
        : resolvedModel
      : params.effort;

    params.onEvent({
      type: 'agent_start',
      messageId,
      agent: params.agent,
      roleLabel: params.roleLabel,
      model: modelLabel,
      replyTo: params.replyTo,
    });

    const extraArgs = buildModelExtraArgs(params.agent, params.model, params.effort);
    const adapter = AdapterFactory.getAdapter(params.agent, { extraArgs });

    const extractThinkingAndClean = (raw: string): { thinking: string; clean: string } => {
      const thinkBlocks: string[] = [];
      let cleaned = raw.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, (_m, inner) => {
        if (inner && inner.trim()) thinkBlocks.push(inner.trim());
        return '';
      });
      // Handle unclosed <think> while streaming
      const openMatch = cleaned.match(/<think(?:ing)?>([\s\S]*)$/i);
      if (openMatch) {
        if (openMatch[1]?.trim()) thinkBlocks.push(openMatch[1].trim());
        cleaned = cleaned.slice(0, openMatch.index);
      }
      return {
        thinking: thinkBlocks.join('\n\n').trim(),
        clean: cleaned.trim(),
      };
    };

    let liveAccumulated = '';
    const activity = (a: AgentActivity) =>
      params.onEvent({ type: 'agent_activity', messageId, agent: params.agent, activity: a });
    // Agents without step events: their stderr (progress, tool logs) as one live log row.
    let log = '';
    const logId = `log-${messageId}`;
    const onStderr = REPORTS_STEPS.has(params.agent)
      ? undefined
      : (chunk: string) => {
          const clean = cleanLogText(chunk);
          if (!clean) return;
          log = `${log}${log ? '\n' : ''}${clean}`.slice(-4000);
          const lastLine = clean.split('\n').pop() ?? '';
          activity({ id: logId, tool: 'Log', input: lastLine.slice(0, 160), status: 'running', output: log });
        };

    const res = await adapter.execute(params.prompt, {
      cwd: params.cwd,
      allowEdits: params.allowEdits,
      timeoutMs: CHAT_TURN_TIMEOUT_MS,
      usageTag: 'chat',
      onToolApproval: this.approve
        ? (req: ToolApprovalRequest) => this.approve!({ ...req, agent: params.agent })
        : undefined,
      signal: this.abortController.signal,
      onActivity: activity,
      onStderr,
      onStdout: (chunk: string) => {
        liveAccumulated += chunk;
        const { thinking, clean } = extractThinkingAndClean(liveAccumulated);
        if (thinking) {
          params.onEvent({
            type: 'thinking',
            id: thinkingId,
            agent: params.agent,
            roleLabel: params.roleLabel,
            model: modelLabel,
            streaming: true,
            text: thinking,
          });
        }
        if (clean) {
          params.onEvent({ type: 'agent_chunk', messageId, agent: params.agent, text: shown(clean) });
        }
      },
    });

    if (log) activity({ id: logId, tool: 'Log', status: res.exitCode === 0 ? 'done' : 'error', output: log });
    if (res.timedOut) {
      params.onEvent({
        type: 'tool_card',
        agent: params.agent,
        title: params.isTr
          ? `${params.agent.toUpperCase()} ${CHAT_TURN_TIMEOUT_MS / 60_000} dakikada bitiremedi, turu kesildi`
          : `${params.agent.toUpperCase()} hit the ${CHAT_TURN_TIMEOUT_MS / 60_000}-minute limit; its turn was cut off`,
        isError: true,
      });
    }

    const rawFull = (res.stdout || res.stderr || '').trim();
    const { thinking: rawThinking, clean: cleanText } = extractThinkingAndClean(rawFull);
    // Codex and Cursor stream their reasoning live but leave it out of the final answer.
    const finalThinking = rawThinking || extractThinkingAndClean(liveAccumulated).thinking;
    const text = cleanText || rawFull || (params.isTr ? '(Yanıt tamamlandı)' : '(Completed)');
    const tokensUsed = res.usage ? res.usage.inputTokens + res.usage.outputTokens : undefined;

    if (finalThinking) {
      params.onEvent({
        type: 'thinking',
        id: thinkingId,
        agent: params.agent,
        roleLabel: params.roleLabel,
        model: modelLabel,
        streaming: false,
        text: finalThinking,
      });
    }

    params.onEvent({
      type: 'agent_done',
      messageId,
      agent: params.agent,
      roleLabel: params.roleLabel,
      text: shown(text) || text,
      model: modelLabel,
      tokensUsed,
      costUsd: res.usage?.costUsd,
    });

    return text;
  }
}
