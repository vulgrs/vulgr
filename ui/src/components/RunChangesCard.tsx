import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Spinner } from '@/components/ui/spinner.js';
import { DiffViewer, parseGitDiff } from './DiffViewer.js';
import { CommitBox } from './CommitBox.js';
import { MONO, SectionLabel } from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

/** Files with uncommitted changes right now, to tell a run's changes from earlier ones. */
export async function changedFilesNow(cwd?: string): Promise<string[]> {
  try {
    return (await window.warpApi?.getGitStatus?.(cwd)) ?? [];
  } catch {
    return [];
  }
}

/** A commit subject from the goal: its first line, at most 72 characters. */
const subjectFrom = (goal: string) => {
  const line = goal.trim().split('\n')[0] ?? '';
  return line.length > 72 ? `${line.slice(0, 71).trimEnd()}…` : line;
};

const SHOWN = 12;

/**
 * Shown when a run ends: the files it left changed, their diff on request,
 * and a commit (then push) with a message taken from the goal.
 */
export const RunChangesCard: React.FC<{
  cwd?: string;
  goal: string;
  /** Files that already had changes when the run started. */
  before?: string[];
}> = ({ cwd, goal, before = [] }) => {
  const { t } = useI18n();
  const c = t.changes;
  const [diff, setDiff] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'committed' | 'pushing' | 'pushed'>('idle');

  useEffect(() => {
    let live = true;
    window.warpApi
      ?.getGitDiff?.(cwd)
      .then((r: { diff: string }) => live && setDiff(r?.diff ?? ''))
      .catch(() => live && setDiff(''));
    return () => {
      live = false;
    };
  }, [cwd, state === 'committed']);

  const files = useMemo(() => (diff ? parseGitDiff(diff) : []), [diff]);
  const earlier = files.filter((f) => before.includes(f.filename));

  const push = async () => {
    setState('pushing');
    const res = await window.warpApi?.gitPush?.(undefined, undefined, cwd).catch((err: any) => ({ success: false, error: String(err) }));
    if (res?.success) {
      setState('pushed');
      toast.success(c.pushed);
    } else {
      setState('committed');
      toast.error(c.pushFailed(res?.error || ''));
    }
  };

  if (diff === null) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  const done = state === 'committed' || state === 'pushing' || state === 'pushed';

  return (
    <div className="rounded-[11px] border border-zinc-800 bg-base-elevated/60 p-3.5">
      <SectionLabel>{c.title}</SectionLabel>
      {files.length === 0 && !done ? (
        <p className="text-[12px] text-zinc-500">{c.noChanges}</p>
      ) : (
        <>
          {!done && (
            <>
              <p className="mb-1.5 text-[12px] text-zinc-300">{c.files(files.length)}</p>
              <ul className={`space-y-0.5 text-[11px] ${MONO}`}>
                {files.slice(0, SHOWN).map((f) => (
                  <li key={f.filename} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-zinc-300" title={f.filename}>
                      {f.filename}
                    </span>
                    {before.includes(f.filename) && <span className="text-[10px] text-amber-300/80">{c.before}</span>}
                    <span className="text-emerald-400">+{f.additions}</span>
                    <span className="text-red-400">−{f.deletions}</span>
                  </li>
                ))}
                {files.length > SHOWN && <li className="text-zinc-500">{c.more(files.length - SHOWN)}</li>}
              </ul>
              {earlier.length > 0 && <p className="mt-2 text-[11px] text-amber-300/80">{c.preExisting(earlier.length)}</p>}

              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-100"
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {open ? c.hideDiff : c.showDiff}
              </button>
              {open && (
                <div className="mt-2 max-h-[360px] overflow-y-auto rounded-[9px] border border-zinc-800 bg-base-app p-2">
                  <DiffViewer diff={diff} />
                </div>
              )}

              <div className="mt-3">
                <CommitBox
                  cwd={cwd}
                  initialMessage={subjectFrom(goal)}
                  onDone={(outcome) => setState(outcome.pushed ? 'pushed' : 'committed')}
                />
              </div>
            </>
          )}
          <div className={done ? 'mt-3 flex items-center gap-2' : 'hidden'}>
            {done ? (
              <>
                <span className="flex items-center gap-1.5 text-[12px] text-emerald-300">
                  <Check size={13} />
                  {state === 'pushed' ? c.pushed : c.committed}
                </span>
                {state !== 'pushed' && (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={state === 'pushing'} onClick={() => void push()}>
                    {state === 'pushing' ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                    {c.push}
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
