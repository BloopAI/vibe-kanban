/**
 * Centralized language configuration for the i18n system.
 * This eliminates duplicate language names in translation files and provides
 * a single source of truth for supported languages.
 */

export type { UiLanguage } from '../../../shared/types';

export const UI_TO_I18N = {
  EN: 'en',
  JA: 'ja',
  ES: 'es',
  KO: 'ko',
} as const;

const SUPPORTED_UI_LANGUAGES = ['BROWSER', 'EN', 'JA', 'ES', 'KO'] as const;
export const SUPPORTED_I18N_CODES = Object.values(UI_TO_I18N);

const FALLBACK_ENDONYMS = {
  en: 'English',
  ja: '日本語',
  es: 'Español',
  ko: '한국어',
} as const;

/**
 * Convert UiLanguage enum value to i18next language code
 */
export function uiLanguageToI18nCode(uiLang: string): string | undefined {
  return uiLang === 'BROWSER'
    ? undefined
    : UI_TO_I18N[uiLang as keyof typeof UI_TO_I18N];
}

/**
 * Get the native name (endonym) of a language using Intl.DisplayNames
 */
function getEndonym(langCode: string): string {
  try {
    return (
      new Intl.DisplayNames([langCode], { type: 'language' }).of(langCode) ||
      FALLBACK_ENDONYMS[langCode as keyof typeof FALLBACK_ENDONYMS] ||
      langCode
    );
  } catch {
    return (
      FALLBACK_ENDONYMS[langCode as keyof typeof FALLBACK_ENDONYMS] || langCode
    );
  }
}

/**
 * Get language options for dropdown with proper display names
 */
export function getLanguageOptions(browserDefaultLabel: string) {
  return SUPPORTED_UI_LANGUAGES.map((ui) => ({
    value: ui,
    label:
      ui === 'BROWSER'
        ? browserDefaultLabel
        : getEndonym(UI_TO_I18N[ui as keyof typeof UI_TO_I18N]),
  }));
}
