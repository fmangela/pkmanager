import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';

const ANTD_LOCALE_MAP: Record<string, typeof zhCN> = {
  'zh-Hans': zhCN,
  en: enUS,
};

export function getAntdLocale(lang: string) {
  return ANTD_LOCALE_MAP[lang] || zhCN;
}
