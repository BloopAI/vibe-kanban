import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enCommon from './locales/en/common.json';
import enSettings from './locales/en/settings.json';
import enProjects from './locales/en/projects.json';
import jaCommon from './locales/ja/common.json';
import jaSettings from './locales/ja/settings.json';
import jaProjects from './locales/ja/projects.json';

const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    projects: enProjects,
  },
  ja: {
    common: jaCommon,
    settings: jaSettings,
    projects: jaProjects,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    debug: import.meta.env.DEV,

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // Avoid suspense for now to simplify initial setup
    },

    detection: {
      order: ['navigator', 'htmlTag'],
      caches: [], // Disable localStorage cache - we'll handle this via config
    },
  });

// Debug logging in development
if (import.meta.env.DEV) {
  console.log('i18n initialized:', i18n.isInitialized);
  console.log('i18n language:', i18n.language);
  console.log('i18n namespaces:', i18n.options.ns);
  console.log('Common bundle loaded:', i18n.hasResourceBundle('en', 'common'));
}

// Function to update language from config
export const updateLanguageFromConfig = (configLanguage: string) => {
  if (configLanguage === 'BROWSER') {
    // Use browser detection
    const detected = i18n.services.languageDetector?.detect();
    const detectedLang = Array.isArray(detected) ? detected[0] : detected;
    i18n.changeLanguage(detectedLang || 'en');
  } else {
    // Use explicit language selection
    const langCode = configLanguage.toLowerCase();
    i18n.changeLanguage(langCode);
  }
};

export default i18n;
