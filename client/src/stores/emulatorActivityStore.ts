import { create } from 'zustand';

// ── 跨标签页模拟器活动跟踪 ───────────────────────────────────
// 用途: 当用户在「本地游玩」或「网页游玩」未同步存档时, 阻止登出避免丢失存档
// - localLaunch: 由 localLaunch.ts 在成功触发本地模拟器启动时写入
//   (本机脚本退出时会自动 POST 回传存档, 但当前标签页无法感知, 需用户在拦截弹窗中确认「已退出」)
// - webTabs: 由 Emulator/NdsEmulator 标签页通过 BroadcastChannel 心跳上报
//   (dirty = !synced 表示尚未成功同步过存档)

const CHANNEL_NAME = 'pkmanager-emulator-activity';
const HEARTBEAT_INTERVAL_MS = 3000;
const STALE_AFTER_MS = 10000;
const PRUNE_INTERVAL_MS = 3000;

export interface LocalLaunchInfo {
  saveFileId: string;
  filename?: string;
  startedAt: number;
}

export interface WebEmulatorTabInfo {
  tabId: string;
  saveFileId: string;
  dirty: boolean;
  lastSeen: number;
}

type ChannelMessage =
  | { type: 'alive'; tabId: string; saveFileId: string; dirty: boolean }
  | { type: 'bye'; tabId: string };

interface EmulatorActivityState {
  localLaunch: LocalLaunchInfo | null;
  webTabs: Map<string, WebEmulatorTabInfo>;

  startLocalLaunch: (saveFileId: string, filename?: string) => void;
  clearLocalLaunch: () => void;

  _ingestMessage: (msg: ChannelMessage) => void;
  _pruneStale: () => void;
}

export const useEmulatorActivityStore = create<EmulatorActivityState>((set) => ({
  localLaunch: null,
  webTabs: new Map(),

  startLocalLaunch: (saveFileId, filename) => {
    set({ localLaunch: { saveFileId, filename, startedAt: Date.now() } });
  },
  clearLocalLaunch: () => set({ localLaunch: null }),

  _ingestMessage: (msg) => {
    if (msg.type === 'alive') {
      set((state) => {
        const next = new Map(state.webTabs);
        next.set(msg.tabId, {
          tabId: msg.tabId,
          saveFileId: msg.saveFileId,
          dirty: msg.dirty,
          lastSeen: Date.now(),
        });
        return { webTabs: next };
      });
    } else if (msg.type === 'bye') {
      set((state) => {
        if (!state.webTabs.has(msg.tabId)) return state;
        const next = new Map(state.webTabs);
        next.delete(msg.tabId);
        return { webTabs: next };
      });
    }
  },

  _pruneStale: () => {
    const cutoff = Date.now() - STALE_AFTER_MS;
    set((state) => {
      let changed = false;
      const next = new Map<string, WebEmulatorTabInfo>();
      for (const [tabId, info] of state.webTabs) {
        if (info.lastSeen >= cutoff) {
          next.set(tabId, info);
        } else {
          changed = true;
        }
      }
      return changed ? { webTabs: next } : state;
    });
  },
}));

let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/**
 * 由 Emulator/NdsEmulator 标签页调用, 上报本标签页状态 (心跳 + 退出通知)
 * 返回 cleanup 函数, 在组件 unmount 时调用
 */
export function registerWebEmulatorTab(
  tabId: string,
  getSaveFileId: () => string | null,
  getDirty: () => boolean,
): () => void {
  const ch = ensureChannel();
  if (!ch) return () => {};

  const sendAlive = () => {
    const saveFileId = getSaveFileId() ?? '(new-game)';
    ch.postMessage({
      type: 'alive',
      tabId,
      saveFileId,
      dirty: getDirty(),
    } satisfies ChannelMessage);
  };
  const sendBye = () => {
    ch.postMessage({ type: 'bye', tabId } satisfies ChannelMessage);
  };

  sendAlive();
  const timer = setInterval(sendAlive, HEARTBEAT_INTERVAL_MS);

  // 页面隐藏/关闭时尽力发送 bye, 让 Dashboard 立即解除阻塞
  const onPageHide = () => sendBye();
  window.addEventListener('pagehide', onPageHide);

  return () => {
    clearInterval(timer);
    window.removeEventListener('pagehide', onPageHide);
    sendBye();
  };
}

/**
 * 由 Dashboard/Devices 标签页调用, 监听模拟器标签页心跳
 * 返回 cleanup 函数
 */
export function startListeningForEmulatorTabs(): () => void {
  const ch = ensureChannel();
  if (!ch) return () => {};

  const handler = (e: MessageEvent<ChannelMessage>) => {
    if (e.data) useEmulatorActivityStore.getState()._ingestMessage(e.data);
  };
  ch.addEventListener('message', handler);

  const timer = setInterval(() => {
    useEmulatorActivityStore.getState()._pruneStale();
  }, PRUNE_INTERVAL_MS);

  return () => {
    ch.removeEventListener('message', handler);
    clearInterval(timer);
  };
}

// ── 查询辅助 ────────────────────────────────────────────

export function hasActiveLocalLaunch(): boolean {
  return useEmulatorActivityStore.getState().localLaunch !== null;
}

export function hasUnsyncedWebTabs(): boolean {
  for (const tab of useEmulatorActivityStore.getState().webTabs.values()) {
    if (tab.dirty) return true;
  }
  return false;
}

/**
 * 登出前检查 — 返回 true 表示可以登出, false 表示有阻塞
 */
export function canLogout(): boolean {
  return !hasActiveLocalLaunch() && !hasUnsyncedWebTabs();
}

/**
 * 生成稳定的标签页 ID (每次组件 mount 调用一次)
 */
export function generateTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
