/**
 * Centralized language configuration for the i18n system.
 * This eliminates duplicate language names in translation files and provides
 * a single source of truth for supported languages.
 */

// Re-export UiLanguage for convenience
export type { UiLanguage } from '../../../shared/types';

// Supported UI languages (excluding BROWSER which is a special case)
export type SupportedUiLanguage = 'EN' | 'JA' | 'ES';

// Mapping from UiLanguage enum values to i18next language codes
export const UI_TO_I18N: Record<SupportedUiLanguage, string> = {
  EN: 'en',
  JA: 'ja',
  ES: 'es',
};

// List of all supported i18next language codes
export const SUPPORTED_I18N_CODES = Object.values(UI_TO_I18N);

// All available UI language options (including BROWSER)
export const ALL_UI_LANGUAGES: Array<'BROWSER' | SupportedUiLanguage> = [
  'BROWSER',
  'EN', 
  'JA',
  'ES'
];

// Fallback endonyms for browsers that don't support Intl.DisplayNames
const FALLBACK_ENDONYMS: Record<string, string> = {
  en: 'English',
  ja: '日本語', 
  es: 'Español',
};

/**
 * Convert UiLanguage enum value to i18next language code
 * @param uiLang - UiLanguage enum value
 * @returns i18next language code or null for BROWSER
 */
export function uiLanguageToI18nCode(uiLang: string): string | null {
  if (uiLang === 'BROWSER') {
    return null;
  }
  return UI_TO_I18N[uiLang as SupportedUiLanguage] || null;
}

/**
 * Get the native name (endonym) of a language using Intl.DisplayNames
 * @param langCode - i18next language code (e.g., 'en', 'ja', 'es')
 * @returns Native name of the language
 */
export function getLanguageEndonym(langCode: string): string {
  try {
    const displayNames = new Intl.DisplayNames([langCode], { type: 'language' });
    return displayNames.of(langCode) || FALLBACK_ENDONYMS[langCode] || langCode;
  } catch {
    // Fallback for older browsers or unsupported language codes
    return FALLBACK_ENDONYMS[langCode] || langCode;
  }
}

/**
 * Get display name for a UiLanguage value
 * @param uiLang - UiLanguage enum value
 * @param browserDefaultLabel - Label to show for BROWSER option
 * @returns Display name for the language option
 */
export function getUiLanguageDisplayName(
  uiLang: string, 
  browserDefaultLabel: string = 'Browser Default'
): string {
  if (uiLang === 'BROWSER') {
    return browserDefaultLabel;
  }
  
  const i18nCode = uiLanguageToI18nCode(uiLang);
  if (!i18nCode) {
    return uiLang; // Fallback to enum value
  }
  
  return getLanguageEndonym(i18nCode);
}

/**
 * Language metadata interface
 */
export interface LanguageInfo {
  uiValue: string;
  i18nCode: string | null;
  displayName: string;
  nativeName: string;
}

/**
 * Get complete language information for all supported languages
 * @param browserDefaultLabel - Label for browser default option
 * @returns Array of language information objects
 */
export function getAllLanguageInfo(browserDefaultLabel: string = 'Browser Default'): LanguageInfo[] {
  return ALL_UI_LANGUAGES.map(uiLang => {
    const i18nCode = uiLanguageToI18nCode(uiLang);
    const displayName = getUiLanguageDisplayName(uiLang, browserDefaultLabel);
    const nativeName = i18nCode ? getLanguageEndonym(i18nCode) : browserDefaultLabel;
    
    return {
      uiValue: uiLang,
      i18nCode,
      displayName,
      nativeName,
    };
  });
}
