import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Download,
  FolderGit2,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Keyboard,
  TerminalSquare,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Slider } from '@/components/ui/slider.js';
import { Switch } from '@/components/ui/switch.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import { FlowInput, Segmented } from './FlowParts.js';
import type { WarpConfig, ShellType, CursorStyleType, ProjectOverrides } from '../types/warp.js';
import { useI18n, LANGUAGES, type Lang, type Messages } from '../i18n/index.js';
import { useTheme, type ThemePreference } from '../theme.js';
import { setTerminalPrefs, terminalPrefsFrom } from '../terminalPrefs.js';
import { SHORTCUT_DEFAULTS, SHORTCUT_IDS, keymapFrom, setKeymap, type ShortcutId } from '../shortcuts.js';
import { ShortcutField } from './ShortcutField.js';

interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: WarpConfig) => void;
  /** Re-open the first-launch welcome flow. */
  onShowWelcome?: () => void;
  /** Open the agent install dialog. */
  onOpenAgents?: () => void;
  /** The open project folder; enables the per-project section. */
  cwd?: string;
  /** Jump to this section (e.g. from the command palette); `at` makes a repeat request count again. */
  requestedSection?: { section: Section; at: number } | null;
}

export type Section = 'general' | 'agents' | 'terminal' | 'safety' | 'keyboard' | 'project';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SECTIONS: Section[] = ['general', 'agents', 'terminal', 'safety', 'keyboard', 'project'];
const SECTION_KEY = 'vulgr.settingsSection';
/** How long typing may pause before a change is written to disk. */
const SAVE_DELAY = 400;

function loadSection(): Section {
  try {
    const saved = localStorage.getItem(SECTION_KEY);
    if (SECTIONS.includes(saved as Section)) return saved as Section;
  } catch {}
  return 'general';
}

const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
const SAVE_SHORTCUT = IS_MAC ? '⌘S' : 'Ctrl+S';

/** Same font stack as the terminal panes, so the preview matches them. */
const TERMINAL_FONT = "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace";

/** The search text; a row whose name and explanation don't contain it is left out. */
const QueryContext = createContext('');

const matches = (query: string, ...texts: (string | undefined)[]) =>
  !query || texts.some((text) => text?.toLocaleLowerCase().includes(query));

const claudeModels = (t: Messages): OptionItem[] => [
  { value: 'default', label: t.settings.claudeModels.default },
  { value: 'opus', label: t.settings.claudeModels.opus },
  { value: 'sonnet', label: t.settings.claudeModels.sonnet },
  { value: 'haiku', label: t.settings.claudeModels.haiku },
];

const agyModels = (t: Messages): OptionItem[] => [
  { value: 'default', label: t.settings.agyModels.default },
  { value: 'gemini-2.5-pro', label: t.settings.agyModels.pro },
  { value: 'gemini-2.5-flash', label: t.settings.agyModels.flash },
];

const codexModels = (t: Messages): OptionItem[] => [
  { value: 'default', label: t.settings.codexModels.default },
  { value: 'gpt-4o', label: t.settings.codexModels.gpt4o },
  { value: 'o3-mini', label: t.settings.codexModels.o3mini },
  { value: 'o1', label: t.settings.codexModels.o1 },
];

/** The shells that exist on this platform, plus the saved one if it isn't among them. */
const shells = (t: Messages, current: ShellType): OptionItem[] => {
  const items: OptionItem[] = IS_WINDOWS
    ? [
        { value: 'powershell', label: 'Windows PowerShell (powershell.exe)' },
        { value: 'cmd', label: 'Command Prompt (cmd.exe)' },
        { value: 'wsl', label: 'WSL Bash (wsl.exe)' },
        { value: 'bash', label: 'Git Bash / POSIX (bash.exe)' },
      ]
    : [
        { value: 'default', label: t.settings.shellDefault },
        { value: 'zsh', label: 'zsh' },
        { value: 'bash', label: 'bash' },
        { value: 'fish', label: 'fish' },
        { value: 'powershell', label: 'PowerShell (pwsh)' },
      ];
  if (!items.some((i) => i.value === current)) items.push({ value: current, label: current });
  return items;
};

