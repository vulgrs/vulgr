/** Languages the engine writes its status lines in and asks agents to reply in. */
export type EngineLang = 'en' | 'tr' | 'de' | 'es' | 'fr' | 'ja' | 'zh' | 'ru';

/** English names, for telling an agent which language to reply in. */
export const LANG_NAMES: Record<EngineLang, string> = {
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
  ru: 'Russian',
};

/** The interface language sent by the app; anything unknown falls back to English. */
export function toEngineLang(value: unknown): EngineLang {
  return typeof value === 'string' && value in LANG_NAMES ? (value as EngineLang) : 'en';
}
