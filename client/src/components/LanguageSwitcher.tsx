import React from 'react';
import { App, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import { useResourceStore } from '../stores/resourceStore';
import { SUPPORTED_LANGS } from '../i18n/i18n';

const LANGUAGE_LABELS: Record<string, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
  es: 'Español',
  'es-419': 'Español (LatAm)',
  ko: '한국어',
};

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation(['messages', 'common']);
  const { message } = App.useApp();
  const loadResources = useResourceStore((s) => s.loadAll);

  const handleChange = async (lang: string) => {
    const prev = i18n.language;
    localStorage.setItem('pkmanager_lang', lang);
    await i18n.changeLanguage(lang);
    try {
      await authApi.setLanguage(lang);
      await loadResources();
    } catch {
      localStorage.setItem('pkmanager_lang', prev);
      await i18n.changeLanguage(prev);
      message.error(t('saveFailed', { defaultValue: '保存失败' }));
    }
  };

  return (
    <Select
      size="small"
      style={{ width: 180 }}
      value={i18n.language}
      options={SUPPORTED_LANGS.map((value) => ({
        value,
        label: LANGUAGE_LABELS[value] ?? value,
      }))}
      onChange={handleChange}
    />
  );
};

export default LanguageSwitcher;