const cursors = (t: Messages): OptionItem[] => [
  { value: 'bar', label: t.settings.cursors.bar },
  { value: 'block', label: t.settings.cursors.block },
  { value: 'underline', label: t.settings.cursors.underline },
];

const LANGUAGE_ITEMS: OptionItem[] = LANGUAGES.map((l) => ({ value: l.value, label: l.label }));

/** Settings that travel in an export; secrets, per-project entries and timestamps stay behind. */
const EXPORT_KEYS = ['defaultShell', 'fontSize', 'cursorStyle', 'claude', 'agy', 'codex', 'autoSandbox', 'notifyRuns', 'notifyCommands', 'defaultVerifyCmd', 'shortcuts'] as const;
const EXPORT_FORMAT = 'vulgr-settings';

/** Takes the known settings from an imported file, keeping each only if its type matches the current one. */
function settingsFromImport(current: WarpConfig, data: unknown): WarpConfig | null {
  if (!data || typeof data !== 'object') return null;
  const source = (data as { settings?: unknown }).settings;
  if (!source || typeof source !== 'object') return null;
  const next = { ...current } as Record<string, unknown>;
  let found = 0;
  for (const key of EXPORT_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    const base = (current as unknown as Record<string, unknown>)[key];
    if (value === undefined || typeof value !== typeof base) continue;
    if (base && typeof base === 'object') {
      const merged = { ...(base as object) } as Record<string, unknown>;
      for (const [k, v] of Object.entries(value as object)) {
        if (k in merged && typeof v === typeof merged[k]) merged[k] = v;
      }
      next[key] = merged;
    } else {
      next[key] = value;
    }
    found++;
  }
  return found > 0 ? (next as unknown as WarpConfig) : null;
}

/** Drops "use global" entries, so a project only keeps what it really changes. */
function cleanProject(o: ProjectOverrides): ProjectOverrides {
  const claude = Object.fromEntries(Object.entries(o.claude ?? {}).filter(([, v]) => v !== undefined));
  return {
    ...(Object.keys(claude).length > 0 ? { claude } : {}),
    ...(o.defaultVerifyCmd ? { defaultVerifyCmd: o.defaultVerifyCmd } : {}),
  };
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

/** One setting: name and explanation on the left, its control on the right (or below when `stacked`). */
const Row: React.FC<{
  label: string;
  hint?: string;
  htmlFor?: string;
  stacked?: boolean;
  children: React.ReactNode;
}> = ({ label, hint, htmlFor, stacked, children }) => {
  const query = useContext(QueryContext);
  if (!matches(query, label, hint)) return null;
  return (
    <div data-setting-row className={`py-4 ${stacked ? '' : 'flex items-center gap-6'}`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[13px] text-zinc-100">
          {label}
        </label>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{hint}</p>}
      </div>
      <div className={stacked ? 'mt-3' : 'w-[260px] flex-shrink-0'}>{children}</div>
    </div>
  );
};

/**
 * A titled block of rows; rows are separated by hairlines. While searching, a group whose
 * title matches shows all its rows, and a group with no matching row is hidden.
 */
const Group: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => {
  const query = useContext(QueryContext);
  return (
    <section className="mb-8 [&:not(:has([data-setting-row]))]:hidden">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">{title}</h3>
      {hint && <p className="mt-1 text-[12px] text-zinc-600">{hint}</p>}
      <QueryContext.Provider value={matches(query, title, hint) ? '' : query}>
        <div className="mt-2 divide-y divide-zinc-900 border-y border-zinc-900">{children}</div>
      </QueryContext.Provider>
    </section>
  );
};

/**
 * A whole number between `min` and `max`. Typing is free (the field may be empty for a
 * moment); the value is taken while it is valid and put back in range when the field is left.
 */
const NumberField: React.FC<{
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  labels: { decrease: string; increase: string };
}> = ({ id, value, min, max, onChange, labels }) => {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = () => {
    const n = parseInt(text, 10);
    const next = Number.isNaN(n) ? value : clamp(n);
    setText(String(next));
    if (next !== value) onChange(next);
  };
  const step = (delta: number) => {
    const next = clamp(value + delta);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const stepButton = 'flex size-8 flex-shrink-0 items-center justify-center rounded-[8px] border border-zinc-800 bg-base-app text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-40 disabled:hover:border-zinc-800';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={stepButton} onClick={() => step(-1)} disabled={value <= min} aria-label={labels.decrease}>
        <Minus size={12} />
      </button>
      <FlowInput
        id={id}
        inputMode="numeric"
        value={text}
        className="text-center"
        aria-valuemin={min}
        aria-valuemax={max}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '');
          setText(raw);
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n) && n >= min && n <= max && n !== value) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
      />
      <button type="button" className={stepButton} onClick={() => step(1)} disabled={value >= max} aria-label={labels.increase}>
        <Plus size={12} />
      </button>
      <span className="w-12 flex-shrink-0 text-right font-mono text-[10.5px] text-zinc-600">
        {min}–{max}
      </span>
    </div>
  );
};

