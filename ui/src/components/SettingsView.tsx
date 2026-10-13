import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, RotateCcw, Search, Settings2, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Slider } from '@/components/ui/slider.js';
import { Switch } from '@/components/ui/switch.js';
import { OptionSelect, type OptionItem } from './OptionSelect.js';
import { FlowInput, Segmented } from './FlowParts.js';
import type { WarpConfig, ShellType, CursorStyleType } from '../types/warp.js';
import { useI18n, LANGUAGES, type Lang, type Messages } from '../i18n/index.js';
import { useTheme, type ThemePreference } from '../theme.js';

interface SettingsViewProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: (config: WarpConfig) => void;
  /** Re-open the first-launch welcome flow. */
  onShowWelcome?: () => void;
  /** Open the agent install dialog. */
  onOpenAgents?: () => void;
}

type Section = 'general' | 'agents' | 'terminal' | 'safety';

const SECTIONS: Section[] = ['general', 'agents', 'terminal', 'safety'];
const SECTION_KEY = 'vulgr.settingsSection';

function loadSection(): Section {
  try {
    const saved = localStorage.getItem(SECTION_KEY);
    if (SECTIONS.includes(saved as Section)) return saved as Section;
  } catch {}
  return 'general';
}

const SAVE_SHORTCUT = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘S' : 'Ctrl+S';

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
  { value: 'gemini-2.5-pro', label: t.settings.agyModels.pro },
  { value: 'gemini-2.5-flash', label: t.settings.agyModels.flash },
];

const codexModels = (t: Messages): OptionItem[] => [
  { value: 'gpt-4o', label: t.settings.codexModels.gpt4o },
  { value: 'o3-mini', label: t.settings.codexModels.o3mini },
  { value: 'o1', label: t.settings.codexModels.o1 },
];

const SHELLS: OptionItem[] = [
  { value: 'powershell', label: 'Windows PowerShell (powershell.exe)' },
  { value: 'cmd', label: 'Command Prompt (cmd.exe)' },
  { value: 'wsl', label: 'WSL Bash (wsl.exe)' },
  { value: 'bash', label: 'Git Bash / POSIX (bash.exe)' },
];

const cursors = (t: Messages): OptionItem[] => [
  { value: 'bar', label: t.settings.cursors.bar },
  { value: 'block', label: t.settings.cursors.block },
  { value: 'underline', label: t.settings.cursors.underline },
];

const LANGUAGE_ITEMS: OptionItem[] = LANGUAGES.map((l) => ({ value: l.value, label: l.label }));

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

/** A few lines of a terminal drawn with the chosen font size and cursor, before saving. */
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

/**
 * Settings as a page in the main area, over the terminals (which stay mounted underneath).
 * Theme and language apply at once; the rest is saved with the bar that appears once something changes.
 */
