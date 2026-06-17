import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhHansCommon from './locales/zh-Hans/common.json';
import zhHansMessages from './locales/zh-Hans/messages.json';
import zhHansPages from './locales/zh-Hans/pages.json';
import zhHansEditor from './locales/zh-Hans/editor.json';
import zhHansGames from './locales/zh-Hans/games.json';
import zhHansEmulator from './locales/zh-Hans/emulator.json';

import zhHantCommon from './locales/zh-Hant/common.json';
import zhHantMessages from './locales/zh-Hant/messages.json';
import zhHantPages from './locales/zh-Hant/pages.json';
import zhHantEditor from './locales/zh-Hant/editor.json';
import zhHantGames from './locales/zh-Hant/games.json';
import zhHantEmulator from './locales/zh-Hant/emulator.json';

import enCommon from './locales/en/common.json';
import enMessages from './locales/en/messages.json';
import enPages from './locales/en/pages.json';
import enEditor from './locales/en/editor.json';
import enGames from './locales/en/games.json';
import enEmulator from './locales/en/emulator.json';

import jaCommon from './locales/ja/common.json';
import jaMessages from './locales/ja/messages.json';
import jaPages from './locales/ja/pages.json';
import jaEditor from './locales/ja/editor.json';
import jaGames from './locales/ja/games.json';
import jaEmulator from './locales/ja/emulator.json';

import frCommon from './locales/fr/common.json';
import frMessages from './locales/fr/messages.json';
import frPages from './locales/fr/pages.json';
import frEditor from './locales/fr/editor.json';
import frGames from './locales/fr/games.json';
import frEmulator from './locales/fr/emulator.json';

import itCommon from './locales/it/common.json';
import itMessages from './locales/it/messages.json';
import itPages from './locales/it/pages.json';
import itEditor from './locales/it/editor.json';
import itGames from './locales/it/games.json';
import itEmulator from './locales/it/emulator.json';

import deCommon from './locales/de/common.json';
import deMessages from './locales/de/messages.json';
import dePages from './locales/de/pages.json';
import deEditor from './locales/de/editor.json';
import deGames from './locales/de/games.json';
import deEmulator from './locales/de/emulator.json';

import esCommon from './locales/es/common.json';
import esMessages from './locales/es/messages.json';
import esPages from './locales/es/pages.json';
import esEditor from './locales/es/editor.json';
import esGames from './locales/es/games.json';
import esEmulator from './locales/es/emulator.json';

import es419Common from './locales/es-419/common.json';
import es419Messages from './locales/es-419/messages.json';
import es419Pages from './locales/es-419/pages.json';
import es419Editor from './locales/es-419/editor.json';
import es419Games from './locales/es-419/games.json';
import es419Emulator from './locales/es-419/emulator.json';

import koCommon from './locales/ko/common.json';
import koMessages from './locales/ko/messages.json';
import koPages from './locales/ko/pages.json';
import koEditor from './locales/ko/editor.json';
import koGames from './locales/ko/games.json';
import koEmulator from './locales/ko/emulator.json';

export const SUPPORTED_LANGS = [
  'zh-Hans',
  'zh-Hant',
  'en',
  'ja',
  'fr',
  'it',
  'de',
  'es',
  'es-419',
  'ko',
] as const;

export const ROLLOUT_LANGS = [
  'zh-Hans',
  'en',
  'zh-Hant',
  'ja',
] as const;

export const FALLBACK_LANG = 'zh-Hans';

function normalizeClientLang(lang: string): string {
  if (lang === 'zh-Hans' || lang === 'zh-Hant' || lang === 'es-419') return lang;

  switch (lang) {
    case 'zh':
    case 'zh-CN':
    case 'zh-cn':
    case 'zh-Hans':
    case 'zh-hans':
      return 'zh-Hans';
    case 'zh-TW':
    case 'zh-tw':
    case 'zh-HK':
    case 'zh-hk':
    case 'zh-Hant':
    case 'zh-hant':
      return 'zh-Hant';
    case 'en-US':
    case 'en-GB':
    case 'en-us':
    case 'en-gb':
      return 'en';
    case 'ja':
    case 'fr':
    case 'it':
    case 'de':
    case 'es':
    case 'ko':
      return lang;
    case 'es-MX':
    case 'es-mx':
    case 'es-AR':
    case 'es-ar':
      return 'es-419';
    default:
      if (lang.startsWith('es-')) return 'es';
      if (lang.startsWith('zh-')) return lang.toLowerCase().includes('hant') ? 'zh-Hant' : 'zh-Hans';
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
      'zh-Hant': {
        common: zhHantCommon,
        messages: zhHantMessages,
        pages: zhHantPages,
        editor: zhHantEditor,
        games: zhHantGames,
        emulator: zhHantEmulator,
      },
      en: {
        common: enCommon,
        messages: enMessages,
        pages: enPages,
        editor: enEditor,
        games: enGames,
        emulator: enEmulator,
      },
      ja: {
        common: jaCommon,
        messages: jaMessages,
        pages: jaPages,
        editor: jaEditor,
        games: jaGames,
        emulator: jaEmulator,
      },
      fr: {
        common: frCommon,
        messages: frMessages,
        pages: frPages,
        editor: frEditor,
        games: frGames,
        emulator: frEmulator,
      },
      it: {
        common: itCommon,
        messages: itMessages,
        pages: itPages,
        editor: itEditor,
        games: itGames,
        emulator: itEmulator,
      },
      de: {
        common: deCommon,
        messages: deMessages,
        pages: dePages,
        editor: deEditor,
        games: deGames,
        emulator: deEmulator,
      },
      es: {
        common: esCommon,
        messages: esMessages,
        pages: esPages,
        editor: esEditor,
        games: esGames,
        emulator: esEmulator,
      },
      'es-419': {
        common: es419Common,
        messages: es419Messages,
        pages: es419Pages,
        editor: es419Editor,
        games: es419Games,
        emulator: es419Emulator,
      },
      ko: {
        common: koCommon,
        messages: koMessages,
        pages: koPages,
        editor: koEditor,
        games: koGames,
        emulator: koEmulator,
      },
    },
    fallbackLng: FALLBACK_LANG,
    partialBundledLanguages: true,
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