/** A few lines of a terminal drawn with the chosen font size and cursor. */
const TerminalPreview: React.FC<{ fontSize: number; cursor: CursorStyleType; label: string }> = ({ fontSize, cursor, label }) => (
  <div className="mb-8">
    <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">{label}</h3>
    <div
      className="mt-2 overflow-hidden rounded-[10px] border border-zinc-900 bg-base-elevated px-4 py-3 leading-[1.5] text-zinc-300"
      style={{ fontFamily: TERMINAL_FONT, fontSize }}
    >
      <div>
        <span className="text-emerald-400">~/project</span> <span className="text-zinc-500">main</span> $ npm test
      </div>
      <div className="text-zinc-500">✓ 42 passed (1.3s)</div>
      <div className="flex items-center">
        <span className="text-emerald-400">~/project</span>&nbsp;<span className="text-zinc-500">main</span>&nbsp;$&nbsp;
        <span
          aria-hidden
          className={`inline-block animate-pulse bg-zinc-200 ${
            cursor === 'block' ? 'h-[1.2em] w-[0.6em]' : cursor === 'underline' ? 'mt-[1em] h-[2px] w-[0.6em]' : 'h-[1.2em] w-[2px]'
          }`}
        />
      </div>
    </div>
  </div>
);

/** Waits `delay` after the last call before running `fn`; `flush` runs a pending call at once. */
function useDebounced<T>(fn: (value: T) => Promise<unknown>, delay: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const pending = useRef<{ value: T; timer: number } | null>(null);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    await fnRef.current(p.value);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      if (pending.current) window.clearTimeout(pending.current.timer);
      pending.current = { value, timer: window.setTimeout(() => void flush(), delay) };
    },
    [delay, flush]
  );

  const cancel = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  return useMemo(() => ({ schedule, flush, cancel }), [schedule, flush, cancel]);
}

/**
 * Settings as a page in the main area, over the terminals (which stay mounted underneath).
 * Every change applies and is saved as it is made; "Undo changes" goes back to how
 * things were when the page was opened.
 */
