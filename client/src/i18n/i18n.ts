import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhHansCommon from './locales/zh-Hans/common.json';
import zhHansMessages from './locales/zh-Hans/messages.json';
import zhHansPages from './locales/zh-Hans/pages.json';
import zhHansEditor from './locales/zh-Hans/editor.json';
import zhHansGames from './locales/zh-Hans/games.json';
import zhHansEmulator from './locales/zh-Hans/emulator.json';

import enCommon from './locales/en/common.json';
import enMessages from './locales/en/messages.json';
import enPages from './locales/en/pages.json';
import enEditor from './locales/en/editor.json';
import enGames from './locales/en/games.json';
import enEmulator from './locales/en/emulator.json';

export const SUPPORTED_LANGS = [
  'zh-Hans',
  'en',
] as const;

export const FALLBACK_LANG = 'zh-Hans';

function normalizeClientLang(lang: string): string {
  switch (lang) {
    case 'zh':
    case 'zh-CN':
    case 'zh-cn':
      return 'zh-Hans';
    case 'zh-TW':
    case 'zh-tw':
    case 'zh-HK':
    case 'zh-hk':
      return 'zh-Hant';
    case 'en-US':
    case 'en-GB':
    case 'en-us':
    case 'en-gb':
      return 'en';
    case 'es-MX':
    case 'es-mx':
    case 'es-AR':
    case 'es-ar':
      return 'es-419';
    default:
      if (lang.startsWith('es-')) return 'es';
      if (lang.includes('-')) return lang.split('-')[0];
      return lang;
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-Hans': {
        common: zhHansCommon,
        messages: zhHansMessages,
        pages: zhHansPages,
        editor: zhHansEditor,
        games: zhHansGames,
        emulator: zhHansEmulator,
      },
      en: {
        common: enCommon,
        messages: enMessages,
        pages: enPages,
        editor: enEditor,
        games: enGames,
        emulator: enEmulator,
      },
    },
    fallbackLng: FALLBACK_LANG,
    supportedLngs: [...SUPPORTED_LANGS],
    defaultNS: 'common',
    ns: ['common', 'messages', 'pages', 'editor', 'games', 'emulator'],
    interpolation: { escapeValue: false },
    detection: {
      // localStorage 是 users.preferred_lang 的客户端缓存。
      // 登录后 auth/me 返回真实 preferredLang → i18n.changeLanguage() 覆盖。
      // 未登录时，localStorage / navigator 仅用于登录页和注册页的 UI 语言。
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'pkmanager_lang',
      caches: ['localStorage'],
      convertDetectedLanguage: normalizeClientLang,
    },
  });

export default i18n;

export function getI18nGameName(gameId: string): string {
  return i18n.t(gameId, { ns: 'games', defaultValue: gameId });
}

export function getI18nText(
  key: string,
  options?: Record<string, unknown>,
  ns: string = 'common',
): string {
  return i18n.t(key, { ns, ...(options ?? {}) });
}
