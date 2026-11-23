import { i18n } from '@/core/env';
import { resolveByLocale } from './locale';
import { AI_LANGUAGES, type AILanguageCode } from './prompts';

const SUPPORTED: Readonly<Record<string, AILanguageCode>> = Object.fromEntries(
  AI_LANGUAGES.map(({ code }) => [code, code]),
);

/**
 * The language AI text is written in when the user has never picked one.
 *
 * It falls back to the locale the interface resolved to rather than English: a
 * Russian panel that writes English step descriptions contradicts the language
 * the user is reading, and the UI locale is the closest thing to an answer they
 * have already given. Anything unsupported still lands on English.
 */
export function defaultAILanguage(): AILanguageCode {
  try {
    const locale = resolveByLocale(SUPPORTED, i18n.t('meta.locale'));
    if (locale) return locale;
  } catch {}
  return 'en';
}
