import React, { useEffect, useMemo, useState } from 'react';
import { Copy, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import { Spinner } from '@/components/ui/spinner.js';
import appLogo from '../assets/logo-mark.png';
import duoLoopIcon from '../assets/sidebar/duo-loop.svg';
import agentSwarmIcon from '../assets/sidebar/agent-swarm.svg';
import orchestratorIcon from '../assets/sidebar/orchestrator.svg';
import { AgentLogo } from './AgentLogo.js';
import { FLOW_DIALOG, FlowHeader, MONO, SectionLabel, accentStyle, closeOnlyOnRequest } from './FlowParts.js';
import { SystemMap, ViewToggle, formatDuration } from './SystemMap.js';
import { UsageView, formatUsd } from './UsageView.js';
import { useI18n } from '../i18n/index.js';
import type { RunKind, RunOutcome, RunRecord, RunSummary } from '../runHistory.js';

const KIND: Record<RunKind, { label: string; icon: string; accent: string }> = {
  duo: { label: 'Duo Loop', icon: duoLoopIcon, accent: '#f472b6' },
  swarm: { label: 'Agent Swarm', icon: agentSwarmIcon, accent: '#a78bfa' },
  orchestra: { label: 'Orchestrator', icon: orchestratorIcon, accent: '#f59e0b' },
};

const OUTCOME_STYLE: Record<RunOutcome, string> = {
  success: 'border-emerald-500/40 text-emerald-300',
  failed: 'border-red-500/40 text-red-300',
  stopped: 'border-zinc-700 text-zinc-400',
};

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** "5 minutes ago", in the interface language. */
function timeAgo(at: number, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const sec = Math.round((at - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ];
  let value = sec;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), 'year');
}

const projectName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;

interface RunHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The project open in the sidebar; "This project" shows only its runs. */
  cwd?: string;
  /** Open the run's dialog with its goal and team. */
  onRerun?: (run: RunRecord) => void;
}