export const SettingsView: React.FC<SettingsViewProps> = ({ isOpen, onClose, onConfigChanged, onShowWelcome, onOpenAgents, cwd, requestedSection }) => {
  const { t, lang, setLang } = useI18n();
  const s = t.settings;
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [section, setSectionState] = useState<Section>(loadSection);
  const [config, setConfigState] = useState<WarpConfig | null>(null);
  /** The settings as they were when the page opened, for "Undo changes". */
  const [opened, setOpened] = useState<WarpConfig | null>(null);
  const [project, setProjectState] = useState<ProjectOverrides | null>(null);
  const [openedProject, setOpenedProject] = useState<ProjectOverrides | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const query = search.trim().toLocaleLowerCase();
  const hasProject = !!cwd && !!window.warpApi?.getProjectConfig;
  const shownSection: Section = section === 'project' && !hasProject ? 'general' : section;

  const setSection = (next: Section) => {
    setSectionState(next);
    setSearch('');
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {}
  };

  useEffect(() => {
    if (requestedSection) setSection(requestedSection.section);
  }, [requestedSection]);

  const persistConfig = useDebounced<WarpConfig>(async (next) => {
    if (!window.warpApi?.updateConfig) return;
    setSaveState('saving');
    try {
      const updated: WarpConfig = await window.warpApi.updateConfig(next);
      onConfigChanged?.(updated);
      setSaveState('saved');
    } catch (err) {
      console.error('Failed to update config:', err);
      setSaveState('error');
      toast.error(s.saveFailed);
    }
  }, SAVE_DELAY);

  const persistProject = useDebounced<ProjectOverrides>(async (next) => {
    if (!cwd || !window.warpApi?.setProjectConfig) return;
    setSaveState('saving');
    try {
      await window.warpApi.setProjectConfig(cwd, next);
      setSaveState('saved');
    } catch (err) {
      console.error('Failed to update project config:', err);
      setSaveState('error');
      toast.error(s.saveFailed);
    }
  }, SAVE_DELAY);

  /** Applies a change at once and saves it shortly after. */
  const setConfig = (next: WarpConfig) => {
    setConfigState(next);
    setTerminalPrefs(terminalPrefsFrom(next));
    setKeymap(keymapFrom(next));
    persistConfig.schedule(next);
  };

  const setProject = (next: ProjectOverrides) => {
    const clean = cleanProject(next);
    setProjectState(clean);
    persistProject.schedule(clean);
  };

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSaveState('idle');
      return;
    }
    if (!window.warpApi?.getConfig) return;
    window.warpApi
      .getConfig()
      .then((c: WarpConfig) => {
        setConfigState(c);
        setOpened(c);
      })
      .catch((err: unknown) => console.error('Failed to load config:', err));
    if (cwd && window.warpApi.getProjectConfig) {
      window.warpApi
        .getProjectConfig(cwd)
        .then((o: ProjectOverrides) => {
          setProjectState(cleanProject(o ?? {}));
          setOpenedProject(cleanProject(o ?? {}));
        })
        .catch(() => {
          setProjectState({});
          setOpenedProject({});
        });
    } else {
      setProjectState(null);
      setOpenedProject(null);
    }
  }, [isOpen, cwd]);

  const changed = useMemo(
    () =>
      (!!config && !!opened && JSON.stringify({ ...config, lastUpdated: '' }) !== JSON.stringify({ ...opened, lastUpdated: '' })) ||
      (!!project && !!openedProject && JSON.stringify(project) !== JSON.stringify(openedProject)),
    [config, opened, project, openedProject]
  );

  const flushAll = useCallback(async () => {
    await Promise.all([persistConfig.flush(), persistProject.flush()]);
  }, [persistConfig, persistProject]);

  const close = async () => {
    await flushAll();
    onClose();
  };

  const undoChanges = () => {
    if (opened) setConfig(opened);
    if (openedProject && project) setProject(openedProject);
    toast.success(s.undone);
  };

  const handleReset = async () => {
    if (!window.warpApi?.resetConfig) return;
    persistConfig.cancel();
    try {
      const reset: WarpConfig = await window.warpApi.resetConfig();
      setConfigState(reset);
      setTerminalPrefs(terminalPrefsFrom(reset));
      setKeymap(keymapFrom(reset));
      onConfigChanged?.(reset);
      toast.success(s.resetDone);
    } catch (err) {
      console.error('Failed to reset config:', err);
      toast.error(s.resetFailed);
    }
  };

  const handleExport = () => {
    if (!config) return;
    const settings = Object.fromEntries(EXPORT_KEYS.map((k) => [k, config[k]]));
    const data = { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), theme: themePreference, language: lang, settings };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vulgr-settings.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImport = async (file: File) => {
    if (!config) return;
    try {
      const data = JSON.parse(await file.text());
      const next = settingsFromImport(config, data);
      if (!next) throw new Error('no settings');
      setConfig(next);
      if (['dark', 'light', 'system'].includes(data.theme)) setThemePreference(data.theme as ThemePreference);
      if (LANGUAGES.some((l) => l.value === data.language)) setLang(data.language as Lang);
      toast.success(s.importDone);
    } catch {
      toast.error(s.importFailed);
    }
  };

  // Rebound every render so the handlers see the current state.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.shiftKey && key === 's') {
      // Changes save themselves; this only skips the short wait.
      e.preventDefault();
      void flushAll();
      return;
    }
    if (mod && !e.shiftKey && key === 'f') {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
      return;
    }
    // The app opens settings with Ctrl+, and leaves closing them to this page.
    if (mod && !e.shiftKey && key === ',') {
      void close();
      return;
    }
    // Leave Escape to an open select or dialog.
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="listbox"],[role="dialog"]')) return;
    if (document.activeElement === searchRef.current && search) {
      setSearch('');
      return;
    }
    void close();
  };

  useEffect(() => {
    if (!isOpen) return;
    // Take focus off the terminal underneath, so Ctrl+S or Escape here don't also reach its shell.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // A pending save still goes through if the page goes away first.
  useEffect(() => () => void flushAll(), [flushAll]);

  if (!isOpen) return null;

  const show = (id: Section) => !!query || shownSection === id;
  const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: s.tabGeneral, icon: <Settings2 size={14} /> },
    { id: 'agents', label: s.tabPermissions, icon: <Bot size={14} /> },
    { id: 'terminal', label: s.tabTerminal, icon: <TerminalSquare size={14} /> },
    { id: 'safety', label: s.tabSafety, icon: <ShieldCheck size={14} /> },
    { id: 'keyboard', label: s.tabKeyboard, icon: <Keyboard size={14} /> },
    ...(hasProject ? [{ id: 'project' as const, label: s.tabProject, icon: <FolderGit2 size={14} /> }] : []),
  ];
  const themeItems = [
    { value: 'dark', label: s.themeDark },
    { value: 'light', label: s.themeLight },
    { value: 'system', label: s.themeSystem },
  ];
  const stepLabels = { decrease: s.decrease, increase: s.increase };

  const INHERIT = '__global';
  const modelLabel = (value: string) => claudeModels(t).find((m) => m.value === value)?.label ?? value;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-base-app animate-slide-in-up">
      <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-zinc-900 px-4">
        <button
          onClick={() => void close()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
          title={s.back}
        >
          <ArrowLeft size={14} />
          {s.back}
        </button>
        <div className="h-4 w-px bg-zinc-850" />
        <h2 className="text-[13px] font-medium text-zinc-100">{s.pageTitle}</h2>

        <div className="ml-auto flex items-center gap-3">
          {/* Every change saves itself; this says where that stands. */}
          <span
            role="status"
            title={s.autosaveHint(SAVE_SHORTCUT)}
            className={`flex items-center gap-1.5 text-[11.5px] transition-opacity duration-300 ${
              saveState === 'idle' ? 'opacity-0' : 'opacity-100'
            } ${saveState === 'error' ? 'text-red-400' : 'text-zinc-500'}`}
          >
            {saveState === 'saving' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : saveState === 'error' ? (
              <TriangleAlert size={12} />
            ) : (
              <Check size={12} className="text-emerald-400" />
            )}
            {saveState === 'saving' ? s.saving : saveState === 'error' ? s.saveFailed : s.savedStatus}
          </span>
          {changed && (
            <button
              onClick={undoChanges}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              title={s.undoChangesHint}
            >
              <Undo2 size={13} />
              {s.undoChanges}
            </button>
          )}
          <kbd className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">Esc</kbd>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-48 flex-shrink-0 border-r border-zinc-900 p-2">
          <div className="relative mb-2">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={s.search}
              aria-label={s.search}
              spellCheck={false}
              className="h-8 w-full rounded-md border border-zinc-900 bg-base-app pl-7 pr-7 text-[12px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  searchRef.current?.focus();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                aria-label={s.clearSearch}
              >
                <X size={12} />
              </button>
            )}
          </div>
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                !query && shownSection === item.id ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <span className={!query && shownSection === item.id ? 'text-primary' : ''}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {!config ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">{s.loading}</div>
          ) : (
            <QueryContext.Provider value={query}>
              <div className="mx-auto max-w-[720px] px-8 py-8 [&:has([data-setting-row])>[data-no-results]]:hidden">
                {query && (
                  <p data-no-results className="py-16 text-center text-[12.5px] text-zinc-500">
                    {s.noResults(search.trim())}
                  </p>
                )}

                {show('general') && (
                  <>
                    <Group title={s.appearance}>
                      <Row label={s.themeTitle} hint={s.themeDescription}>
                        <div className="flex justify-end">
                          <Segmented
                            value={themePreference}
                            items={themeItems}
                            onChange={(value) => setThemePreference(value as ThemePreference)}
                          />
                        </div>
                      </Row>
                      <Row label={s.languageTitle} hint={s.languageDescription} htmlFor="ui-language">
                        <OptionSelect id="ui-language" value={lang} items={LANGUAGE_ITEMS} onValueChange={(value) => setLang(value as Lang)} />
                      </Row>
                    </Group>
                    <Group title={s.notifyTitle}>
                      <Row label={s.notifyRuns} hint={s.notifyRunsHint}>
                        <div className="flex justify-end">
                          <Switch checked={config.notifyRuns !== false} onCheckedChange={(checked) => setConfig({ ...config, notifyRuns: checked })} />
                        </div>
                      </Row>
                      <Row label={s.notifyCommands} hint={s.notifyCommandsHint}>
                        <div className="flex justify-end">
                          <Switch checked={config.notifyCommands !== false} onCheckedChange={(checked) => setConfig({ ...config, notifyCommands: checked })} />
                        </div>
                      </Row>
                    </Group>
                    <Group title={s.setup}>
                      {onOpenAgents && (
                        <Row label={t.agentSetup.settingsTitle} hint={t.agentSetup.settingsDescription}>
                          <div className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={onOpenAgents}>
                              {t.agentSetup.open}
                            </Button>
                          </div>
                        </Row>
                      )}
                      {onShowWelcome && (
                        <Row label={s.welcomeTitle} hint={s.welcomeDescription}>
                          <div className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={onShowWelcome}>
                              {s.welcomeButton}
                            </Button>
                          </div>
                        </Row>
                      )}
                    </Group>
                    <Group title={s.backupTitle}>
                      <Row label={s.exportTitle} hint={s.exportHint}>
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={handleExport}>
                            <Download size={13} />
                            {s.exportButton}
                          </Button>
                        </div>
                      </Row>
                      <Row label={s.importTitle} hint={s.importHint}>
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                            <Upload size={13} />
                            {s.importButton}
                          </Button>
                          <input
                            ref={importRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) void handleImport(file);
                            }}
                          />
                        </div>
                      </Row>
                    </Group>
                  </>
                )}

                {show('agents') && (
                  <>
                    <Group title="Claude Code" hint={s.claudeDescription}>
                      <Row label={s.skipPermissions} hint={s.skipPermissionsHint}>
                        <div className="flex justify-end">
                          <Switch
                            checked={config.claude.skipPermissions}
                            onCheckedChange={(checked) => setConfig({ ...config, claude: { ...config.claude, skipPermissions: checked } })}
                          />
                        </div>
                      </Row>
                      <Row label={s.claudeModel} htmlFor="claude-model">
                        <OptionSelect
                          id="claude-model"
                          value={config.claude.model}
                          items={claudeModels(t)}
                          onValueChange={(value) => setConfig({ ...config, claude: { ...config.claude, model: value } })}
                        />
                      </Row>
                      <Row label={s.maxRetries} htmlFor="claude-retries">
                        <NumberField
                          id="claude-retries"
                          min={1}
                          max={10}
                          value={config.claude.maxRetries}
                          labels={stepLabels}
                          onChange={(n) => setConfig({ ...config, claude: { ...config.claude, maxRetries: n } })}
                        />
                      </Row>
                    </Group>
                    <Group title="Antigravity" hint={s.agyDescription}>
                      <Row label={s.agyModel} htmlFor="agy-model">
                        <OptionSelect
                          id="agy-model"
                          value={config.agy.model}
                          items={agyModels(t)}
                          onValueChange={(value) => setConfig({ ...config, agy: { ...config.agy, model: value } })}
                        />
                      </Row>
                    </Group>
                    <Group title="Codex CLI" hint={s.codexDescription}>
                      <Row label={s.codexModel} htmlFor="codex-model">
                        <OptionSelect
                          id="codex-model"
                          value={config.codex.model}
                          items={codexModels(t)}
                          onValueChange={(value) => setConfig({ ...config, codex: { ...config.codex, model: value } })}
                        />
                      </Row>
                      <Row label={s.codexBinary} hint={s.codexBinaryHint} htmlFor="codex-binary">
                        <FlowInput
                          id="codex-binary"
                          value={config.codex.binaryPath}
                          placeholder="codex"
                          onChange={(e) => setConfig({ ...config, codex: { ...config.codex, binaryPath: e.target.value } })}
                        />
                      </Row>
                    </Group>
                  </>
                )}

                {show('terminal') && (
                  <>
                    <Group title={s.shellTitle}>
                      <Row label={s.defaultShell} hint={s.defaultShellHint} htmlFor="default-shell">
                        <OptionSelect
                          id="default-shell"
                          value={config.defaultShell}
                          items={shells(t, config.defaultShell)}
                          onValueChange={(value) => setConfig({ ...config, defaultShell: value as ShellType })}
                        />
                      </Row>
                      <Row label={s.cursorStyle} htmlFor="cursor-style">
                        <OptionSelect
                          id="cursor-style"
                          value={config.cursorStyle}
                          items={cursors(t)}
                          onValueChange={(value) => setConfig({ ...config, cursorStyle: value as CursorStyleType })}
                        />
                      </Row>
                      <Row label={s.fontSize} htmlFor="font-size">
                        <div className="flex items-center gap-3">
                          <Slider
                            id="font-size"
                            min={11}
                            max={20}
                            value={[config.fontSize]}
                            onValueChange={(value) => setConfig({ ...config, fontSize: Array.isArray(value) ? value[0] : value })}
                          />
                          <span className="w-10 text-right font-mono text-[12px] text-zinc-400">{config.fontSize}px</span>
                        </div>
                      </Row>
                    </Group>
                    {!query && <TerminalPreview fontSize={config.fontSize} cursor={config.cursorStyle} label={s.preview} />}
                  </>
                )}

                {show('safety') && (
                  <Group title={s.sandboxTitle} hint={s.sandboxDescription}>
                    <Row label={s.autoSandbox} hint={s.autoSandboxHint}>
                      <div className="flex justify-end">
                        <Switch checked={config.autoSandbox} onCheckedChange={(checked) => setConfig({ ...config, autoSandbox: checked })} />
                      </div>
                    </Row>
                    <Row label={s.verifyCmd} htmlFor="verify-cmd">
                      <FlowInput
                        id="verify-cmd"
                        value={config.defaultVerifyCmd}
                        placeholder="npm test"
                        onChange={(e) => setConfig({ ...config, defaultVerifyCmd: e.target.value })}
                      />
                    </Row>
                  </Group>
                )}

                {show('keyboard') && (() => {
                  const keymap = keymapFrom(config);
                  const names: Record<ShortcutId, string> = {
                    palette: t.workspace.paletteTitle,
                    newTab: t.app.actions.newTab,
                    closePane: t.app.actions.closePane,
                    splitH: t.app.actions.splitH,
                    splitV: t.app.actions.splitV,
                    toggleSidebar: t.app.actions.toggleSidebar,
                    changes: t.app.actions.toggleDiff,
                    skills: t.app.actions.openSkills,
                    sandbox: t.app.actions.openSandbox,
                    duoLoop: t.app.actions.liveSquad,
                    history: t.history.open,
                    exportReport: t.app.actions.exportReport,
                    tokenHud: t.app.actions.tokenHud,
                    settings: t.app.actions.openSettings,
                    guide: t.app.actions.guide,
                  };
                  const setShortcut = (id: ShortcutId, combo: string) => {
                    const changed = { ...(config.shortcuts ?? {}) };
                    if (combo === SHORTCUT_DEFAULTS[id]) delete changed[id];
                    else changed[id] = combo;
                    setConfig({ ...config, shortcuts: changed });
                  };
                  const customized = Object.keys(config.shortcuts ?? {}).length > 0;
                  return (
                    <Group title={s.keyboardTitle} hint={s.keyboardDescription}>
                      {SHORTCUT_IDS.map((id) => {
                        const clash = SHORTCUT_IDS.find((other) => other !== id && keymap[other] === keymap[id]);
                        return (
                          <Row key={id} label={names[id]} hint={clash ? s.shortcutConflict(names[clash]) : undefined}>
                            <div className="flex items-center justify-end gap-1.5">
                              {keymap[id] !== SHORTCUT_DEFAULTS[id] && (
                                <button
                                  type="button"
                                  onClick={() => setShortcut(id, SHORTCUT_DEFAULTS[id])}
                                  title={s.resetShortcut}
                                  aria-label={`${s.resetShortcut}: ${names[id]}`}
                                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                              <ShortcutField
                                value={keymap[id]}
                                invalid={!!clash}
                                ariaLabel={names[id]}
                                labels={{ pressKeys: s.pressKeys, needsModifier: s.shortcutNeedsModifier }}
                                onChange={(combo) => setShortcut(id, combo)}
                              />
                            </div>
                          </Row>
                        );
                      })}
                      {customized && (
                        <Row label="">
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setConfig({ ...config, shortcuts: {} });
                                toast.success(s.shortcutsReset);
                              }}
                            >
                              {s.resetAllShortcuts}
                            </Button>
                          </div>
                        </Row>
                      )}
                    </Group>
                  );
                })()}

                {hasProject && project && show('project') && (
                  <Group title={s.projectTitle(baseName(cwd!))} hint={s.projectDescription}>
                    <Row label={s.claudeModel} hint={s.projectModelHint} htmlFor="project-claude-model">
                      <OptionSelect
                        id="project-claude-model"
                        value={project.claude?.model ?? INHERIT}
                        items={[{ value: INHERIT, label: s.useGlobal(modelLabel(config.claude.model)) }, ...claudeModels(t)]}
                        onValueChange={(value) =>
                          setProject({ ...project, claude: { ...project.claude, model: value === INHERIT ? undefined : value } })
                        }
                      />
                    </Row>
                    <Row label={s.skipPermissions} hint={s.skipPermissionsHint} htmlFor="project-skip">
                      <OptionSelect
                        id="project-skip"
                        value={project.claude?.skipPermissions === undefined ? INHERIT : project.claude.skipPermissions ? 'on' : 'off'}
                        items={[
                          { value: INHERIT, label: s.useGlobal(config.claude.skipPermissions ? s.on : s.off) },
                          { value: 'on', label: s.on },
                          { value: 'off', label: s.off },
                        ]}
                        onValueChange={(value) =>
                          setProject({
                            ...project,
                            claude: { ...project.claude, skipPermissions: value === INHERIT ? undefined : value === 'on' },
                          })
                        }
                      />
                    </Row>
                    <Row label={s.verifyCmd} hint={s.projectVerifyHint} htmlFor="project-verify">
                      <FlowInput
                        id="project-verify"
                        value={project.defaultVerifyCmd ?? ''}
                        placeholder={s.globalPlaceholder(config.defaultVerifyCmd || '—')}
                        onChange={(e) => setProject({ ...project, defaultVerifyCmd: e.target.value || undefined })}
                      />
                    </Row>
                  </Group>
                )}

                {!query && shownSection !== 'project' && (
                  <button
                    onClick={() => void handleReset()}
                    className="flex items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200"
                  >
                    <RotateCcw size={12} />
                    {s.reset}
                  </button>
                )}
              </div>
            </QueryContext.Provider>
          )}
        </div>
      </div>
    </div>
  );
};
