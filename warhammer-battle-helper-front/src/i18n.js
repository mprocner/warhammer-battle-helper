import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import plTranslation from './locales/pl/translation.json';
import enSkills from './locales/en/skills.json';
import plSkills from './locales/pl/skills.json';

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    // Available languages
    resources: {
      en: {
        translation: enTranslation,
        skills: enSkills
      },
      pl: {
        translation: plTranslation,
        skills: plSkills
      }
    },
    // Fallback language if detection fails
    fallbackLng: 'en',
    // Supported languages
    supportedLngs: ['en', 'pl'],
    // Enable debug mode in development
    debug: process.env.NODE_ENV === 'development',

    // Detection options
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator'],
      // Cache user language in localStorage
      caches: ['localStorage'],
      // localStorage key name
      lookupLocalStorage: 'i18nextLng',
    },

    // Interpolation options
    interpolation: {
      // React already escapes values
      escapeValue: false
    },

    // React options
    react: {
      // Wait for translations to load before rendering
      useSuspense: true
    }
  });

export default i18n;
