import { create } from 'zustand';
import { authApi, type AuthResponse } from '../api/auth';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthResponse['user'] | null;
  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (username, password) => {
    const res = await authApi.login({ username, password });
    const { accessToken, refreshToken, user } = res.data;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    set({ token: accessToken, refreshToken, user, isAuthenticated: true });
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password });
    // 注册成功后不自动登录，返回登录页
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
  },

  restoreSession: () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      set({ token, isAuthenticated: true });
    }
  },
}));
