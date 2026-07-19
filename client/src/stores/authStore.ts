import { create } from 'zustand';
import { authApi, type AuthResponse } from '../api/auth';
import i18n from '../i18n/i18n';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthResponse['user'] | null;
  isAuthenticated: boolean;
  isRestoring: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setUser: (user: AuthResponse['user']) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isRestoring: false,

  login: async (username, password) => {
    const res = await authApi.login({ username, password });
    const { accessToken, refreshToken, user } = res.data;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('pkmanager_lang', user.preferredLang);
    await i18n.changeLanguage(user.preferredLang);
    set({ token: accessToken, refreshToken, user, isAuthenticated: true });
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password });
    // 注册成功后不自动登录，返回登录页
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refresh_token') ?? undefined;
    try {
      await authApi.logout(refreshToken);
    } catch {
      // 后端登出失败 (token 已过期/网络问题) 也清前端
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
  },

  restoreSession: async () => {
    if (get().isRestoring) return;
    set({ isRestoring: true });
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        // 无 refresh token, 清登录态
        localStorage.removeItem('access_token');
        set({ token: null, refreshToken: null, isAuthenticated: false });
        return;
      }
      // 用 refresh token 调 /auth/refresh 验证会话是否仍有效
      const res = await authApi.refresh(refreshToken);
      const { accessToken, refreshToken: newRefresh, user } = res.data;
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', newRefresh);
      localStorage.setItem('pkmanager_lang', user.preferredLang);
      await i18n.changeLanguage(user.preferredLang);
      set({ token: accessToken, refreshToken: newRefresh, user, isAuthenticated: true });
    } catch {
      // refresh 失败 → 清登录态
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
    } finally {
      set({ isRestoring: false });
    }
  },

  setUser: (user) => set({ user }),
}));
