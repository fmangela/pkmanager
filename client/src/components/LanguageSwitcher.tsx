import React from 'react';
import { App, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import { useResourceStore } from '../stores/resourceStore';

const LANGUAGE_OPTIONS = [
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'en', label: 'English' },
] as const;

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
      style={{ width: 128 }}
      value={i18n.language}
      options={LANGUAGE_OPTIONS.map((option) => ({ ...option }))}
      onChange={handleChange}
    />
  );
};

export default LanguageSwitcher;
