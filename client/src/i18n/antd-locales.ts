import enUS from 'antd/locale/en_US';
import zhTW from 'antd/locale/zh_TW';
import jaJP from 'antd/locale/ja_JP';
import frFR from 'antd/locale/fr_FR';
import itIT from 'antd/locale/it_IT';
import deDE from 'antd/locale/de_DE';
import esES from 'antd/locale/es_ES';
import koKR from 'antd/locale/ko_KR';
import zhCN from 'antd/locale/zh_CN';

const ANTD_LOCALE_MAP: Record<string, typeof zhCN> = {
  'zh-Hans': zhCN,
  'zh-Hant': zhTW,
  en: enUS,
  ja: jaJP,
  fr: frFR,
  it: itIT,
  de: deDE,
  es: esES,
  'es-419': esES,
  ko: koKR,
};

export function getAntdLocale(lang: string) {
  return ANTD_LOCALE_MAP[lang] || zhCN;
}
