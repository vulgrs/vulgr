import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as namespaces from './messages/index.js';
import { de } from './locales/de.js';
import { es } from './locales/es.js';
import { fr } from './locales/fr.js';

export type Lang = 'en' | 'tr' | 'de' | 'es' | 'fr';

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
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

/** English and Turkish live next to each other in messages/; the other languages are one file each in locales/. */
const LOCALES: Partial<Record<Lang, Messages>> = { de, es, fr };

export function getMessages(lang: Lang): Messages {
  const whole = LOCALES[lang];
  if (whole) return whole;
  const out = {} as Record<string, unknown>;
  for (const [key, table] of Object.entries(namespaces)) out[key] = table[lang === 'tr' ? 'tr' : 'en'];
  return out as Messages;
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: getMessages(lang) }), [lang, setLang]);
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
