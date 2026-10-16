import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Square,
  Loader2,
  Terminal as TerminalIcon,
  FileDiff,
  AlertTriangle,
  GitBranch,
  RotateCcw,
  Users,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  X,
  Paperclip,
  Wrench,
  PanelRightClose,
  PanelRightOpen,
  Info,
  CornerDownRight,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer.js';
import { AgentLogo } from './AgentLogo.js';
import { ToolCall } from '../zeron/ToolCall.js';
import { Markdown } from '../zeron/Markdown.js';
import { ProjectMenu } from '../zeron/ProjectMenu.js';
import { titleFromPrompt } from '../zeron/types.js';
import {
  reduceChatEvent,
  appendUserMessage,
  initialChatState,
  type ChatReducerState,
} from '../utils/claudeStreamParser.js';
import {
  EFFORT_LABEL,
  effectiveEffort,
  effortsFor,
  groupModelFamilies,
  resolveModel,
  type ChatEffort,
  type ModelFamily,
  type ModelFlags,
  type RawModel,
} from '../utils/modelFamilies.js';
import type { ChatMessage } from '../types/warp.js';
import { useI18n } from '../i18n/index.js';

export type ChatAgentId = 'claude' | 'agy' | 'codex' | 'cursor' | 'opencode' | 'gemini';

interface ClaudeChatViewProps {
  isOpen: boolean;
  onClose: () => void;
  cwd: string;
  gitBranch: string | null;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
}

interface AgentInfo {
  id: ChatAgentId;
  label: string;
}

const AGENTS: AgentInfo[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'agy', label: 'Antigravity' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'gemini', label: 'Gemini CLI' },
];

/** Used until the main process answers with the installed CLIs' live model lists. */
const FALLBACK_MODELS: Record<ChatAgentId, RawModel[]> = {
  claude: [
    { id: 'fable', label: 'Claude Fable 5.1', thinking: true },
    { id: 'opus', label: 'Claude Opus 5.5', thinking: true },
    { id: 'sonnet', label: 'Claude Sonnet 5.5' },
    { id: 'haiku', label: 'Claude Haiku 5.5', fast: true },
  ],
  codex: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', thinking: true },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', fast: true },
  ],
  agy: [
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon', thinking: true },
    { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon', thinking: true },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash', fast: true },
    { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash', fast: true },
  ],
  cursor: [],
  opencode: [],
  gemini: [
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon', thinking: true },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash', fast: true },
  ],
};

function agentLabel(id?: string): string {
  return AGENTS.find((a) => a.id === id)?.label ?? 'Claude Code';
}

function readLocal<T>(key: string, fallback: T, parse: (raw: string) => T = (r) => r as unknown as T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : parse(raw);
  } catch {
    return fallback;
  }
}

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

/** Number of files touched by a unified diff. */
function countDiffFiles(diff: string): number {
  return (diff.match(/^diff --git /gm) || []).length;
}

// ---------------------------------------------------------------------------
// Transcript pieces
// ---------------------------------------------------------------------------

/** Reasoning shown inline; the small chevron next to the label folds it. */
const ThinkingBlock: React.FC<{ message: ChatMessage; isTr: boolean; openAll: boolean; openAllVersion: number }> = ({
  message,
  isTr,
  openAll,
  openAllVersion,
}) => {
  const [open, setOpen] = useState(openAll);
  useEffect(() => setOpen(openAll), [openAll, openAllVersion]);
  return (
    <div className="px-0.5">
      <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
        <Brain size={13} className={`flex-shrink-0 ${message.streaming ? 'text-violet-400 animate-pulse' : ''}`} />
        <span className={message.streaming ? 'text-zinc-300' : ''}>
          {message.streaming ? (isTr ? 'Düşünüyor…' : 'Thinking…') : isTr ? 'Düşünce süreci' : 'Thought process'}
        </span>
        {message.agent && <span className="text-zinc-600">· {agentLabel(message.agent)}</span>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
          title={open ? (isTr ? 'Düşünceyi gizle' : 'Hide thinking') : isTr ? 'Düşünceyi göster' : 'Show thinking'}
        >
          <ChevronRight size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="mt-1 ml-[6px] pl-3 border-l border-white/[0.08] text-[12.5px] text-zinc-500 leading-relaxed whitespace-pre-wrap break-words">
          {message.text}
        </div>
      )}
    </div>
  );
};

const AssistantBubble: React.FC<{ message: ChatMessage; isTr: boolean }> = ({ message, isTr }) => {
  const agent = message.agent || 'claude';
  const placeholder = message.streaming && !message.text;
  return (
    <div className="text-[13.5px] leading-relaxed text-zinc-200 px-0.5">
      <div className="flex flex-wrap items-center gap-1.5 mb-1 text-[11px] text-zinc-500">
        <AgentLogo id={agent} name={agentLabel(agent)} size={16} />
        <span className="font-semibold text-zinc-300">{agentLabel(agent)}</span>
        {message.replyTo ? (
          <span className="inline-flex items-center gap-1 text-zinc-500" title={isTr ? 'Yanıt verdiği ajan' : 'Replying to'}>
            <CornerDownRight size={11} />
            <AgentLogo id={message.replyTo} name={agentLabel(message.replyTo)} size={14} />
            {agentLabel(message.replyTo)}
          </span>
        ) : (
          message.roleLabel && <span>· {message.roleLabel}</span>
        )}
        {message.model && <span className="font-mono text-[10.5px] text-zinc-600">{message.model}</span>}
        {message.tokensUsed != null && (
          <span className="font-mono text-[10.5px] text-zinc-600">· {message.tokensUsed.toLocaleString()} tok</span>
        )}
        {message.streaming && <Loader2 size={11} className="animate-spin text-zinc-600" />}
      </div>
      {placeholder ? (
        <div className="text-zinc-500 text-[12.5px]">{isTr ? 'Çalışıyor…' : 'Working…'}</div>
      ) : message.streaming ? (
        <div className="whitespace-pre-wrap break-words">{message.text}</div>
      ) : (
        <Markdown>{message.text}</Markdown>
      )}
    </div>
  );
};

