import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AdapterFactory } from '../adapters/factory.js';
import { ContextOptimizer } from './contextOptimizer.js';
import { MemoryStore } from './memoryStore.js';
import { GitUtils } from '../git/gitUtils.js';
import { detectTestCommand, parseTestCommand } from './testPlan.js';
import type { UsageSummary } from './usageLedger.js';

const execFileAsync = promisify(execFile);

export type ChatAgentId = 'claude' | 'agy' | 'codex' | 'cursor' | 'opencode' | 'gemini';

export interface TeamChatTurn {
  role: 'user' | 'agent';
  agent?: ChatAgentId;
  text: string;
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
  /** Previous compact conversation turns for continuity (automatically trimmed to save tokens). */
  history?: TeamChatTurn[];
  /** Optional weekly usage summary from UsageLedger to balance load across subscriptions. */
  weeklyUsage?: UsageSummary;
  /** UI language ('tr' | 'en' | ...). */
  lang?: string;
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
    }
  | {
      type: 'agent_chunk';
      messageId: string;
      agent: ChatAgentId;
      /** The reply so far, with any <think> blocks removed. */
      text: string;
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

/** Removes the plan's `TASK: agent | title | instruction` lines (also when several share one line). */
export function stripTaskLines(text: string): string {
  return text
    .replace(/\s*TASK:[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class TeamChatCoordinator {
  private aborted = false;
  private abortController = new AbortController();

  stop(): void {
    this.aborted = true;
    this.abortController.abort();
  }

  async run(opts: TeamChatOptions): Promise<void> {
    this.aborted = false;
    this.abortController = new AbortController();
    const isTr = (opts.lang ?? 'tr').startsWith('tr');
    const memory = new MemoryStore(opts.cwd);
    const memorySnippet = memory.toPromptSnippet().slice(0, 500);
    const gitUtils = new GitUtils(opts.cwd);

    // Compact recent history (last 4 turns, max 160 chars each) so context never explodes
    const compactHistory = (opts.history ?? [])
      .slice(-4)
      .map((h) => `${h.role === 'user' ? 'User' : (h.agent || 'Agent').toUpperCase()}: ${h.text.slice(0, 180)}`)
      .join('\n');

    if (opts.mode === 'solo') {
      const agent: ChatAgentId = opts.soloAgent || 'claude';
      const roleLabel = isTr ? 'Tekli Ajan' : 'Solo Agent';
      await this.runSingleAgentTurn({
        agent,
        model: opts.soloModel,
        effort: opts.soloEffort,
        roleLabel,
        prompt: [
          memorySnippet ? `[Workspace Rules]\n${memorySnippet}` : '',
          compactHistory ? `[Recent Context]\n${compactHistory}` : '',
          opts.prompt,
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
    const balancedAgents = await pickQuotaBalancedAgents(opts.teamAgents, opts.weeklyUsage);
    const complexity = classifyPromptComplexity(opts.prompt);
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

    // Shield 1: If the prompt is simple or only 1 agent is selected, use Fast Economy Path (1 agent)
    if (complexity === 'simple' || balancedAgents.length === 1) {
      const chosen = balancedAgents[0];
      const economyModel =
        chosen === 'claude'
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
          ? `Görev tek adımda çözülebilecek boyutta olduğu için gereksiz tartışma başlatılmadı; en uygun ajan (${chosen.toUpperCase()}) seçildi.`
          : `Handled in a single step by ${chosen.toUpperCase()} to preserve your weekly agent quotas.`,
      });

      await this.runSingleAgentTurn({
        agent: chosen,
        model: economyModel,
        roleLabel: isTr ? 'Hızlı Çözüm Ajanı' : 'Fast Resolver',
        prompt: [
          memorySnippet ? `[Workspace Rules]\n${memorySnippet}` : '',
          compactHistory ? `[Recent Context]\n${compactHistory}` : '',
          opts.prompt,
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

    // Multi-agent collaborative workflow
    const leadAgent = balancedAgents[0];
    const secondAgent = balancedAgents[1] ?? balancedAgents[0];
    const thirdAgent = balancedAgents[2] ?? balancedAgents[0];

    opts.onEvent({
      type: 'system_note',
      badge: isTr ? '🤝 Ortak Çalışma & Kota Dengeleme' : '🤝 Team Mode & Quota Balancer',
      text: isTr
        ? `Aktif takım: ${balancedAgents.map((a) => a.toUpperCase()).join(' · ')}. Haftalık kotaları korumak için mikro-özet aktarımı etkin.`
        : `Active team: ${balancedAgents.map((a) => a.toUpperCase()).join(' · ')}. Micro-context handoff enabled to save tokens.`,
    });

    if (this.aborted) return;

    // 1. Lead Architect proposes brief plan and divides work among balancedAgents
    const teamListStr = balancedAgents.join(', ');
    const planPrompt = isTr
      ? [
          `Sen bu projenin Mimar ve Koordinatör ajanısın (${leadAgent.toUpperCase()}).`,
          `Takımdaki ajanlar: [${teamListStr}].`,
          `Kullanıcı İsteği: "${opts.prompt}"`,
          memorySnippet ? `Proje Kuralları: ${memorySnippet}` : '',
          'Önce <think>...</think> etiketleri içinde mimari analizini ve görevleri neden hangi ajana verdiğini 2-3 maddede düşün.',
          'Ardından çok kısa (en fazla 3-4 cümle) yaklaşımını açıkla ve işi takımdaki ajanlara 2 veya 3 somut alt görev olarak böl.',
          'Yanıtının en sonuna mutlaka şu formatta görev satırları ekle (kod yazma, sadece planla):',
          'TASK: <ajan_adi> | <kısa görev başlığı> | <yapılacak somut teknik iş>',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `You are the Lead Architect (${leadAgent.toUpperCase()}) coordinating team [${teamListStr}].`,
          `User Request: "${opts.prompt}"`,
          memorySnippet ? `Workspace Rules: ${memorySnippet}` : '',
          'Briefly explain the approach in 3-4 sentences and divide the work into 2 or 3 concrete tasks across the team.',
          'End your response with lines in this exact format (do not write code yet):',
          'TASK: <agent_name> | <short task title> | <concrete technical instruction>',
        ]
          .filter(Boolean)
          .join('\n');

    const planOutput = await this.runSingleAgentTurn({
      agent: leadAgent,
      roleLabel: isTr ? 'Mimar & Planlayıcı' : 'Lead Architect',
      prompt: planPrompt,
      // The TASK lines become the task-split card; the reply keeps only the approach.
      display: stripTaskLines,
      cwd: opts.cwd,
      allowEdits: false,
      onEvent: opts.onEvent,
      isTr,
    });

    if (this.aborted) return;

    // Parse TASK lines or build a sensible 2-step fallback division
    const parsedTasks = this.parseTasks(planOutput, balancedAgents, opts.prompt, isTr);

    opts.onEvent({
      type: 'task_plan',
      tasks: parsedTasks.map((t, i) => ({
        id: `task-${i + 1}`,
        agent: t.agent,
        roleLabel: t.roleLabel,
        title: t.title,
      })),
    });

    // 2. Quick peer review / alignment comment from the second agent (strictly capped to 2 sentences)
    if (secondAgent !== leadAgent && !this.aborted) {
      const alignPrompt = isTr
        ? [
            `${leadAgent.toUpperCase()} şu iş bölümünü önerdi:\n${parsedTasks.map((t) => `- ${t.agent}: ${t.title}`).join('\n')}`,
            `Sen ${secondAgent.toUpperCase()} ajanısın. Kendi görevin ve dikkat edilmesi gereken 1 kritik teknik nokta hakkında 2 cümlelik çok kısa bir ekip mesajı yaz (dosya değiştirme).`,
          ].join('\n')
        : [
            `${leadAgent.toUpperCase()} proposed this task breakdown:\n${parsedTasks.map((t) => `- ${t.agent}: ${t.title}`).join('\n')}`,
            `You are ${secondAgent.toUpperCase()}. Reply in 2 short sentences confirming your part and 1 key technical detail to watch out for (do not edit files yet).`,
          ].join('\n');

      await this.runSingleAgentTurn({
        agent: secondAgent,
        model: secondAgent === 'claude' ? 'haiku' : secondAgent === 'agy' ? 'gemini-2.5-flash' : undefined,
        roleLabel: isTr ? 'Teknik Görüş' : 'Peer Alignment',
        prompt: alignPrompt,
        cwd: opts.cwd,
        allowEdits: false,
        onEvent: opts.onEvent,
        isTr,
      });
    }

    // 3. Execute each sub-task with micro-context handoff (no full chat history repetition!)
    const completedSummaries: string[] = [];
    for (let i = 0; i < parsedTasks.length; i++) {
      if (this.aborted) return;
      const task = parsedTasks[i];
      const priorHandoff =
        completedSummaries.length > 0
          ? isTr
            ? `Önceki ekip arkadaşlarının tamamladığı özet:\n${completedSummaries.join('\n')}`
            : `Completed by teammates so far:\n${completedSummaries.join('\n')}`
          : '';

      const execPrompt = isTr
        ? [
            `Ana Hedef: "${opts.prompt}"`,
            `Senin Görevin (${task.agent.toUpperCase()} - ${task.title}): ${task.instruction}`,
            priorHandoff,
            'Gerekli dosya değişikliklerini doğrudan uygula ve sonunda ne yaptığını 2-3 cümleyle ekip arkadaşlarına özetle.',
          ]
            .filter(Boolean)
            .join('\n\n')
        : [
            `Overall Goal: "${opts.prompt}"`,
            `Your Assigned Task (${task.agent.toUpperCase()} - ${task.title}): ${task.instruction}`,
            priorHandoff,
            'Apply the necessary code changes directly and summarize what you changed in 2-3 sentences for your teammates.',
          ]
            .filter(Boolean)
            .join('\n\n');

      const filesBefore = new Set(await gitUtils.getChangedFilesAsync());
      const reply = await this.runSingleAgentTurn({
        agent: task.agent,
        roleLabel: `${task.roleLabel} · ${task.title}`,
        prompt: execPrompt,
        cwd: opts.cwd,
        allowEdits: true,
        onEvent: opts.onEvent,
        isTr,
      });

      const afterFiles = await gitUtils.getChangedFilesAsync();
      const touched = afterFiles.filter((f: string) => !filesBefore.has(f));
      const changedList = touched.length > 0 ? touched : afterFiles.slice(0, 5);
      if (changedList.length > 0) {
        opts.onEvent({
          type: 'tool_card',
          agent: task.agent,
          title: isTr
            ? `${task.agent.toUpperCase()} → ${changedList.length} dosya üzerinde çalıştı`
            : `${task.agent.toUpperCase()} → updated ${changedList.length} file(s)`,
          detail: changedList.join(', '),
        });
      }

      // Micro-summary (max 220 chars) for the next agent to save tokens
      const micro = reply.replace(/\s+/g, ' ').trim().slice(0, 220);
      completedSummaries.push(
        `- [${task.agent.toUpperCase()}] ${task.title}: ${micro}${changedList.length ? ` (Files: ${changedList.join(', ')})` : ''}`
      );
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

    const savedEst = Math.max(1800, parsedTasks.length * 1450 + ContextOptimizer.getTelemetry().savedTokensTotal);
    opts.onEvent({ type: 'done', savedTokensEstimate: savedEst });
  }

  private parseTasks(
    planOutput: string,
    availableAgents: ChatAgentId[],
    originalPrompt: string,
    isTr: boolean
  ): Array<{ agent: ChatAgentId; roleLabel: string; title: string; instruction: string }> {
    const lines = planOutput.split(/\r?\n/);
    const out: Array<{ agent: ChatAgentId; roleLabel: string; title: string; instruction: string }> = [];

    for (const line of lines) {
      const m = line.match(/^\s*[-*]*\s*TASK:\s*([a-zA-Z0-9_-]+)\s*\|\s*([^|]+)\|\s*(.+)$/i);
      if (m) {
        const rawAgent = m[1].toLowerCase().trim() as ChatAgentId;
        const agent = availableAgents.includes(rawAgent)
          ? rawAgent
          : availableAgents[out.length % availableAgents.length];
        const title = m[2].trim();
        const instruction = m[3].trim();
        out.push({
          agent,
          roleLabel: isTr ? `Uygulayıcı (#${out.length + 1})` : `Builder (#${out.length + 1})`,
          title,
          instruction,
        });
      }
    }

    if (out.length > 0) return out.slice(0, 3);

    // Fallback 2-part split across the top 2 quota-balanced agents
    const a1 = availableAgents[0];
    const a2 = availableAgents[1] ?? availableAgents[0];
    return [
      {
        agent: a1,
        roleLabel: isTr ? 'Çekirdek & Mantık' : 'Core Implementation',
        title: isTr ? 'Temel mantık ve veri katmanı' : 'Core logic & data layer',
        instruction: isTr
          ? `"${originalPrompt}" isteğinin çekirdek/servis mantığını uygula.`
          : `Implement the core logic for: "${originalPrompt}".`,
      },
      {
        agent: a2,
        roleLabel: isTr ? 'Arayüz & Entegrasyon' : 'Integration & Polish',
        title: isTr ? 'Entegrasyon ve uç durum kontrolü' : 'Integration & edge-case review',
        instruction: isTr
          ? `"${originalPrompt}" için yapılan değişiklikleri tamamla, arayüz/entegrasyon bağlantılarını ve uç durumları kontrol et.`
          : `Complete integration and verify edge cases for: "${originalPrompt}".`,
      },
    ];
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
    });

    const extraArgs = buildModelExtraArgs(params.agent, params.model, params.effort);
    const adapter = AdapterFactory.getAdapter(params.agent, { extraArgs });

    // Claude reasons natively; the other CLIs are asked to put a short
    // reasoning note in <think> tags so the chat can fold it away.
    const promptWithThinkingHint =
      params.agent === 'claude' || params.prompt.includes('<think>')
        ? params.prompt
        : params.isTr
        ? `Yanıtına başlamadan önce <think>...</think> etiketleri içinde kısaca nasıl düşündüğünü yaz.\n\n${params.prompt}`
        : `Before your main response, briefly note your reasoning inside <think>...</think> tags.\n\n${params.prompt}`;

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
    const res = await adapter.execute(promptWithThinkingHint, {
      cwd: params.cwd,
      allowEdits: params.allowEdits,
      usageTag: 'chat',
      signal: this.abortController.signal,
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

    const rawFull = (res.stdout || res.stderr || '').trim();
    const { thinking: finalThinking, clean: cleanText } = extractThinkingAndClean(rawFull);
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
