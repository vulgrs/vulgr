import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, GitBranch, GitPullRequest, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '../i18n/index.js';

/**
 * The branch pill of the status bar, as a menu: pick a branch to switch to,
 * or type a new name to create it from the current commit.
 */
export const BranchMenu: React.FC<{
  cwd?: string;
  branch: string;
  isDirty: boolean;
  title: string;
  /** After a switch, so the app refreshes branch and changes. */
  onSwitched: () => void;
  onOpenPullRequest?: () => void;
}> = ({ cwd, branch, isDirty, title, onSwitched, onOpenPullRequest }) => {
  const { t } = useI18n();
  const b = t.branches;
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<{ name: string; current: boolean }[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setBranches(null);
    window.warpApi?.listBranches?.(cwd).then(setBranches).catch(() => setBranches([]));
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const name = query.trim();
  const shown = useMemo(
    () => (branches ?? []).filter((x) => !name || x.name.toLowerCase().includes(name.toLowerCase())),
    [branches, name]
  );
  const canCreate = !!name && !(branches ?? []).some((x) => x.name === name);
  // Rows: matching branches, then "create" when the name is new.
  const rows = [...shown.map((x) => ({ kind: 'branch' as const, name: x.name, current: x.current })), ...(canCreate ? [{ kind: 'create' as const, name, current: false }] : [])];

  const go = async (target: string, create: boolean) => {
    if (busy) return;
    setBusy(target);
    const res = await window.warpApi?.switchBranch?.({ name: target, create, cwd }).catch((err: any) => ({ success: false, error: String(err) }));
    setBusy(null);
    if (!res?.success) {
      toast.error(b.failed(res?.error ?? ''));
      return;
    }
    toast.success(create ? b.created(target) : b.switched(target));
    setOpen(false);
    onSwitched();
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${title} · ${b.hint}`}
        aria-expanded={open}
        className={`flex items-center space-x-1 px-1.5 py-0.2 rounded border text-[9px] transition-colors ${
          isDirty
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 [.light_&]:text-amber-700'
            : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        <GitBranch size={10} />
        <span className="font-semibold">{branch}</span>
        <span className={`w-1 h-1 rounded-full ${isDirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-64 overflow-hidden rounded-[10px] border border-zinc-800 bg-base-elevated font-sans shadow-[var(--shadow-modal)]">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, rows.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter' && rows[active]) void go(rows[active].name, rows[active].kind === 'create');
            }}
            placeholder={b.search}
            aria-label={b.search}
            className="w-full border-b border-zinc-800 bg-transparent px-3 py-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <ul className="max-h-64 overflow-y-auto py-1">
            {branches === null ? (
              <li className="flex justify-center py-3 text-zinc-500">
                <Loader2 size={13} className="animate-spin" />
              </li>
            ) : rows.length === 0 ? (
              <li className="px-3 py-2 text-[11.5px] text-zinc-500">{b.empty}</li>
            ) : (
              rows.map((row, i) => (
                <li key={`${row.kind}-${row.name}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => void go(row.name, row.kind === 'create')}
                    disabled={row.current}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
                      i === active ? 'bg-zinc-800/80 text-zinc-100' : 'text-zinc-300'
                    } disabled:cursor-default`}
                  >
                    {busy === row.name ? (
                      <Loader2 size={12} className="flex-shrink-0 animate-spin text-zinc-400" />
                    ) : row.kind === 'create' ? (
                      <Plus size={12} className="flex-shrink-0 text-zinc-400" />
                    ) : row.current ? (
                      <Check size={12} className="flex-shrink-0 text-zinc-200" />
                    ) : (
                      <GitBranch size={12} className="flex-shrink-0 text-zinc-500" />
                    )}
                    <span className="min-w-0 truncate font-mono text-[11.5px]">{row.kind === 'create' ? b.create(row.name) : row.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {onOpenPullRequest && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenPullRequest();
              }}
              title={t.pr.openHint}
              className="flex w-full items-center gap-2 border-t border-zinc-800 px-3 py-2 text-left text-[12px] text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
            >
              <GitPullRequest size={12} className="text-zinc-400" />
              {t.pr.open}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