const NoteRow: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <div
    className={`flex items-start gap-2 px-1 text-[11.5px] leading-relaxed ${
      message.isError ? 'text-red-300/90' : 'text-zinc-500'
    }`}
  >
    {message.toolName ? (
      <Wrench size={12} className="mt-0.5 flex-shrink-0" />
    ) : (
      <Info size={12} className="mt-0.5 flex-shrink-0" />
    )}
    <span className="min-w-0 break-words">
      {message.roleLabel && <span className="font-medium text-zinc-400">{message.roleLabel} · </span>}
      {message.text}
    </span>
  </div>
);

const TaskPlanCard: React.FC<{ message: ChatMessage; isTr: boolean }> = ({ message, isTr }) => (
  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-zinc-400">
      <Users size={12} className="text-violet-400" />
      {isTr ? 'İş bölümü' : 'Task split'}
    </div>
    <div className="space-y-1">
      {message.tasks?.map((task, idx) => (
        <div key={task.id} className="flex items-center gap-2 text-[12px]">
          <span className="w-4 text-right font-mono text-[10.5px] text-zinc-600">{idx + 1}</span>
          <AgentLogo id={task.agent} name={agentLabel(task.agent)} size={16} />
          <span className="text-zinc-200 truncate">{task.title}</span>
          <span className="ml-auto text-[10.5px] text-zinc-600 flex-shrink-0">{agentLabel(task.agent)}</span>
        </div>
      ))}
    </div>
  </div>
);

const UserBubble: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <div className="flex justify-end">
    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-white/[0.08] border border-white/10 px-3.5 py-2 text-[13px] leading-relaxed text-zinc-100">
      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {message.images.map((src, i) => (
            <img key={i} src={src} alt="" className="w-20 h-20 object-cover rounded-lg border border-white/10" />
          ))}
        </div>
      )}
      {message.text && <div className="whitespace-pre-wrap break-words">{message.text}</div>}
    </div>
  </div>
);

type RenderItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool'; call: ChatMessage; result?: ChatMessage };

/** Pairs Claude's tool_use with its tool_result so each renders as one row. */
function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const resultByToolUse = new Map<string, ChatMessage>();
  for (const m of messages) {
    if (m.kind === 'tool_result' && m.toolUseId) resultByToolUse.set(m.toolUseId, m);
  }
  const consumed = new Set<string>();
  const items: RenderItem[] = [];
  for (const m of messages) {
    if (m.kind === 'tool_use') {
      const result = resultByToolUse.get(m.id);
      if (result) consumed.add(result.id);
      items.push({ kind: 'tool', call: m, result });
    } else if (m.kind === 'tool_result') {
      if (consumed.has(m.id)) continue;
      items.push({
        kind: 'tool',
        call: { id: m.id + '-call', kind: 'tool_use', text: '', toolName: 'Tool', timestamp: m.timestamp },
        result: m,
      });
    } else {
      items.push({ kind: 'message', message: m });
    }
  }
  return items;
}

