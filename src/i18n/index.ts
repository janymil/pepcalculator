import { en } from './en';
import { es } from './es';
import { sk } from './sk';
import type { Lang, Strings } from './types';

/** All available languages. Add a `Lang` + dictionary to extend this. */
export const DICTIONARIES: Record<Lang, Strings> = { en, sk, es };

export const LANGUAGES: readonly Lang[] = ['en', 'sk', 'es'];

export const LANGUAGE_LABELS: Record<Lang, string> = { en: 'EN', sk: 'SK', es: 'ES' };

/** BCP-47 locales used for date and number formatting. */
export const LOCALES: Record<Lang, string> = { en: 'en-GB', sk: 'sk-SK', es: 'es-ES' };

/** Picks a sensible default language from the browser, falling back to English. */
export function detectLang(): Lang {
  if (typeof navigator !== 'undefined') {
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('sk') || nav.startsWith('cs')) return 'sk';
    if (nav.startsWith('es')) return 'es';
  }
  return 'en';
}

/**
 * Replaces `{placeholders}` in a template with the supplied values.
 * Used for warning messages such as "the volume {volume} mL exceeds {capacity} mL".
 */
export function interpolate(
  template: string,
  params?: Record<string, number | string>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}
