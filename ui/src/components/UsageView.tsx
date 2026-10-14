import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner.js';
import { AgentLogo } from './AgentLogo.js';
import { MONO, SectionLabel } from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

/** Same shape as UsageTotals / UsageSummary in src/engine/usageLedger.ts. */
interface Totals {
  calls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  costUsd: number;
  unpricedCalls: number;
}
interface Summary {
  total: Totals;
  byAgent: Record<string, Totals>;
  byProject: Record<string, Totals>;
  byDay: { day: string; totals: Totals }[];
}

type Period = 'today' | 'week' | 'month' | 'all';

const since = (period: Period): number => {
  if (period === 'all') return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - 6);
  if (period === 'month') start.setDate(start.getDate() - 29);
  return start.getTime();
};

/** "$12", "$1.99", "$0.31", "$0.004". */
export const formatUsd = (usd: number) => `$${usd.toFixed(usd >= 100 ? 0 : usd === 0 || usd >= 0.1 ? 2 : 3)}`;

export const formatCount = (n: number, lang: string) =>
  new Intl.NumberFormat(lang, { notation: n >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

const projectName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;

/** Real token use and cost of the agents, from what the CLIs reported. */
export const UsageView: React.FC<{ cwd?: string }> = ({ cwd }) => {
  const { t, lang } = useI18n();
  const h = t.history;
  const [period, setPeriod] = useState<Period>('week');
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = () =>
    window.warpApi
      ?.getUsageSummary?.(since(period), cwd)
      .then((s: Summary) => setSummary(s))
      .catch(() => setSummary(null));

  useEffect(() => {
    setSummary(null);
    void load();
    const onChange = () => void load();
    window.addEventListener('vulgr:runs-changed', onChange);
    return () => window.removeEventListener('vulgr:runs-changed', onChange);
  }, [period, cwd]);

  const clear = async () => {
    await window.warpApi?.clearUsage?.();
    toast.success(h.usageCleared);
    void load();
  };

  const rows = (map: Record<string, Totals>) => Object.entries(map).sort(([, a], [, b]) => b.costUsd - a.costUsd || b.tokens - a.tokens);
  const maxDay = Math.max(1, ...(summary?.byDay ?? []).map((d) => d.totals.tokens));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[8px] border border-zinc-800 bg-base-app p-0.5">
          {(['today', 'week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-[6px] px-2.5 py-1 text-[11px] transition-colors ${
                period === p ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {h.periods[p]}
            </button>
          ))}
        </div>
        {!!summary?.total.calls && (
          <button
            type="button"
            onClick={() => void clear()}
            className="ml-auto rounded-[8px] border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300"
          >
            {h.clearUsage}
          </button>
        )}
      </div>

      {!summary ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : summary.total.calls === 0 ? (
        <p className="rounded-[11px] border border-dashed border-zinc-800 px-4 py-8 text-center text-[12px] text-zinc-500">{h.usageEmpty}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              [h.cost, formatUsd(summary.total.costUsd)],
              [h.tokensLabel, formatCount(summary.total.tokens, lang)],
              [h.calls, formatCount(summary.total.calls, lang)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[11px] border border-zinc-800 bg-base-elevated/60 px-3.5 py-3">
                <p className={`text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{label}</p>
                <p className="mt-1 text-[20px] tabular-nums text-zinc-100">{value}</p>
              </div>
            ))}
          </div>
          {summary.total.unpricedCalls > 0 && <p className="text-[11px] text-amber-300/80">{h.lowerBound(summary.total.unpricedCalls)}</p>}

          {summary.byDay.length > 1 && (
            <div>
              <SectionLabel>{h.perDay}</SectionLabel>
              <div className="flex h-24 items-end gap-1 rounded-[11px] border border-zinc-800 bg-base-app px-3 pb-2 pt-3">
                {summary.byDay.map(({ day, totals }) => (
                  <div
                    key={day}
                    className="group relative flex-1 rounded-t-[3px] bg-[color:var(--flow-accent)]/70 transition-colors hover:bg-[color:var(--flow-accent)]"
                    style={{ height: `${Math.max(4, (totals.tokens / maxDay) * 100)}%` }}
                    title={`${day} · ${formatCount(totals.tokens, lang)} · ${formatUsd(totals.costUsd)}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className={`grid gap-4 ${cwd ? '' : 'md:grid-cols-2'}`}>
            <UsageTable
              title={h.byAgent}
              rows={rows(summary.byAgent)}
              label={(id) => (
                <span className="flex items-center gap-2">
                  <AgentLogo id={id} name={id} size={16} />
                  {id}
                </span>
              )}
              lang={lang}
            />
            {!cwd && (
              <UsageTable
                title={h.byProject}
                rows={rows(summary.byProject)}
                label={(dir) => (
                  <span className="truncate" title={dir}>
                    {projectName(dir)}
                  </span>
                )}
                lang={lang}
              />
            )}
          </div>
        </>
      )}

      <p className="text-[10.5px] leading-relaxed text-zinc-600">{h.usageNote}</p>
    </div>
  );
};

const UsageTable: React.FC<{
  title: string;
  rows: [string, Totals][];
  label: (key: string) => React.ReactNode;
  lang: string;
}> = ({ title, rows, label, lang }) => (
  <div>
    <SectionLabel>{title}</SectionLabel>
    <ul className="divide-y divide-zinc-900 rounded-[11px] border border-zinc-800">
      {rows.map(([key, totals]) => (
        <li key={key} className="flex items-center gap-3 px-3 py-2 text-[12px] text-zinc-300">
          <span className="min-w-0 flex-1">{label(key)}</span>
          <span className={`tabular-nums text-zinc-500 ${MONO} text-[10.5px]`}>{formatCount(totals.tokens, lang)}</span>
          <span className="w-16 text-right tabular-nums text-zinc-100">
            {/* Nothing priced (e.g. only Codex): unknown, not free. */}
            {totals.unpricedCalls === totals.calls ? '—' : formatUsd(totals.costUsd)}
          </span>
        </li>
      ))}
    </ul>
  </div>
);
