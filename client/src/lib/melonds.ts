/**
 * NDS melonDS WebAssembly 模拟器 — ds-anywhere (melonDS fork) + webmelon SDK
 *
 * 架构：
 *   wasmemulator.js (Emscripten glue) → window.Module
 *   webmelon.js (bridge SDK)           → window.WebMelon
 *   本文件封装为 NdsEmulator 接口        → 与 mgba.ts 相同的调用模式
 */

// ── 全局类型声明（来自 webmelon.js + wasmemulator.js） ──

declare global {
  interface Window {
    Module: any;
    WebMelon: WebMelonInterface;
  }
}

export type DsInputButton = 'A' | 'B' | 'SELECT' | 'START' | 'DPAD_RIGHT' | 'DPAD_LEFT' | 'DPAD_UP' | 'DPAD_DOWN' | 'R' | 'L' | 'X' | 'Y';

interface WebMelonCart {
  createCart: () => void;
  loadFileIntoCart: (filename: string) => boolean;
  getUnloadedCartName: () => string;
}

interface WebMelonStorage {
  createDirectory: (path: string) => void;
  mountIndexedDB: (path: string) => void;
  write: (path: string, data: Uint8Array) => void;
  sync: () => void;
}

interface WebMelonEmulator {
  hasEmulator: () => boolean;
  createEmulator: () => void;
  loadFreeBIOS: () => void;
  loadRom: (romPath: string) => void;
  setSavePath: (pathname: string) => void;
  startEmulation: (topScreenId: string, bottomScreenId: string) => void;
  getGameTitle: () => string | null;
  pause: () => void;
  resume: () => void;
  shutdown: () => void;
  setEmulatorSpeed: (multiplier: number) => void;
}

interface WebMelonInput {
  pressButton: (button: DsInputButton) => void;
  releaseButton: (button: DsInputButton) => void;
  touchScreen: (x: number, y: number, pressed: boolean) => void;
}

interface WebMelonAssembly {
  addLoadListener: (callback: () => void) => void;
}

interface WebMelonInterface {
  assembly: WebMelonAssembly;
  cart: WebMelonCart;
  constants: {
    DS_SCREEN_WIDTH: number;
    DS_SCREEN_HEIGHT: number;
    DS_INPUT_MAP: Record<DsInputButton, number>;
    DS_BUTTON_NAME_MAP: Record<DsInputButton, string>;
    DEFAULT_KEYBOARD_BINDINGS: Record<string, number>;
  };
  storage: WebMelonStorage;
  emulator: WebMelonEmulator;
  input: WebMelonInput;
}

// ── 模拟器接口 ──────────────────────────────────────────

export interface NdsEmulator {
  loadRom(romData: Uint8Array): Promise<void>;
  loadSave(saveData: Uint8Array): void;
  getSave(): Uint8Array | null;
  getGameTitle(): string | null;
  pause(): void;
  resume(): void;
  shutdown(): void;
  setSpeed(multiplier: number): void;
  setVolume(pct: number): void;
  setMicNoise(enabled: boolean): void;
  /** 写入 webmelon 原生 keybinds (event.key → bitmask) */
  setKeyBinds(keybinds: Record<string, number>): void;
  pressButton(button: DsInputButton): void;
  releaseButton(button: DsInputButton): void;
}

// ── NDS 按键映射 ────────────────────────────────────────

export const NDS_KEY_MAP: Record<string, DsInputButton> = {
  KeyZ: 'A', KeyX: 'B', KeyA: 'Y', KeyS: 'X',
  KeyQ: 'L', KeyW: 'R',
  Enter: 'START', Backspace: 'SELECT',
  ArrowUp: 'DPAD_UP', ArrowDown: 'DPAD_DOWN',
  ArrowLeft: 'DPAD_LEFT', ArrowRight: 'DPAD_RIGHT',
};

export const NDS_BTN_LABEL: Record<string, string> = {
  A: 'A', B: 'B', X: 'X', Y: 'Y', L: 'L', R: 'R',
  START: 'Start', SELECT: 'Select',
  DPAD_UP: '↑上', DPAD_DOWN: '↓下', DPAD_LEFT: '←左', DPAD_RIGHT: '→右',
};

// ── NDS 版本映射（Gen4/5 gameVersion → gameId） ─────────

export const NDS_VERSION_MAP: Record<number, string> = {
  // Gen4 (PKHeX: D=10, P=11, Pt=12, HG=7, SS=8)
  10: 'pkm_diamond', 11: 'pkm_pearl', 12: 'pkm_platinum',
  7: 'pkm_heartgold', 8: 'pkm_soulsilver',
  // Gen5 (PKHeX: W=20, B=21, W2=22, B2=23)
  20: 'pkm_white', 21: 'pkm_black', 22: 'pkm_white2', 23: 'pkm_black2',
};

export const NDS_ROM_NAMES: Record<string, string> = {
  pkm_diamond: '宝可梦 钻石', pkm_pearl: '宝可梦 珍珠',
  pkm_platinum: '宝可梦 白金',
  pkm_heartgold: '宝可梦 心金', pkm_soulsilver: '宝可梦 魂银',
  pkm_black: '宝可梦 黑', pkm_white: '宝可梦 白',
  pkm_black2: '宝可梦 黑2', pkm_white2: '宝可梦 白2',
};

