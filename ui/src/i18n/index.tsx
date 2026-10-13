import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as namespaces from './messages/index.js';

export type Lang = 'en' | 'tr' | 'de' | 'es' | 'fr' | 'ja' | 'zh' | 'ru';

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '简体中文' },
  { value: 'ru', label: 'Русский' },
];

type Namespaces = typeof namespaces;
export type Messages = { [K in keyof Namespaces]: Namespaces[K]['en'] };

const STORAGE_KEY = 'vulgaris.lang';

const isLang = (value: unknown): value is Lang => LANGUAGES.some((l) => l.value === value);

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {}
  const system = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase().slice(0, 2) : '';
  return isLang(system) ? system : 'en';
}

/**
 * English and Turkish live next to each other in messages/ and are always loaded.
 * The other languages are one file each in locales/, loaded only when chosen,
 * so they don't slow down starting the app.
 */
const LOADERS: Partial<Record<Lang, () => Promise<Messages>>> = {
  de: () => import('./locales/de.js').then((m) => m.de),
  es: () => import('./locales/es.js').then((m) => m.es),
  fr: () => import('./locales/fr.js').then((m) => m.fr),
  ja: () => import('./locales/ja.js').then((m) => m.ja),
  zh: () => import('./locales/zh.js').then((m) => m.zh),
  ru: () => import('./locales/ru.js').then((m) => m.ru),
};
const loaded: Partial<Record<Lang, Messages>> = {};

function builtIn(lang: 'en' | 'tr'): Messages {
  const out = {} as Record<string, unknown>;
  for (const [key, table] of Object.entries(namespaces)) out[key] = table[lang];
  return out as Messages;
}

/** The language's messages if they are already at hand, without loading anything. */
export function getMessages(lang: Lang): Messages | undefined {
  if (lang === 'en' || lang === 'tr') return (loaded[lang] ??= builtIn(lang));
  return loaded[lang];
}

/** Loads a language's messages; falls back to English if its file can't be loaded. */
export async function loadMessages(lang: Lang): Promise<Messages> {
  const ready = getMessages(lang);
  if (ready) return ready;
  try {
    return (loaded[lang] = await LOADERS[lang]!());
  } catch (err) {
    console.error(`Failed to load the ${lang} interface language:`, err);
    return getMessages('en')!;
  }
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectLang);
  // The language on screen; it switches once the chosen one's messages have loaded.
  const [shown, setShown] = useState<{ lang: Lang; t: Messages } | null>(() => {
    const t = getMessages(lang);
    return t ? { lang, t } : null;
  });

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  useEffect(() => {
    let live = true;
    loadMessages(lang).then((t) => {
      if (live) setShown({ lang, t });
    });
    return () => {
      live = false;
    };
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => (shown ? { lang, setLang, t: shown.t } : null), [lang, setLang, shown]);
  // Only when starting in a language that isn't loaded yet; that takes a moment, and
  // showing English first would flash the wrong language.
  if (!value) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

// Hot-swapping this module would create a new context that already-mounted
// providers don't supply, crashing every consumer; reload the page instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => import.meta.hot?.invalidate());
}