/** Finished Duo Loop, Agent Swarm and Orchestrator runs, each with its steps and a map to play back. */
export const RunHistoryModal: React.FC<RunHistoryModalProps> = ({ isOpen, onClose, cwd, onRerun }) => {
  const { t, lang } = useI18n();
  const h = t.history;
  const [scope, setScope] = useState<'project' | 'all'>(() => (cwd ? 'project' : 'all'));
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RunRecord | null>(null);
  const [tab, setTab] = useState<'list' | 'map'>('list');

  const filterCwd = scope === 'project' && cwd ? cwd : undefined;

  const load = async () => {
    try {
      setRuns((await window.warpApi?.listRuns?.(filterCwd)) ?? []);
    } catch {
      setRuns([]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void load();
    // A run that ends while the window is open shows up right away.
    const onChange = () => void load();
    window.addEventListener('vulgr:runs-changed', onChange);
    return () => window.removeEventListener('vulgr:runs-changed', onChange);
  }, [isOpen, filterCwd]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return (runs ?? []).filter((r) => !q || r.goal.toLocaleLowerCase().includes(q));
  }, [runs, query]);

  // Keep a run selected: the first one, or the next one after a delete.
  useEffect(() => {
    if (shown.length && !shown.some((r) => r.id === selectedId)) setSelectedId(shown[0].id);
    if (!shown.length) setSelectedId(null);
  }, [shown]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let live = true;
    window.warpApi?.getRun?.(selectedId).then((r: RunRecord | null) => live && setSelected(r)).catch(() => live && setSelected(null));
    return () => {
      live = false;
    };
  }, [selectedId]);

  const remove = async (id: string) => {
    await window.warpApi?.deleteRun?.(id);
    toast.success(h.deleted);
    void load();
  };

  const clearAll = async () => {
    const n: number = (await window.warpApi?.clearRuns?.(filterCwd)) ?? 0;
    toast.success(h.cleared(n));
    void load();
  };

  const run = selected && selected.id === selectedId ? selected : null;
  const kind = run ? KIND[run.kind] : null;

  return (
    <Dialog open={isOpen} onOpenChange={closeOnlyOnRequest(onClose)}>
      <DialogContent className={`${FLOW_DIALOG} sm:max-w-[960px]`} style={accentStyle(kind?.accent ?? '#a1a1aa')}>
        <FlowHeader
          icon={appLogo}
          title={h.title}
          subtitle={h.subtitle}
          actions={<ViewToggle value={tab} onChange={setTab} labels={{ list: h.tabRuns, map: h.tabUsage }} />}
        />

        {tab === 'map' ? (
          <div className="min-h-0 space-y-4 overflow-y-auto p-5 md:max-h-[72vh]">
            {cwd && (
              <div className="flex w-fit rounded-[8px] border border-zinc-800 bg-base-app p-0.5">
                {(['project', 'all'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScope(v)}
                    className={`rounded-[6px] px-2.5 py-1 text-[11px] transition-colors ${
                      scope === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {v === 'project' ? h.thisProject : h.allProjects}
                  </button>
                ))}
              </div>
            )}
            <UsageView cwd={filterCwd} />
          </div>
        ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
          {/* List */}
          <div className="flex min-h-0 flex-col border-b border-zinc-900 md:border-b-0 md:border-r">
            <div className="space-y-2 border-b border-zinc-900 p-3">
              {cwd && (
                <div className="flex rounded-[8px] border border-zinc-800 bg-base-app p-0.5">
                  {(['project', 'all'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setScope(v)}
                      className={`flex-1 rounded-[6px] px-2.5 py-1 text-[11px] transition-colors ${
                        scope === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {v === 'project' ? h.thisProject : h.allProjects}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-zinc-800 bg-base-app px-2.5 py-1.5">
                  <Search size={12} className="flex-shrink-0 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={h.search}
                    aria-label={h.search}
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600"
                  />
                </label>
                {!!runs?.length && (
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    title={h.clearHint}
                    className="rounded-[8px] border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300"
                  >
                    {h.clear}
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 md:max-h-[64vh]">
              {runs === null ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : shown.length === 0 ? (
                <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-zinc-500">{runs.length ? h.noMatch : h.empty}</p>
              ) : (
                <ul className="space-y-1">
                  {shown.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full rounded-[10px] border px-3 py-2 text-left transition-colors ${
                          r.id === selectedId ? 'border-zinc-700 bg-base-elevated' : 'border-transparent hover:bg-base-elevated/60'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <img src={KIND[r.kind].icon} alt="" className="h-[11px] w-auto opacity-80" draggable={false} />
                          <span className={`text-[10px] text-zinc-500 ${MONO}`}>{KIND[r.kind].label}</span>
                          <span className={`ml-auto rounded-full border px-1.5 text-[9.5px] ${OUTCOME_STYLE[r.outcome]}`}>
                            {h.outcome[r.outcome]}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-zinc-200">{r.goal}</span>
                        <span className={`mt-1 block truncate text-[10px] text-zinc-500 ${MONO}`}>
                          {[
                            timeAgo(r.endedAt, lang),
                            formatDuration(r.endedAt - r.startedAt),
                            r.costUsd !== undefined ? formatUsd(r.costUsd) : '',
                            scope === 'all' && r.cwd ? projectName(r.cwd) : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Detail */}
          <div className="min-h-0 overflow-y-auto p-5 md:max-h-[72vh]">
            {!run || !kind ? (
              <p className="py-16 text-center text-[12px] text-zinc-500">{shown.length ? h.pick : ''}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug text-zinc-100">{run.goal}</p>
                    <p className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-zinc-500 ${MONO}`}>
                      <span className={`rounded-full border px-1.5 ${OUTCOME_STYLE[run.outcome]}`}>{h.outcome[run.outcome]}</span>
                      <span>{kind.label}</span>
                      <span>{new Date(run.startedAt).toLocaleString(lang)}</span>
                      <span>{h.took(formatDuration(run.endedAt - run.startedAt))}</span>
                      {run.costUsd !== undefined && <span className="text-zinc-300">{formatUsd(run.costUsd)}</span>}
                      {!!run.tokens && (
                        <span>
                          {h.tokens(formatTokens(run.tokens))}
                          {!run.tokensExact && ` (${h.estimated})`}
                        </span>
                      )}
                    </p>
                    {run.cwd && <p className={`mt-1 truncate text-[10px] text-zinc-600 ${MONO}`}>{run.cwd}</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {(run.agents ?? []).map((a) => (
                      <AgentLogo key={a} id={a} name={a} size={18} />
                    ))}
                    {onRerun && (
                      <button
                        type="button"
                        onClick={() => onRerun(run)}
                        title={h.rerunHint}
                        className="ml-1 flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:border-zinc-600"
                      >
                        <RotateCcw size={12} />
                        {h.rerun}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(run.goal);
                        toast.success(h.copied);
                      }}
                      title={h.copyGoal}
                      aria-label={h.copyGoal}
                      className="ml-1 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(run.id)}
                      title={h.delete}
                      aria-label={h.delete}
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {run.summary && <p className="rounded-[10px] border border-zinc-800 bg-base-elevated/60 px-3 py-2 text-[12px] text-zinc-300">{run.summary}</p>}

                {run.map?.nodes?.length ? (
                  <SystemMap
                    key={run.id}
                    nodes={run.map.nodes}
                    edges={run.map.edges}
                    recording={run.map.snapshots}
                    height={Math.max(230, Math.min(420, 60 * run.map.nodes.length))}
                  />
                ) : (
                  <p className="text-[11.5px] text-zinc-500">{h.noMap}</p>
                )}

                <div>
                  <SectionLabel>{h.steps}</SectionLabel>
                  {run.log?.length ? (
                    <ol className="space-y-1">
                      {run.log.map((entry, i) => (
                        <li key={i} className="flex gap-3 text-[12px] leading-relaxed">
                          <span className={`w-14 flex-shrink-0 text-right text-[10px] tabular-nums text-zinc-600 ${MONO} pt-[3px]`}>
                            {entry.at ? `+${formatDuration(entry.at - run.startedAt)}` : ''}
                          </span>
                          <span className="min-w-0 text-zinc-300">
                            {entry.who && <span className={`mr-1.5 text-[10.5px] text-zinc-500 ${MONO}`}>{entry.who}</span>}
                            {entry.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-[11.5px] text-zinc-500">{h.noSteps}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
