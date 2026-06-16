// ── ThemeProvider ─────────────────────────────────────────────────
// 管理亮色/暗色/跟随系统三态主题切换。
// 关键：同步 data-theme 到 document.documentElement，让 CSS 变量
// 和硬编码内联样式都能感知当前主题，避免"组件变暗、壳层仍亮"。
//
// 持久化：localStorage key = "pkmanager_theme"
// 值: "light" | "dark" | "system"

import React, { useEffect, useState, useMemo, useCallback, useSyncExternalStore } from 'react';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { useTranslation } from 'react-i18next';
import { getAntdLocale } from '../i18n/antd-locales';
import { ThemeContext, type ThemeContextValue, type ThemeMode } from './theme-context';

// ── useSystemPrefersDark ─────────────────────────────────────────

function useSystemPrefersDark(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }, []);

  const getSnapshot = useCallback(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}

// ── ThemeProvider component ───────────────────────────────────────

const THEME_STORAGE_KEY = 'pkmanager_theme';

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch { /* localStorage disabled */ }
  return 'system';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const prefersDark = useSystemPrefersDark();

  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  const algorithm = isDark ? theme.darkAlgorithm : theme.defaultAlgorithm;
  const antdLocale = useMemo(() => getAntdLocale(i18n.language), [i18n.language]);
  const themeConfig = useMemo(() => ({
    algorithm,
    token: {
      colorPrimary: '#148a82',
      colorInfo: '#4b86d9',
      colorSuccess: '#2f9d62',
      colorWarning: '#d08b1f',
      colorError: '#d65252',
      borderRadius: 18,
      borderRadiusLG: 24,
      borderRadiusSM: 12,
      controlHeight: 40,
      controlHeightSM: 32,
      fontFamily: '"Avenir Next", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      fontFamilyCode: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
    },
  }), [algorithm]);

  // 同步 data-theme 到 documentElement — 关键：让 CSS 变量和内联样式感知主题
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try { localStorage.setItem(THEME_STORAGE_KEY, newMode); } catch { /* ignore */ }
  }, []);

  const ctxValue = useMemo<ThemeContextValue>(
    () => ({ mode, isDark, setMode }),
    [mode, isDark, setMode],
  );

  return (
    <ThemeContext.Provider value={ctxValue}>
      <ConfigProvider locale={antdLocale} theme={themeConfig}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};
