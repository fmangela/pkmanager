import { create } from 'zustand';

// ── Types ──────────────────────────────────────────────────────────

export type DiagCategory = 'api' | 'render' | 'wasm' | 'network' | 'auth' | 'health' | 'unknown';
export type DiagLevel = 'error' | 'warn' | 'info';

export interface DiagEntry {
  id: string;
  timestamp: number;       // Date.now()
  category: DiagCategory;
  level: DiagLevel;
  message: string;
  stack?: string;
  context?: string;        // JSON-serialized extra info (URL, status code, etc.)
  count?: number;          // dedup count for repeated entries
}

interface DiagnosticState {
  entries: DiagEntry[];
  healthStatus: 'idle' | 'ok' | 'degraded' | 'down';

  /** Add a log entry. Deduplicates identical messages within 5 seconds. */
  log: (entry: Omit<DiagEntry, 'id' | 'timestamp'>) => void;

  /** Clear all in-memory and persisted entries. */
  clear: () => void;

  /** Export all entries as formatted text (for copy-to-clipboard). */
  exportText: () => string;

  /** Set health check result. */
  setHealth: (status: DiagnosticState['healthStatus']) => void;

  /** Restore entries from localStorage (called on store init). */
  _restore: () => void;
}

// ── Constants ──────────────────────────────────────────────────────

const STORAGE_KEY = 'pkmanager_diag_log';
const MAX_MEMORY = 200;          // ring buffer cap
const MAX_STORAGE_BYTES = 500_000; // ~500KB localStorage cap
const DEDUP_WINDOW_MS = 5_000;
const UPLOAD_ENDPOINT = '/api/diagnostics/client-error';

// ── Helpers ────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  _idCounter++;
  return `${Date.now()}-${_idCounter}`;
}

function persistToStorage(entries: DiagEntry[]): void {
  try {
    let payload = JSON.stringify(entries);
    // Trim from the front until under limit
    while (payload.length > MAX_STORAGE_BYTES && entries.length > 10) {
      entries = entries.slice(Math.floor(entries.length * 0.3)); // drop oldest 30%
      payload = JSON.stringify(entries);
    }
    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // localStorage full or unavailable — silently ignore, memory buffer still works
  }
}

function loadFromStorage(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Send a single entry to the backend via sendBeacon (non-blocking, survives page close). */
function uploadToServer(entry: DiagEntry): void {
  try {
    const payload = JSON.stringify({
      timestamp: new Date(entry.timestamp).toISOString(),
      category: entry.category,
      level: entry.level,
      message: entry.message,
      stack: entry.stack,
      context: entry.context,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(UPLOAD_ENDPOINT, blob);
    } else {
      // Fallback: fetch with keepalive
      fetch(UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => { /* fire-and-forget */ });
    }
  } catch {
    // Upload failure must never throw
  }
}

// ── Store ──────────────────────────────────────────────────────────

export const useDiagnosticStore = create<DiagnosticState>((set, get) => ({
  entries: [],
  healthStatus: 'idle',

  log: (input) => {
    const now = Date.now();
    const { entries } = get();

    // Dedup: same message + category within DEDUP_WINDOW_MS
    const existing = entries.find(
      (e) =>
        e.message === input.message &&
        e.category === input.category &&
        now - e.timestamp < DEDUP_WINDOW_MS,
    );
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.timestamp = now; // bump to show it happened again
      set({ entries: [...entries] });
      persistToStorage([...entries]);
      return;
    }

    const entry: DiagEntry = {
      id: nextId(),
      timestamp: now,
      category: input.category,
      level: input.level,
      message: input.message,
      stack: input.stack,
      context: input.context,
      count: 1,
    };

    // Ring buffer
    const updated = [...entries, entry];
    while (updated.length > MAX_MEMORY) {
      updated.shift();
    }

    set({ entries: updated });
    persistToStorage(updated);

    // Upload to server (fire-and-forget, only for errors/warns)
    if (input.level === 'error' || input.level === 'warn') {
      uploadToServer(entry);
    }
  },

  clear: () => {
    set({ entries: [] });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  },

  exportText: () => {
    const { entries } = get();
    if (entries.length === 0) return '(no errors recorded)';

    const lines: string[] = [
      `pkmanager Diagnostic Report — ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `User-Agent: ${navigator.userAgent}`,
      `Total entries: ${entries.length}`,
      `---`,
    ];

    for (const e of entries) {
      const time = new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
      const repeat = e.count && e.count > 1 ? ` (×${e.count})` : '';
      lines.push(`[${time}] [${e.category}/${e.level}] ${e.message}${repeat}`);
      if (e.context) lines.push(`  context: ${e.context}`);
      if (e.stack) lines.push(`  stack: ${e.stack}`);
    }

    return lines.join('\n');
  },

  setHealth: (status) => set({ healthStatus: status }),

  _restore: () => {
    const saved = loadFromStorage();
    if (saved.length > 0) {
      set({ entries: saved.slice(-MAX_MEMORY) });
    }
  },
}));

// ── Auto-restore on module load ──────────────────────────────────
useDiagnosticStore.getState()._restore();
