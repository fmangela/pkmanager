import axios from 'axios';
import { useDiagnosticStore } from '../stores/diagnosticStore';
import i18n from '../i18n/i18n';
import { getI18nText } from '../i18n/i18n';

export interface ApiError {
  code?: string;
  message?: string;
  config?: {
    url?: string;
    method?: string;
  };
  response?: {
    status?: number;
    data?: {
      code?: number;
      message?: string;
      title?: string;
      errors?: Record<string, string[] | string>;
    };
  };
}

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Raw axios instance for internal refresh calls — bypasses response interceptor
// (avoids recursive 401 handling + ApiResponse unwrapping quirks)
const rawClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Diagnostic logging helper ───────────────────────────────────────

function logApiError(url: string, method: string, status: number, message: string) {
  try {
    useDiagnosticStore.getState().log({
      category: 'api',
      level: status >= 500 ? 'error' : 'warn',
      message: `[${method}] ${url} → ${status}: ${message}`,
      context: JSON.stringify({ url, method, status }),
    });
  } catch {
    // Diagnostic store not available — silently ignore
  }
}

// ── Request interceptor ─────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Device fingerprint
  const deviceId = localStorage.getItem('pkmanager_device_id');
  if (deviceId) {
    config.headers['X-Device-Id'] = deviceId;
  }
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

// ── Response interceptor ────────────────────────────────────────────
// Unwraps ApiResponse<T> { code, message, data }, logs errors
// to diagnostic store, and handles 401 with refresh-token auto-renew.

// Single-flight refresh: multiple concurrent 401s share the same refresh promise.
let _refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('no refresh token');

    // Use rawClient to bypass the response interceptor (avoid recursive 401 handling)
    const deviceId = localStorage.getItem('pkmanager_device_id');
    const res = await rawClient.post('/auth/refresh', { refreshToken }, {
      headers: deviceId ? { 'X-Device-Id': deviceId } : undefined,
    });
    const body = res.data as { code: number; data?: { accessToken: string; refreshToken: string }; message?: string };
    if (body.code !== 0 || !body.data) {
      throw new Error(body.message || 'refresh failed');
    }
    localStorage.setItem('access_token', body.data.accessToken);
    localStorage.setItem('refresh_token', body.data.refreshToken);
    return body.data.accessToken;
  })().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

function isRefreshRequest(url?: string): boolean {
  if (!url) return false;
  return url.includes('/auth/refresh') || url.includes('/auth/logout');
}

function redirectToLogin() {
  try {
    sessionStorage.setItem('pkmanager_return_url', window.location.href);
  } catch { /* ignore */ }
  try {
    useDiagnosticStore.getState().log({
      category: 'auth',
      level: 'warn',
      message: getI18nText('api.tokenExpiredRedirect', undefined, 'messages') || 'Token 已过期，即将跳转登录页',
      context: window.location.href,
    });
  } catch { /* ignore */ }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  setTimeout(() => {
    window.location.href = '/login';
  }, 1500);
}

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;

    // Unwrap ApiResponse<T> { code, message, data }
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      if (body.code !== 0) {
        const msg = body.message || `API error code=${body.code}`;
        logApiError(
          response.config.url || '',
          response.config.method?.toUpperCase() || 'GET',
          body.code,
          msg,
        );
        return Promise.reject({
          response: { status: body.code, data: { message: msg } },
        });
      }
      // Unwrap: response.data = body.data
      response.data = body.data;
      return response;
    }

    return response;
  },
  async (error) => {
    const url = error.config?.url || '';
    const method = error.config?.method?.toUpperCase() || 'GET';
    const status = error.response?.status || 0;
    const data = error.response?.data;

    // Handle ASP.NET Core validation errors (ProblemDetails format)
    if (data?.errors && typeof data.errors === 'object') {
      const firstKey = Object.keys(data.errors)[0];
      const firstError = Array.isArray(data.errors[firstKey])
        ? data.errors[firstKey][0]
        : data.errors[firstKey];
      const msg = firstError || data.title || getI18nText('api.validationInvalid', undefined, 'messages') || '请求参数不合法';
      error.response.data = { message: msg };
      logApiError(url, method, status, msg);
    }

    // Handle ApiResponse-format errors
    if (data?.message && data?.code) {
      error.response.data = { message: data.message };
      logApiError(url, method, status, data.message);
    }

    // Log other errors (network errors, timeouts, etc.)
    if (!data?.message && !data?.errors) {
      const msg =
        error.code === 'ECONNABORTED'
          ? `${getI18nText('api.timeout', undefined, 'messages') || '请求超时'} (${method} ${url})`
          : error.message === 'Network Error'
            ? `${getI18nText('api.networkError', undefined, 'messages') || '网络连接失败'} (${method} ${url})`
            : error.message || `${method} ${url} ${getI18nText('api.requestFailed', undefined, 'messages') || '失败'}`;
      logApiError(url, method, status || 0, msg);
    }

    // ── 401: try refresh-token auto-renew, fall back to login redirect ──

    if (status === 401 && !isRefreshRequest(url) && !error.config?._retried) {
      try {
        const newAccessToken = await refreshAccessToken();
        // Replay original request with new token
        const newConfig = {
          ...error.config,
          _retried: true,
          headers: {
            ...error.config?.headers,
            Authorization: `Bearer ${newAccessToken}`,
          },
        };
        return apiClient.request(newConfig);
      } catch {
        // refresh failed (refresh token expired/revoked) → kick to login
        redirectToLogin();
        return Promise.reject(error);
      }
    }

    // refresh endpoint itself returned 401, or retry already failed → redirect
    if (status === 401) {
      redirectToLogin();
    }

    return Promise.reject(error);
  },
);

export default apiClient;
