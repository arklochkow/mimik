import { i18n } from '#imports';
import { AI_LANGUAGES, type AILanguageCode } from './prompts';

const SUPPORTED = new Set<string>(AI_LANGUAGES.map((lang) => lang.code));

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
    const locale = i18n.t('meta.locale');
    if (SUPPORTED.has(locale)) return locale as AILanguageCode;
    const base = locale.split(/[-_]/)[0];
    if (SUPPORTED.has(base)) return base as AILanguageCode;
  } catch {}
  return 'en';
}
