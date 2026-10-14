import React, { useEffect, useState } from 'react';
import { Bookmark, BookmarkPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { MONO } from './FlowParts.js';
import { useI18n } from '../i18n/index.js';

export type TemplateKind = 'duo' | 'swarm' | 'orchestra';
export type TemplateSettings = Record<string, string | number | boolean | string[]>;

/** Same shape as RunTemplate in src/engine/templateStore.ts. */
interface RunTemplate {
  id: string;
  kind: TemplateKind;
  name: string;
  goal: string;
  settings: TemplateSettings;
}

/**
 * Saved goal + team setups of one flow: a click fills the dialog in, and the
 * current setup can be saved under a name.
 */
export const TemplateBar: React.FC<{
  kind: TemplateKind;
  goal: string;
  settings: TemplateSettings;
  onApply: (goal: string, settings: TemplateSettings) => void;
}> = ({ kind, goal, settings, onApply }) => {
  const { t } = useI18n();
  const tp = t.templates;
  const [list, setList] = useState<RunTemplate[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const load = () =>
    window.warpApi
      ?.listTemplates?.(kind)
      .then((l: RunTemplate[]) => setList(l ?? []))
      .catch(() => setList([]));

  useEffect(() => {
    void load();
  }, [kind]);

  const save = async () => {
    const saved: RunTemplate | null = await window.warpApi?.saveTemplate?.({ kind, name, goal, settings }).catch(() => null);
    if (!saved) return;
    toast.success(tp.saved(saved.name));
    setNaming(false);
    void load();
  };

  const apply = (template: RunTemplate) => {
    onApply(template.goal, template.settings);
    void window.warpApi?.touchTemplate?.(template.id);
  };

  const remove = async (template: RunTemplate) => {
    await window.warpApi?.deleteTemplate?.(template.id);
    toast.success(tp.deleted);
    void load();
  };

  if (!list.length && !goal.trim()) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.length > 0 && <span className={`mr-0.5 text-[9.5px] uppercase tracking-[0.1em] text-zinc-500 ${MONO}`}>{tp.label}</span>}
      {list.map((template) => (
        <span
          key={template.id}
          className="group flex max-w-[220px] items-center rounded-full border border-zinc-800 bg-base-elevated/60 text-[11px] text-zinc-300 transition-colors hover:border-zinc-600"
        >
          <button
            type="button"
            onClick={() => apply(template)}
            title={tp.applyHint(template.goal)}
            className="flex min-w-0 items-center gap-1 py-0.5 pl-2 pr-1"
          >
            <Bookmark size={10} className="flex-shrink-0 text-[color:var(--flow-accent)]" />
            <span className="truncate">{template.name}</span>
          </button>
          <button
            type="button"
            onClick={() => void remove(template)}
            aria-label={tp.remove(template.name)}
            title={tp.remove(template.name)}
            className="mr-1 rounded-full p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
          >
            <X size={10} />
          </button>
        </span>
      ))}

      {naming ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) void save();
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder={tp.namePlaceholder}
            aria-label={tp.namePlaceholder}
            className="w-44 rounded-full border border-zinc-700 bg-base-app px-2.5 py-0.5 text-[11px] text-zinc-100 outline-none focus:border-zinc-500"
          />
          <button type="button" disabled={!name.trim()} onClick={() => void save()} className="rounded-full px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
            {tp.confirm}
          </button>
          <button type="button" onClick={() => setNaming(false)} className="rounded-full px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800">
            {tp.cancel}
          </button>
        </span>
      ) : (
        goal.trim() && (
          <button
            type="button"
            onClick={() => {
              setName(goal.trim().split('\n')[0].slice(0, 40));
              setNaming(true);
            }}
            title={tp.saveHint}
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <BookmarkPlus size={11} />
            {tp.save}
          </button>
        )
      )}
    </div>
  );
};
