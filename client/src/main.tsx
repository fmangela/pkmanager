import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { useDiagnosticStore } from './stores/diagnosticStore';
import { startListeningForEmulatorTabs } from './stores/emulatorActivityStore';
import './i18n/i18n';

// ── Device ID (持久化到 localStorage，每个浏览器/电脑唯一) ─────
const DEVICE_KEY = 'pkmanager_device_id';
if (!localStorage.getItem(DEVICE_KEY)) {
  localStorage.setItem(DEVICE_KEY, crypto.randomUUID());
}

// ── 跨标签页模拟器活动监听 (用于登出保护) ────────────────────
// 全局启动一次, 让 Dashboard/Devices 标签页感知其他网页模拟器标签页的心跳
startListeningForEmulatorTabs();

// ── Global Error Handlers ──────────────────────────────────────────
// These catch errors that escape React's error boundaries:
//   - window.onerror: synchronous JS errors in callbacks, event handlers
//   - unhandledrejection: Promise rejections without .catch()

window.addEventListener('error', (event: ErrorEvent) => {
  try {
    useDiagnosticStore.getState().log({
      category: 'unknown',
      level: 'error',
      message: event.message || 'Unknown global error',
      stack: event.error?.stack,
      context: `${event.filename}:${event.lineno}:${event.colno}`,
    });
  } catch {
    console.error('[global onerror]', event.error);
  }
  // Don't call preventDefault — let the browser also log it
});

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  try {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled Promise rejection';
    useDiagnosticStore.getState().log({
      category: 'unknown',
      level: 'error',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  } catch {
    console.error('[global unhandledrejection]', event.reason);
  }
});

// ── Mount ───────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