const TranscriptItem: React.FC<{ item: RenderItem; isTr: boolean; openAll: boolean; openAllVersion: number }> = ({
  item,
  isTr,
  openAll,
  openAllVersion,
}) => {
  if (item.kind === 'tool') return <ToolCall call={item.call} result={item.result} />;
  const m = item.message;
  switch (m.kind) {
    case 'user':
      return <UserBubble message={m} />;
    case 'assistant':
      return <AssistantBubble message={m} isTr={isTr} />;
    case 'thinking':
      return <ThinkingBlock message={m} isTr={isTr} openAll={openAll} openAllVersion={openAllVersion} />;
    case 'system':
      return <NoteRow message={m} />;
    case 'task_plan':
      return m.tasks?.length ? <TaskPlanCard message={m} isTr={isTr} /> : null;
    default:
      return (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-[12px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span className="whitespace-pre-wrap break-words">{m.text}</span>
        </div>
      );
  }
};

// ---------------------------------------------------------------------------
// Composer menus
// ---------------------------------------------------------------------------

interface AgentModelMenuProps {
  agent: ChatAgentId;
  familyId: string;
  effort: ChatEffort;
  flags: ModelFlags;
  families: Record<ChatAgentId, ModelFamily[]>;
  available: Record<string, boolean>;
  onSelectAgent: (a: ChatAgentId) => void;
  onSelectModel: (familyId: string) => void;
  onSelectEffort: (e: ChatEffort) => void;
  onChangeFlags: (f: ModelFlags) => void;
  onRefresh: () => void;
  refreshing: boolean;
  isTr: boolean;
}

/** One menu for agent → model → effort, with effort kept separate from the model list. */
const AgentModelMenu: React.FC<AgentModelMenuProps> = ({
  agent,
  familyId,
  effort,
  flags,
  families,
  available,
  onSelectAgent,
  onSelectModel,
  onSelectEffort,
  onChangeFlags,
  onRefresh,
  refreshing,
  isTr,
}) => {
  const [open, setOpen] = useState(false);
  const list = families[agent] ?? [];
  const family = list.find((f) => f.id === familyId);
  const efforts = effortsFor(agent, family, flags);
  const shownEffort = effectiveEffort(agent, family, effort, flags);
  const thinkingOn = family?.thinkingToggle ? flags.thinking : !!family?.thinking;
  const fastOn = family?.fastToggle ? flags.fast : !!family?.fast;
  const chip = (on: boolean) =>
    `px-2 py-0.5 rounded-md text-[11.5px] transition-colors ${
      on ? 'bg-white/[0.12] text-white' : 'text-zinc-400 hover:bg-white/[0.06]'
    }`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors"
        title={isTr ? 'Ajan, model ve efor seç' : 'Choose agent, model and effort'}
      >
        <AgentLogo id={agent} name={agentLabel(agent)} size={16} />
        <span className="font-semibold text-zinc-200">{family?.label ?? agentLabel(agent)}</span>
        {shownEffort && <span className="text-zinc-500">{EFFORT_LABEL[shownEffort]}</span>}
        {thinkingOn && agent !== 'claude' && <span className="text-zinc-500">Thinking</span>}
        {fastOn && <span className="text-zinc-500">Fast</span>}
        <ChevronDown size={12} className="text-zinc-600" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 bottom-full mb-2 w-[520px] max-w-[calc(100vw-48px)] rounded-xl border border-white/10 bg-[#141416] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="flex max-h-[320px]">
              <div className="w-[150px] flex-shrink-0 border-r border-white/[0.06] p-1.5 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {isTr ? 'Ajan' : 'Agent'}
                </div>
                {AGENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelectAgent(a.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-left transition-colors ${
                      a.id === agent ? 'bg-white/[0.08] text-white' : 'text-zinc-300 hover:bg-white/[0.05]'
                    }`}
                    title={available[a.id] === false ? (isTr ? 'Kurulu değil' : 'Not installed') : a.label}
                  >
                    <AgentLogo id={a.id} name={a.label} size={16} dim={available[a.id] === false} />
                    <span className={`truncate ${available[a.id] === false ? 'text-zinc-600' : ''}`}>{a.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-0 p-1.5 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Model
                </div>
                {[{ id: 'default', label: isTr ? 'Varsayılan' : 'Default' } as ModelFamily, ...list].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(f.id);
                      setOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="truncate text-left">{f.label}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      {f.fast && <span className="text-[10px] text-zinc-500">{isTr ? 'hızlı' : 'fast'}</span>}
                      {f.id === familyId && <Check size={13} className="text-emerald-400" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/[0.06] px-2.5 py-2 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {isTr ? 'Efor' : 'Effort'}
              </span>
              {efforts.length > 0 ? (
                <div className="flex gap-0.5">
                  {efforts.map((e) => (
                    <button key={e} type="button" onClick={() => onSelectEffort(e)} className={chip(e === shownEffort)}>
                      {EFFORT_LABEL[e]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-zinc-600">
                  {isTr ? 'Efor seçeneği yok' : 'No effort levels'}
                </span>
              )}
              {(family?.thinkingToggle || family?.fastToggle) && <div className="w-px h-4 bg-white/[0.08]" />}
              {family?.thinkingToggle && (
                <button
                  type="button"
                  onClick={() => onChangeFlags({ ...flags, thinking: !flags.thinking })}
                  className={chip(flags.thinking)}
                  title={isTr ? 'Düşünen (thinking) sürümü kullan' : 'Use the thinking variant'}
                >
                  Thinking
                </button>
              )}
              {family?.fastToggle && (
                <button
                  type="button"
                  onClick={() => onChangeFlags({ ...flags, fast: !flags.fast })}
                  className={chip(flags.fast)}
                  title={isTr ? 'Hızlı (fast) sürümü kullan' : 'Use the fast variant'}
                >
                  Fast
                </button>
              )}
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]"
                title={isTr ? 'Kurulu CLI’lardan model listesini yenile' : 'Refresh models from installed CLIs'}
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin text-violet-400' : ''} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const TeamMenu: React.FC<{
  team: ChatAgentId[];
  available: Record<string, boolean>;
  onToggle: (a: ChatAgentId) => void;
  isTr: boolean;
}> = ({ team, available, onToggle, isTr }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors"
        title={isTr ? 'Ortak çalışacak ajanlar' : 'Agents in the team'}
      >
        <span className="flex -space-x-1">
          {team.map((a) => (
            <AgentLogo key={a} id={a} name={agentLabel(a)} size={16} className="ring-1 ring-[#151517]" />
          ))}
        </span>
        <span className="font-semibold text-zinc-200">
          {team.length} {isTr ? 'ajan' : team.length === 1 ? 'agent' : 'agents'}
        </span>
        <ChevronDown size={12} className="text-zinc-600" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 bottom-full mb-2 w-64 rounded-xl border border-white/10 bg-[#141416] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] p-1.5">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {isTr ? 'Takım' : 'Team'}
            </div>
            {AGENTS.map((a) => {
              const on = team.includes(a.id);
              const missing = available[a.id] === false;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onToggle(a.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
                >
                  <AgentLogo id={a.id} name={a.label} size={16} dim={missing} />
                  <span className={missing ? 'text-zinc-600' : ''}>{a.label}</span>
                  {missing && <span className="text-[10px] text-zinc-600">{isTr ? 'kurulu değil' : 'not installed'}</span>}
                  {on && <Check size={13} className="ml-auto text-emerald-400" />}
                </button>
              );
            })}
            <div className="px-2 pt-1.5 pb-1 text-[10.5px] leading-snug text-zinc-600">
              {isTr
                ? 'Basit isteklerde tek ajan çalışır; büyük işlerde lider ajan işi bölüştürür.'
                : 'Simple asks use one agent; bigger jobs are split by a lead agent.'}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface Attachment {
  id: string;
  name: string;
  mediaType: string;
  data: string;
  previewUrl: string;
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export const ClaudeChatView: React.FC<ClaudeChatViewProps> = ({
  isOpen,
  onClose,
  cwd,
  gitBranch,
  initialPrompt,
  onClearInitialPrompt,
}) => {
  const { t, lang } = useI18n();
  const isTr = lang === 'tr';
  const api = (window as any).warpApi;

  const [state, setState] = useState<ChatReducerState>(initialChatState);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [running, setRunning] = useState(false);
  const [diff, setDiff] = useState('');
  const [catalog, setCatalog] = useState<Record<string, RawModel[]>>({});
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  /** A folder picked in the chat; empty means "follow the app's working directory". */
  const [folder, setFolder] = useState('');

  const [mode, setMode] = useState<'solo' | 'team'>(() =>
    readLocal('vulgr.chatCollabMode', 'solo', (r) => (r === 'team' ? 'team' : 'solo'))
  );
  const [agent, setAgent] = useState<ChatAgentId>(() =>
    readLocal('vulgr.soloAgent', 'claude' as ChatAgentId, (r) =>
      AGENTS.some((a) => a.id === r) ? (r as ChatAgentId) : 'claude'
    )
  );
  const [modelByAgent, setModelByAgent] = useState<Record<string, string>>(() =>
    readLocal('vulgr.chatModelByAgent', {}, (r) => JSON.parse(r))
  );
  const [effort, setEffort] = useState<ChatEffort>(() =>
    readLocal('vulgr.chatEffort', 'high' as ChatEffort, (r) => r as ChatEffort)
  );
  const [flags, setFlags] = useState<ModelFlags>(() =>
    readLocal('vulgr.chatModelFlags', { thinking: true, fast: false }, (r) => JSON.parse(r))
  );
  const [team, setTeam] = useState<ChatAgentId[]>(() =>
    readLocal('vulgr.teamAgents', ['claude', 'codex'] as ChatAgentId[], (r) => {
      const parsed = JSON.parse(r);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['claude', 'codex'];
    })
  );
  const [thinkingOpen, setThinkingOpen] = useState<boolean>(() =>
    readLocal('vulgr.chatThinkingOpen', true, (r) => r !== '0')
  );
  /** Bumped by the header toggle so every block follows it, even ones folded by hand. */
  const [thinkingVersion, setThinkingVersion] = useState(0);
  const [changesOpen, setChangesOpen] = useState<boolean>(() =>
    readLocal('vulgr.chatChangesOpen', true, (r) => r !== '0')
  );

  const chatCwd = folder || cwd;
  const familyId = modelByAgent[agent] || 'default';

  /** The live Claude Code process backing this chat, reused across turns. */
  const claudeRef = useRef<{ id: string; alive: boolean; key: string; cwd: string } | null>(null);
  const teamRunIdRef = useRef('');
  /** Replies from other agents Claude hasn't seen yet; prepended to its next turn. */
  const foreignTurnsRef = useRef<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredMentionAgents = useMemo(() => {
    if (mentionQuery === null) return [];
    return AGENTS.filter(
      (a) =>
        a.id.toLowerCase().includes(mentionQuery) ||
        a.label.toLowerCase().includes(mentionQuery)
    );
  }, [mentionQuery]);

  const insertMention = useCallback(
    (targetAgent: AgentInfo) => {
      const textarea = textareaRef.current;
      const cursor = textarea?.selectionStart ?? input.length;
      const textBefore = input.slice(0, cursor);
      const textAfter = input.slice(cursor);
      const replacedBefore = textBefore.replace(/@([a-zA-Z0-9_-]*)$/, `@${targetAgent.id} `);
      const nextText = replacedBefore + textAfter;
      setInput(nextText);
      setMentionQuery(null);
      if (mode === 'solo') {
        setAgent(targetAgent.id);
      }
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = replacedBefore.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    },
    [input, mode]
  );

  useEffect(() => {
    try {
      localStorage.setItem('vulgr.chatCollabMode', mode);
      localStorage.setItem('vulgr.soloAgent', agent);
      localStorage.setItem('vulgr.chatModelByAgent', JSON.stringify(modelByAgent));
      localStorage.setItem('vulgr.chatEffort', effort);
      localStorage.setItem('vulgr.chatModelFlags', JSON.stringify(flags));
      localStorage.setItem('vulgr.teamAgents', JSON.stringify(team));
      localStorage.setItem('vulgr.chatChangesOpen', changesOpen ? '1' : '0');
      localStorage.setItem('vulgr.chatThinkingOpen', thinkingOpen ? '1' : '0');
    } catch {}
  }, [mode, agent, modelByAgent, effort, flags, team, changesOpen, thinkingOpen]);

  const families = useMemo(() => {
    const out = {} as Record<ChatAgentId, ModelFamily[]>;
    for (const a of AGENTS) {
      const live = catalog[a.id];
      out[a.id] = groupModelFamilies(Array.isArray(live) && live.length > 0 ? live : FALLBACK_MODELS[a.id]);
    }
    return out;
  }, [catalog]);
  const family = families[agent]?.find((f) => f.id === familyId);

  const loadModels = useCallback(
    async (force = false) => {
      if (!api?.getAgentModels) return;
      setRefreshingModels(true);
      try {
        const res = await api.getAgentModels(force);
        if (res && typeof res === 'object') setCatalog(res);
      } catch {
      } finally {
        setRefreshingModels(false);
      }
    },
    [api]
  );

  const refreshDiff = useCallback(async () => {
    try {
      const res = await api?.getGitDiff?.(chatCwd);
      setDiff(res?.diff || '');
    } catch {}
  }, [api, chatCwd]);

  useEffect(() => {
    if (!isOpen || !api) return;
    api.getAvailableAgents?.().then((avail: Record<string, boolean>) => avail && setAvailable(avail)).catch(() => {});
    api.getRecentProjects?.().then((list: string[]) => Array.isArray(list) && setRecentProjects(list)).catch(() => {});
    void loadModels(false);
  }, [isOpen, api, loadModels]);

  useEffect(() => {
    if (isOpen) void refreshDiff();
  }, [isOpen, refreshDiff]);

  // Claude Code stream-json events (solo Claude) and coordinator events (other agents / team).
  useEffect(() => {
    if (!isOpen || !api) return;

    const offEvent = api.onClaudeChatEvent?.(({ id, event }: { id: string; event: any }) => {
      if (id !== claudeRef.current?.id) return;
      setState((prev) => reduceChatEvent(prev, event));
      if (event?.type === 'result') {
        setRunning(false);
        void refreshDiff();
      }
    });
    const offExit = api.onClaudeChatExit?.(({ id }: { id: string }) => {
      if (id !== claudeRef.current?.id) return;
      claudeRef.current = { ...claudeRef.current, alive: false };
      setRunning(false);
      void refreshDiff();
    });

    const append = (msg: ChatMessage) => setState((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
    const stamp = () => new Date().toISOString();
    const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const offTeam = api.onTeamChatEvent?.(({ id, event }: { id: string; event: any }) => {
      if (id !== teamRunIdRef.current) return;
      switch (event.type) {
        case 'system_note':
          append({ id: uid('note'), kind: 'system', roleLabel: event.badge, text: event.text, timestamp: stamp() });
          break;
        case 'thinking':
          setState((prev) => {
            if (prev.messages.some((m) => m.id === event.id)) {
              return {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === event.id ? { ...m, text: event.text, streaming: event.streaming } : m
                ),
              };
            }
            const msg: ChatMessage = {
              id: event.id,
              kind: 'thinking',
              agent: event.agent,
              text: event.text,
              streaming: event.streaming,
              timestamp: stamp(),
            };
            // Thinking belongs above the reply it explains.
            const replyIdx = prev.messages.findIndex((m) => `think-${m.id}` === event.id);
            const messages = [...prev.messages];
            if (replyIdx >= 0) messages.splice(replyIdx, 0, msg);
            else messages.push(msg);
            return { ...prev, messages };
          });
          break;
        case 'task_plan':
          append({ id: uid('plan'), kind: 'task_plan', text: '', tasks: event.tasks, timestamp: stamp() });
          break;
        case 'agent_start':
          append({
            id: event.messageId,
            kind: 'assistant',
            agent: event.agent,
            roleLabel: mode === 'team' ? event.roleLabel : undefined,
            replyTo: event.replyTo,
            model: event.model,
            text: '',
            streaming: true,
            timestamp: stamp(),
          });
          break;
        case 'agent_chunk':
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === event.messageId ? { ...m, text: event.text ?? m.text } : m
            ),
          }));
          break;
        case 'agent_done':
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === event.messageId
                ? { ...m, text: event.text, streaming: false, tokensUsed: event.tokensUsed, costUsd: event.costUsd }
                : m
            ),
          }));
          foreignTurnsRef.current.push(`${agentLabel(event.agent)}: ${String(event.text).slice(0, 600)}`);
          void refreshDiff();
          break;
        case 'tool_card':
          append({
            id: uid('card'),
            kind: 'system',
            toolName: 'card',
            text: event.detail ? `${event.title} — ${event.detail}` : event.title,
            isError: event.isError,
            timestamp: stamp(),
          });
          void refreshDiff();
          break;
        case 'done':
          setRunning(false);
          void refreshDiff();
          break;
        case 'error':
          append({ id: uid('err'), kind: 'error', text: event.message, timestamp: stamp() });
          setRunning(false);
          break;
      }
    });

    return () => {
      offEvent?.();
      offExit?.();
      offTeam?.();
    };
  }, [isOpen, api, refreshDiff, mode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages]);

  const stopClaude = useCallback(() => {
    const cur = claudeRef.current;
    if (cur?.alive) api?.stopClaudeChat?.(cur.id);
    claudeRef.current = null;
  }, [api]);

  /** Sends one turn to Claude Code, reusing the live process while model/effort/folder stay the same. */
  const sendToClaude = useCallback(
    (text: string, images: Array<{ mediaType: string; data: string }>) => {
      const { model, effort: eff } = resolveModel('claude', family, effort, flags);
      const key = `${chatCwd}|${model}|${eff ?? ''}`;
      const foreign = foreignTurnsRef.current;
      foreignTurnsRef.current = [];
      const prompt =
        foreign.length > 0
          ? `${isTr ? '[Bu sohbette diğer ajanların yanıtları]' : '[Replies from other agents in this chat]'}\n${foreign.join(
              '\n\n'
            )}\n\n${text}`
          : text;
      const imgs = images.length > 0 ? images : undefined;

      const cur = claudeRef.current;
      if (cur && cur.alive && cur.key === key) {
        api?.sendClaudeChat?.(cur.id, prompt, imgs);
        return;
      }
      // Model, effort or folder changed (or the process ended): start a new
      // process that resumes the same Claude conversation when it can.
      const resume = cur && cur.cwd === chatCwd ? stateRef.current.meta.claudeSessionId : undefined;
      if (cur?.alive) api?.stopClaudeChat?.(cur.id);
      const id = `chat-${Date.now()}`;
      claudeRef.current = { id, alive: true, key, cwd: chatCwd };
      api?.startClaudeChat?.({
        id,
        prompt,
        cwd: chatCwd,
        model,
        effort: eff,
        images: imgs,
        resumeSessionId: resume || undefined,
      });
    },
    [api, chatCwd, effort, family, flags, isTr]
  );

  const sendPrompt = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if ((!text && attachments.length === 0) || running) return;
      const images = attachments.map((a) => ({ mediaType: a.mediaType, data: a.data }));
      const previews = attachments.map((a) => a.previewUrl);
      setInput('');
      setAttachments([]);
      setMentionQuery(null);
      setState((prev) => appendUserMessage(prev, text, previews));
      setRunning(true);

      const mentionMatch = text.match(/^\s*@([a-zA-Z0-9_-]+)[:,\s]?\s*/i);
      const mentionedRaw = mentionMatch?.[1]?.toLowerCase();
      const aliasMap: Record<string, ChatAgentId> = {
        claude: 'claude',
        claudecode: 'claude',
        codex: 'codex',
        agy: 'agy',
        antigravity: 'agy',
        cursor: 'cursor',
        opencode: 'opencode',
        gemini: 'gemini',
      };
      const mentionedAgent = mentionedRaw ? aliasMap[mentionedRaw] : undefined;
      const effectiveAgent = (mode === 'solo' && mentionedAgent) ? mentionedAgent : agent;
      if (mentionedAgent && mode === 'solo' && mentionedAgent !== agent) {
        setAgent(mentionedAgent);
      }

      if (mode === 'solo' && effectiveAgent === 'claude') {
        const promptWithoutMention = text.replace(mentionMatch?.[0] || '', '').trim() || text;
        sendToClaude(promptWithoutMention, images);
        return;
      }

      const history = stateRef.current.messages
        .filter((m) => (m.kind === 'user' || m.kind === 'assistant') && m.text)
        .slice(-8)
        .map((m) => ({ role: (m.kind === 'user' ? 'user' : 'agent') as 'user' | 'agent', agent: m.agent, text: m.text }));
      foreignTurnsRef.current.push(`${isTr ? 'Kullanıcı' : 'User'}: ${text}`);

      const targetFamily = families[effectiveAgent]?.find((f) => f.id === (modelByAgent[effectiveAgent] || 'default'));
      const { model, effort: eff } = resolveModel(effectiveAgent, targetFamily, effort, flags);
      const id = `tc-${Date.now()}`;
      teamRunIdRef.current = id;
      void api?.runTeamChat?.({
        id,
        prompt: text,
        cwd: chatCwd,
        mode,
        soloAgent: effectiveAgent,
        soloModel: model,
        soloEffort: eff,
        teamAgents: team,
        history,
        lang,
      });
    },
    [attachments, running, mode, agent, sendToClaude, isTr, families, modelByAgent, effort, flags, api, chatCwd, team, lang]
  );

  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt.trim()) {
      sendPrompt(initialPrompt);
      onClearInitialPrompt?.();
    }
  }, [isOpen, initialPrompt, sendPrompt, onClearInitialPrompt]);

  const handleStop = useCallback(() => {
    const cur = claudeRef.current;
    if (cur?.alive) {
      api?.stopClaudeChat?.(cur.id);
      claudeRef.current = { ...cur, alive: false };
    }
    if (teamRunIdRef.current) void api?.stopTeamChat?.();
    teamRunIdRef.current = '';
    setRunning(false);
  }, [api]);

  const handleNewChat = useCallback(() => {
    stopClaude();
    if (teamRunIdRef.current) void api?.stopTeamChat?.();
    teamRunIdRef.current = '';
    foreignTurnsRef.current = [];
    setRunning(false);
    setState(initialChatState());
  }, [api, stopClaude]);

  const changeFolder = useCallback(
    (dir: string) => {
      if (!dir || dir === chatCwd) return;
      // A Claude session is tied to its folder; the next turn starts fresh there.
      stopClaude();
      setFolder(dir === cwd ? '' : dir);
      setRecentProjects((prev) => [dir, ...prev.filter((p) => p !== dir)].slice(0, 12));
      if (stateRef.current.messages.length > 0) {
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: `note-${Date.now()}`,
              kind: 'system',
              text: isTr ? `Klasör değişti: ${dir}` : `Folder changed: ${dir}`,
              timestamp: new Date().toISOString(),
            },
          ],
        }));
      }
    },
    [chatCwd, cwd, isTr, stopClaude]
  );

  const pickFolder = useCallback(async () => {
    const dir = await api?.pickChatFolder?.();
    if (dir) changeFolder(dir);
  }, [api, changeFolder]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || '');
        const data = url.split(',')[1] || '';
        setAttachments((prev) => [
          ...prev,
          { id: `${Date.now()}-${file.name}`, name: file.name, mediaType: file.type, data, previewUrl: url },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const toggleTeamAgent = useCallback((id: ChatAgentId) => {
    setTeam((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((a) => a !== id) : prev) : [...prev, id]));
  }, []);

  const items = useMemo(() => buildRenderItems(state.messages), [state.messages]);
  const firstUser = state.messages.find((m) => m.kind === 'user');
  const title = firstUser ? titleFromPrompt(firstUser.text) : isTr ? 'Yeni sohbet' : 'New chat';
  const fileCount = useMemo(() => countDiffFiles(diff), [diff]);
  const canAttach = mode === 'solo' && agent === 'claude';
  const empty = state.messages.length === 0;

  if (!isOpen) return null;

  const placeholder = running
    ? isTr
      ? 'Ajan çalışıyor…'
      : 'Agent is working…'
    : isTr
    ? 'Mesaj yaz veya @ ile ajan ata (@claude, @cursor, @agy...)'
    : 'Type a message or use @ to assign (@claude, @cursor, @agy...)';

  const composer = (
    <div className="relative rounded-2xl border border-white/10 bg-[#151517] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_18px_40px_-12px_rgba(0,0,0,0.7)] focus-within:border-white/20 transition-colors">
      {mentionQuery !== null && filteredMentionAgents.length > 0 && (
        <div className="absolute bottom-full left-3 mb-2 z-50 min-w-[240px] max-w-[320px] rounded-xl border border-white/10 bg-[#18181b] p-1.5 shadow-2xl backdrop-blur-md">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/[0.06] mb-1 flex items-center justify-between">
            <span>{isTr ? 'Ajan Ata' : 'Assign Agent'}</span>
            <span className="text-[10px] text-zinc-500 font-normal">↑↓ Gezin · ↵ Seç</span>
          </div>
          <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
            {filteredMentionAgents.map((a, idx) => {
              const active = idx === mentionIndex;
              const isMissing = available[a.id] === false;
              return (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(a);
                  }}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors text-left ${
                    active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/[0.05]'
                  } ${isMissing ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AgentLogo id={a.id} name={a.label} size={16} />
                    <span className="font-semibold text-emerald-400">@{a.id}</span>
                    <span className="text-zinc-400 text-[12px] truncate">{a.label}</span>
                  </div>
                  {isMissing && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 flex-shrink-0">
                      {isTr ? 'Yüklü Değil' : 'Not Installed'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div key={a.id} className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/10 group">
              <img src={a.previewUrl} alt={a.name} className="w-full h-full object-cover" />
              <button
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-zinc-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        autoFocus
        value={input}
        onChange={(e) => {
          const val = e.target.value;
          setInput(val);
          const cursor = e.target.selectionStart ?? val.length;
          const textBefore = val.slice(0, cursor);
          const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_-]*)$/);
          if (match) {
            setMentionQuery(match[1].toLowerCase());
            setMentionIndex(0);
          } else {
            setMentionQuery(null);
          }
        }}
        onKeyDown={(e) => {
          if (mentionQuery !== null && filteredMentionAgents.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMentionIndex((i) => (i + 1) % filteredMentionAgents.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMentionIndex((i) => (i - 1 + filteredMentionAgents.length) % filteredMentionAgents.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              const target = filteredMentionAgents[mentionIndex] ?? filteredMentionAgents[0];
              if (target) insertMention(target);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setMentionQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPrompt(input);
          }
        }}
        onPaste={(e) => {
          const files = e.clipboardData?.files;
          if (canAttach && files && Array.from(files).some((f) => f.type.startsWith('image/'))) addFiles(files);
        }}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent outline-none px-4 pt-3.5 pb-1 text-[14px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 max-h-56 min-h-[52px]"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-3 text-[12px] select-none min-w-0">
          {canAttach && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                title={isTr ? 'Görsel ekle' : 'Attach images'}
              >
                <Paperclip size={15} />
              </button>
            </>
          )}
          <div className="inline-flex items-center rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]">
            {(['solo', 'team'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] transition-colors ${
                  mode === m ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={
                  m === 'solo'
                    ? isTr
                      ? 'Tek ajanla çalış'
                      : 'Work with one agent'
                    : isTr
                    ? 'Seçili ajanlar işi birlikte yapar'
                    : 'Selected agents work together'
                }
              >
                {m === 'solo' ? <Bot size={12} /> : <Users size={12} />}
                {m === 'solo' ? (isTr ? 'Tekli' : 'Solo') : isTr ? 'Ortak' : 'Team'}
              </button>
            ))}
          </div>
          {mode === 'solo' ? (
            <AgentModelMenu
              agent={agent}
              familyId={familyId}
              effort={effort}
              flags={flags}
              families={families}
              available={available}
              onSelectAgent={setAgent}
              onSelectModel={(id) => setModelByAgent((prev) => ({ ...prev, [agent]: id }))}
              onSelectEffort={setEffort}
              onChangeFlags={setFlags}
              onRefresh={() => void loadModels(true)}
              refreshing={refreshingModels}
              isTr={isTr}
            />
          ) : (
            <TeamMenu team={team} available={available} onToggle={toggleTeamAgent} isTr={isTr} />
          )}
        </div>
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            className="w-8 h-8 flex-shrink-0 rounded-full bg-zinc-200 hover:bg-white text-black flex items-center justify-center transition-colors"
            title={t.terminal.stopHint}
          >
            <Square size={13} className="fill-black" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => sendPrompt(input)}
            disabled={!input.trim() && attachments.length === 0}
            className="w-8 h-8 flex-shrink-0 rounded-full bg-zinc-200 enabled:hover:bg-white disabled:bg-zinc-700 disabled:text-zinc-500 text-black flex items-center justify-center transition-colors"
            title={t.terminal.send}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );

  const folderMenu = (
    <ProjectMenu
      repo={baseName(chatCwd) || (isTr ? 'Klasör seç' : 'Pick folder')}
      cwd={chatCwd}
      recentProjects={recentProjects}
      onOpenFolder={() => void pickFolder()}
      onSelectProject={changeFolder}
    />
  );
  const branch = chatCwd === cwd ? gitBranch : null;

  return (
    <div className="absolute inset-0 z-30 flex bg-base-app">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06]">
          <span className="text-[13px] font-medium text-zinc-200 truncate">{title}</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            {!empty && folderMenu}
            {!empty && branch && (
              <span className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                <GitBranch size={12} /> {branch}
              </span>
            )}
            <div className="w-px h-4 bg-white/[0.08]" />
            <button
              onClick={() => {
                setThinkingOpen((v) => !v);
                setThinkingVersion((v) => v + 1);
              }}
              className={`p-1.5 rounded-md transition-colors ${
                thinkingOpen ? 'text-violet-300 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
              title={
                thinkingOpen
                  ? isTr
                    ? 'Tüm düşünce süreçlerini kapat'
                    : 'Fold all thinking'
                  : isTr
                  ? 'Tüm düşünce süreçlerini aç'
                  : 'Show all thinking'
              }
            >
              <Brain size={14} />
            </button>
            <button
              onClick={handleNewChat}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
              title={t.terminal.newChatHint}
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setChangesOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[12px] transition-colors ${
                changesOpen ? 'text-zinc-200 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
              }`}
              title={changesOpen ? (isTr ? 'Değişiklikleri gizle' : 'Hide changes') : isTr ? 'Değişiklikleri göster' : 'Show changes'}
            >
              {changesOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              {fileCount > 0 && <span className="font-mono text-[11px]">{fileCount}</span>}
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] border border-white/[0.06]"
              title={isTr ? 'Terminal görünümüne geç' : 'Switch to the terminal view'}
            >
              <TerminalIcon size={13} /> {isTr ? 'Terminal' : 'Terminal'}
            </button>
          </div>
        </div>

        {empty ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-[680px] -mt-12">
              <h2 className="text-center text-[22px] font-semibold text-zinc-100 mb-1">
                {mode === 'team'
                  ? isTr
                    ? 'Ajanlar birlikte çalışsın'
                    : 'Let the agents work together'
                  : isTr
                  ? 'Ne yapalım?'
                  : 'What are we doing?'}
              </h2>
              <p className="text-center text-[12.5px] text-zinc-500 mb-5">
                {mode === 'team'
                  ? isTr
                    ? 'İsteğini yaz; seçtiğin ajanlar kotalarını dengeleyerek işi bölüşür.'
                    : 'Describe the goal; your agents split the work and balance their quotas.'
                  : isTr
                  ? 'Ajanı, modeli ve eforu aşağıdan seç.'
                  : 'Pick the agent, model and effort below.'}
              </p>
              <div className="flex items-center justify-end gap-4 mb-2 pr-1">
                {folderMenu}
                {branch && (
                  <span className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                    <GitBranch size={12} /> {branch}
                  </span>
                )}
              </div>
              {composer}
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-[760px] mx-auto w-full px-5 py-5 space-y-2.5">
                {items.map((item) => (
                  <TranscriptItem
                    key={item.kind === 'tool' ? item.call.id : item.message.id}
                    item={item}
                    isTr={isTr}
                    openAll={thinkingOpen}
                    openAllVersion={thinkingVersion}
                  />
                ))}
                {running && !state.messages.some((m) => m.streaming) && (
                  <div className="flex items-center gap-2 text-[12px] text-zinc-500 px-0.5">
                    <Loader2 size={13} className="animate-spin" /> {t.terminal.working}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 pt-1">
              <div className="max-w-[760px] mx-auto w-full">{composer}</div>
            </div>
          </>
        )}
      </div>

      {changesOpen && (
        <div className="w-[360px] flex-shrink-0 border-l border-white/[0.06] bg-black/20 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-300">
              <FileDiff size={13} className="text-zinc-500" /> {t.terminal.changes}
              {fileCount > 0 && <span className="font-mono text-[11px] text-zinc-500">{fileCount}</span>}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => void refreshDiff()}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
                title={t.terminal.refreshDiff}
              >
                <RotateCcw size={12} />
              </button>
              <button
                onClick={() => setChangesOpen(false)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
                title={isTr ? 'Kapat' : 'Close'}
              >
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <DiffViewer diff={diff} />
          </div>
        </div>
      )}
    </div>
  );
};