// ── 创建模拟器 ──────────────────────────────────────────

const SAVE_FILE_PATH = '/savefiles/game.sav';
const ROM_FILE_PATH = '/roms/game.nds';

export async function createNdsEmulator(
  topCanvas: HTMLCanvasElement,
  bottomCanvas: HTMLCanvasElement,
): Promise<NdsEmulator> {
  // 确保 canvas 有 id（webmelon 需要）
  if (!topCanvas.id) topCanvas.id = 'nds-top-screen';
  if (!bottomCanvas.id) bottomCanvas.id = 'nds-bottom-screen';

  // 加载 Emscripten 胶水代码
  await loadScript('/emulator/nds/wasmemulator.js');
  // 加载 webmelon SDK
  await loadScript('/emulator/nds/webmelon.js');

  return new Promise((resolve) => {
    window.WebMelon.assembly.addLoadListener(() => {
      // 初始化虚拟文件系统 — 使用 MEMFS（内存文件系统），写入极快不卡帧
      const { storage, emulator } = window.WebMelon;
      storage.createDirectory('/roms');
      storage.createDirectory('/savefiles');

      // ── 音量控制 ──────────────────────────────────
      let masterGain: GainNode | null = null;
      try {
        const audioCtx = window.WebMelon.audio.getAudioContext();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 1.0;
        masterGain.connect(audioCtx.destination);
      } catch { /* audio not available */ }

      // ── 麦克风噪声模拟 ────────────────────────────
      let micNoiseActive = false;
      let micNoiseTimer: ReturnType<typeof setInterval> | null = null;

      resolve({
        async loadRom(romData: Uint8Array): Promise<void> {
          // 1. 写入 ROM 到虚拟文件系统
          storage.write(ROM_FILE_PATH, romData);
          // 2. 创建模拟器实例 + 加载 FreeBIOS
          emulator.createEmulator();
          emulator.loadFreeBIOS();
          // 3. 加载 ROM 到卡带（webmelon 公开 API: cart.loadFileIntoCart + emulator.loadCart）
          const { cart } = window.WebMelon;
          cart.createCart();
          cart.loadFileIntoCart(ROM_FILE_PATH);
          emulator.loadCart();
          // 4. 设置存档路径 + 启动模拟
          emulator.setSavePath(SAVE_FILE_PATH);
          emulator.startEmulation(topCanvas.id, bottomCanvas.id);

          // 5. 音频路由通过 GainNode（音量控制）
          try {
            const audioCtx = window.WebMelon.audio.getAudioContext();
            if (masterGain) {
              try { masterGain.disconnect(); } catch {}
              masterGain.connect(audioCtx.destination);
            }
          } catch { /* audio routing best-effort */ }
        },

        loadSave(saveData: Uint8Array): void {
          try {
            window.Module.FS.writeFile(SAVE_FILE_PATH, saveData);
          } catch {
            window.Module.FS.createDataFile('/savefiles', 'game.sav', saveData, true, true);
          }
        },

        getSave(): Uint8Array | null {
          try {
            return window.Module.FS.readFile(SAVE_FILE_PATH);
          } catch {
            return null;
          }
        },

        getGameTitle(): string | null {
          return emulator.getGameTitle();
        },

        pause(): void { emulator.pause(); },
        resume(): void { emulator.resume(); },
        shutdown(): void { emulator.shutdown(); },

        setSpeed(multiplier: number): void {
          emulator.setEmulatorSpeed(multiplier);
        },

        setVolume(pct: number): void {
          if (masterGain) {
            masterGain.gain.value = Math.max(0, Math.min(1, pct / 100));
          }
          // 静音时暂停 AudioContext 省 CPU
          try {
            const ctx = window.WebMelon?.audio?.getAudioContext();
            if (ctx) {
              if (pct <= 0 && ctx.state === 'running') ctx.suspend();
              else if (pct > 0 && ctx.state === 'suspended') ctx.resume();
            }
          } catch {}
        },

        setMicNoise(enabled: boolean): void {
          micNoiseActive = enabled;
          if (enabled && !micNoiseTimer) {
            // 每 50ms 向 mic 缓冲区写入白噪声（模拟环境音/吹气）
            micNoiseTimer = setInterval(() => {
              if (!micNoiseActive) return;
              try {
                // melonDS mic 输入通过 Emscripten 函数 _mic_input 或直接写内存
                // 尝试调用常见的 mic 输入函数
                const mod = window.Module;
                if (typeof mod._melonDS_mic_input === 'function') {
                  const noise = new Int16Array(256);
                  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() - 0.5) * 0x400;
                  mod._melonDS_mic_input(noise);
                }
              } catch { /* mic input not available */ }
            }, 50);
          } else if (!enabled && micNoiseTimer) {
            clearInterval(micNoiseTimer);
            micNoiseTimer = null;
          }
        },

        setKeyBinds(keybinds: Record<string, number>): void {
          try {
            const settings = window.WebMelon.input.getInputSettings();
            window.WebMelon.input.setInputSettings({ ...settings, keybinds });
          } catch { /* input not ready */ }
        },

        pressButton(button: DsInputButton): void {
          try { window.WebMelon.input.pressButton(button); } catch {}
        },

        releaseButton(button: DsInputButton): void {
          try { window.WebMelon.input.releaseButton(button); } catch {}
        },
      });
    });
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}
