export const GAMEPAD_BUTTON_LABELS: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'L1',
  5: 'R1',
  6: 'L2',
  7: 'R2',
  8: 'Select',
  9: 'Start',
  10: 'L3',
  11: 'R3',
  12: '↑',
  13: '↓',
  14: '←',
  15: '→',
};

export const GAMEPAD_DEADZONE_DEFAULT = 0.5;

export const DEFAULT_GBA_GAMEPAD_BINDS: Record<string, number[]> = {
  Up: [12],
  Down: [13],
  Left: [14],
  Right: [15],
  A: [0],
  B: [1],
  L: [4],
  R: [5],
  Start: [9],
  Select: [8],
};

export const DEFAULT_NDS_GAMEPAD_BINDS: Record<string, number[]> = {
  A: [1],
  B: [0],
  X: [3],
  Y: [2],
  L: [4, 6],
  R: [5, 7],
  START: [9],
  SELECT: [8],
  DPAD_UP: [12],
  DPAD_DOWN: [13],
  DPAD_LEFT: [14],
  DPAD_RIGHT: [15],
};

export function codeLabel(code: string): string {
  const m: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    Backspace: 'Bksp',
    Space: '␣',
    ShiftLeft: 'L⇧',
    ShiftRight: 'R⇧',
  };
  return m[code] || code.replace('Key', '').replace('Digit', '');
}

export function gamepadButtonLabel(index: number): string {
  return `🎮B${index}`;
}

export function formatGamepadButtons(indices: number[] | undefined): string {
  if (!indices || indices.length === 0) {
    return '—';
  }
  return indices.map((index) => gamepadButtonLabel(index)).join(' / ');
}

export function cloneGamepadBinds<T extends string>(binds: Record<T, number[]>): Record<T, number[]> {
  const out = {} as Record<T, number[]>;
  for (const key of Object.keys(binds) as T[]) {
    out[key] = [...binds[key]];
  }
  return out;
}

export function emptyGamepadBinds<T extends string>(binds: Record<T, number[]>): Record<T, number[]> {
  const out = {} as Record<T, number[]>;
  for (const key of Object.keys(binds) as T[]) {
    out[key] = [];
  }
  return out;
}

function normalizeGamepadIndices(indices: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const raw of indices) {
    const n = Math.trunc(raw);
    if (!Number.isFinite(n) || n < 0 || n > 31 || seen.has(n)) {
      continue;
    }
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function loadGamepadBinds<T extends string>(
  storageKey: string,
  defaults: Record<T, number[]>,
): Record<T, number[]> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return cloneGamepadBinds(defaults);
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = cloneGamepadBinds(defaults);
    for (const key of Object.keys(defaults) as T[]) {
      const value = parsed[key];
      if (Array.isArray(value)) {
        out[key] = normalizeGamepadIndices(value.filter((item): item is number => typeof item === 'number'));
      }
    }
    return out;
  } catch {
    return cloneGamepadBinds(defaults);
  }
}

export function saveGamepadBinds<T extends string>(
  storageKey: string,
  binds: Record<T, number[]>,
): void {
  localStorage.setItem(storageKey, JSON.stringify(binds));
}

export function loadNumberSetting(storageKey: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw == null) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveNumberSetting(storageKey: string, value: number): void {
  localStorage.setItem(storageKey, String(value));
}

/** 遍历 getGamepads() 数组，返回第一个非 null 的游戏手柄（处理断开后的空洞槽位） */
export function getFirstGamepad(): Gamepad | null {
  const pads = navigator.getGamepads?.();
  if (!pads) return null;
  for (const pad of pads) {
    if (pad) return pad;
  }
  return null;
}

export function getPressedGamepadButtons(): Set<number> {
  const pad = getFirstGamepad();
  const pressed = new Set<number>();
  if (!pad) {
    return pressed;
  }
  for (const [idx, btn] of pad.buttons.entries()) {
    if (btn?.pressed) {
      pressed.add(idx);
    }
  }
  return pressed;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}
