import type { Locale, TranslationKey, Translations } from './types.ts';
import { en } from './en.ts';
import { zh } from './zh.ts';

export type { Locale, TranslationKey, Translations };

const locales: Record<Locale, Translations> = { en, zh };

let currentLocale: Locale = 'en';
let currentTranslations: Translations = en;

const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  currentTranslations = locales[locale] ?? en;
  for (const fn of listeners) {
    fn(locale);
  }
}

export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Translate a key with optional interpolation params.
 *
 * @example
 *   t('chat.send')                      // "Send" | "发送"
 *   t('skills.shown', { count: 42 })    // "42 shown" | "42 个"
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let text = currentTranslations[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** Detect browser language and return the matching locale. */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language ?? '';
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