export const SettingsView: React.FC<SettingsViewProps> = ({ isOpen, onClose, onConfigChanged, onShowWelcome, onOpenAgents }) => {
  const { t, lang, setLang } = useI18n();
  const s = t.settings;
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [section, setSectionState] = useState<Section>(loadSection);
  const [saved, setSaved] = useState<WarpConfig | null>(null);
  const [config, setConfig] = useState<WarpConfig | null>(null);
  const [search, setSearch] = useState('');
  /** Set when leaving was asked for with unsaved changes; the save bar then asks what to do with them. */
  const [leaving, setLeaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const query = search.trim().toLocaleLowerCase();

  const setSection = (next: Section) => {
    setSectionState(next);
    setSearch('');
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {}
  };

  useEffect(() => {
    if (!isOpen) {
      setLeaving(false);
      setSearch('');
      return;
    }
    if (!window.warpApi?.getConfig) return;
    window.warpApi
      .getConfig()
      .then((c: WarpConfig) => {
        setSaved(c);
        setConfig(c);
      })
      .catch((err: unknown) => console.error('Failed to load config:', err));
  }, [isOpen]);

  const dirty = useMemo(() => !!config && !!saved && JSON.stringify(config) !== JSON.stringify(saved), [config, saved]);

  /** Returns whether the save went through. */
  const handleSave = async (): Promise<boolean> => {
    if (!config || !window.warpApi?.updateConfig) return false;
    try {
      const updated = await window.warpApi.updateConfig(config);
      setSaved(updated);
      setConfig(updated);
      onConfigChanged?.(updated);
      toast.success(s.saved);
      return true;
    } catch (err) {
      console.error('Failed to update config:', err);
      toast.error(s.saveFailed);
      return false;
    }
  };

  // Unsaved changes are never dropped silently: leaving first asks in the save bar.
  const requestClose = () => {
    if (dirty) setLeaving(true);
    else onClose();
  };

  const discardAndClose = () => {
    setConfig(saved);
    onClose();
  };

  const saveAndClose = async () => {
    if (await handleSave()) onClose();
  };

  // Rebound every render so the handlers see the current config.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.shiftKey && key === 's') {
      e.preventDefault();
      if (dirty) void (leaving ? saveAndClose() : handleSave());
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
      requestClose();
      return;
    }
    // Leave Escape to an open select or dialog.
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="listbox"],[role="dialog"]')) return;
    if (document.activeElement === searchRef.current && search) {
      setSearch('');
      return;
    }
    if (leaving) setLeaving(false);
    else requestClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    // Take focus off the terminal underneath, so Ctrl+S or Escape here don't also reach its shell.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Nothing left to ask about once the changes are saved or undone.
  useEffect(() => {
    if (!dirty) setLeaving(false);
  }, [dirty]);

  const handleReset = async () => {
    if (!window.warpApi?.resetConfig) return;
    try {
      const reset = await window.warpApi.resetConfig();
      setSaved(reset);
      setConfig(reset);
      onConfigChanged?.(reset);
      toast.success(s.resetDone);
    } catch (err) {
      console.error('Failed to reset config:', err);
      toast.error(s.resetFailed);
    }
  };

  if (!isOpen) return null;

  const show = (id: Section) => !!query || section === id;
  const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: s.tabGeneral, icon: <Settings2 size={14} /> },
    { id: 'agents', label: s.tabPermissions, icon: <Bot size={14} /> },
    { id: 'terminal', label: s.tabTerminal, icon: <TerminalSquare size={14} /> },
    { id: 'safety', label: s.tabSafety, icon: <ShieldCheck size={14} /> },
  ];
  const themeItems = [
    { value: 'dark', label: s.themeDark },
    { value: 'light', label: s.themeLight },
    { value: 'system', label: s.themeSystem },
  ];

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-base-app animate-slide-in-up">
      <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-zinc-900 px-4">
        <button
          onClick={requestClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
          title={s.back}
        >
          <ArrowLeft size={14} />
          {s.back}
        </button>
        <div className="h-4 w-px bg-zinc-850" />
        <h2 className="text-[13px] font-medium text-zinc-100">{s.pageTitle}</h2>
        <kbd className="ml-auto rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">Esc</kbd>
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
                !query && section === item.id ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200'
              }`}
            >
              <span className={!query && section === item.id ? 'text-primary' : ''}>{item.icon}</span>
              {item.label}
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
                      <FlowInput
                        id="claude-retries"
                        type="number"
                        min={1}
                        max={10}
                        value={config.claude.maxRetries}
                        onChange={(e) => setConfig({ ...config, claude: { ...config.claude, maxRetries: parseInt(e.target.value) || 3 } })}
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
                    <Row label={s.agyBudget} htmlFor="agy-budget">
                      <FlowInput
                        id="agy-budget"
                        type="number"
                        min={1}
                        max={5}
                        value={config.agy.budget}
                        onChange={(e) => setConfig({ ...config, agy: { ...config.agy, budget: parseInt(e.target.value) || 3 } })}
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
                        value={config.codex.binaryPath || 'codex'}
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
                  <Row label={s.defaultShell} htmlFor="default-shell">
                    <OptionSelect
                      id="default-shell"
                      value={config.defaultShell}
                      items={SHELLS}
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

              {!query && (
              <button
                onClick={handleReset}
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

      {/* Save bar, only while something is unsaved; on leaving it asks what to do with the changes. */}
      <div
        className={`flex flex-shrink-0 items-center gap-3 overflow-hidden border-t px-4 transition-[height,opacity,background-color,border-color] duration-200 ${
          dirty ? 'h-12 opacity-100' : 'h-0 opacity-0 border-t-0'
        } ${leaving ? 'border-primary/40 bg-primary/10' : 'border-zinc-900 bg-base-elevated'}`}
        aria-hidden={!dirty}
        role={leaving ? 'alertdialog' : undefined}
        aria-label={leaving ? s.leavePrompt : undefined}
      >
        <span className={`size-1.5 rounded-full bg-primary ${leaving ? 'animate-pulse' : ''}`} />
        <span className={`text-[12px] ${leaving ? 'text-zinc-100' : 'text-zinc-400'}`}>{leaving ? s.leavePrompt : s.unsaved}</span>
        <div className="ml-auto flex items-center gap-2">
          {leaving ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setLeaving(false)} tabIndex={dirty ? 0 : -1}>
                {s.stay}
              </Button>
              <Button variant="outline" size="sm" onClick={discardAndClose} tabIndex={dirty ? 0 : -1}>
                {s.discard}
              </Button>
              <Button size="sm" onClick={() => void saveAndClose()} tabIndex={dirty ? 0 : -1} autoFocus>
                {s.saveAndClose}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfig(saved)} tabIndex={dirty ? 0 : -1}>
                {s.undo}
              </Button>
              <Button size="sm" onClick={() => void handleSave()} tabIndex={dirty ? 0 : -1} title={`${s.save} (${SAVE_SHORTCUT})`}>
                {s.save}
                <kbd className="ml-1.5 font-mono text-[10px] opacity-60">{SAVE_SHORTCUT}</kbd>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
