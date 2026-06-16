import axios from 'axios';
import { useDiagnosticStore } from '../stores/diagnosticStore';
import i18n from '../i18n/i18n';

const apiClient = axios.create({
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
// to diagnostic store, and handles 401 with a soft redirect.

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
  (error) => {
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
      const msg = firstError || data.title || '请求参数不合法';
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
          ? `请求超时 (${method} ${url})`
          : error.message === 'Network Error'
            ? `网络连接失败 (${method} ${url})`
            : error.message || `${method} ${url} 失败`;
      logApiError(url, method, status || 0, msg);
    }

    // ── 401: Soft redirect (save URL, delay, log) ─────────────────

    if (status === 401) {
      // Save current location so login can redirect back
      try {
        sessionStorage.setItem('pkmanager_return_url', window.location.href);
      } catch { /* ignore */ }

      // Log to diagnostic store
      try {
        useDiagnosticStore.getState().log({
          category: 'auth',
          level: 'warn',
          message: 'Token 已过期，即将跳转登录页',
          context: window.location.href,
        });
      } catch { /* ignore */ }

      // Clear tokens
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');

      // Delay redirect to allow diagnostic store to persist + user to see context
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    }

    return Promise.reject(error);
  },
);

export default apiClient;
