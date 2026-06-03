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
  loadCart: () => void;
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
  getInputSettings: () => any;
  setInputSettings: (settings: any) => void;
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
  _internal?: any;
  audio?: any;
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

// ── WebGL 兼容性 Monkey-Patch ──────────────────────────────
// melonDS 的 WebGL2 GPU 路径仍带着少量桌面 GL 调用习惯。这里不做“全量降级”，
// 只修正已经确认会在浏览器里失败的组合：
//
//   A. GL_UNSIGNED_SHORT_1_5_5_5_REV → GL_UNSIGNED_SHORT_5_5_5_1（并复制/重排像素位）
//   B. GL_BGRA → GL_RGBA（读写时做 R/B 通道交换）
//   C. GL_RGBA_INTEGER → GL_RGBA（当前编译产物里对应的目标纹理是普通 RGBA 纹理）
//
// 重点：不要再无差别改写 internalformat。像 GL_R8UI / GL_DEPTH24_STENCIL8
// 这类 sized internal format 在 WebGL2 中本来就是合法且必须保留的。

const GL_UNSIGNED_SHORT_1_5_5_5_REV = 0x8366; // desktop GL only
const GL_UNSIGNED_SHORT_5_5_5_1     = 0x8034;
const GL_UNSIGNED_BYTE              = 0x1401;
const GL_UNSIGNED_INT_24_8          = 0x84FA;
const GL_BGRA                       = 0x80E1;
const GL_RED                        = 0x1903;
const GL_RGB                        = 0x1907;
const GL_RGBA                       = 0x1908;
const GL_DEPTH_STENCIL              = 0x84F9;
const GL_RED_INTEGER                = 0x8D94;
const GL_RGBA_INTEGER               = 0x8D99;
const GL_R8UI                       = 0x8232;

/** 将 A1RGB555 (bit15=A) 像素数据就地转换为 RGB555_A1 (bit0=A) */
function swapRev555To5551(data: Uint8Array): void {
  const view = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  for (let i = 0; i < view.length; i++) {
    const input = view[i];
    view[i] = ((input & 0x7FFF) << 1) | ((input & 0x8000) >> 15);
  }
}

/** 交换 R↔B 通道 (RGBA ↔ BGRA): 就地交换每像素的 R 和 B */
function swapRB(data: Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    data[i] = data[i + 2];
    data[i + 2] = r;
  }
}

function cloneBytes(data: ArrayBufferView): Uint8Array {
  const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy;
}

function createTypedViewLike(data: ArrayBufferView, buffer: ArrayBufferLike, byteOffset: number, byteLength: number): ArrayBufferView {
  if (data instanceof Uint8Array) return new Uint8Array(buffer, byteOffset, byteLength);
  if (data instanceof Uint16Array) return new Uint16Array(buffer, byteOffset, byteLength / 2);
  if (data instanceof Uint32Array) return new Uint32Array(buffer, byteOffset, byteLength / 4);
  if (data instanceof Int8Array) return new Int8Array(buffer, byteOffset, byteLength);
  if (data instanceof Int16Array) return new Int16Array(buffer, byteOffset, byteLength / 2);
  if (data instanceof Int32Array) return new Int32Array(buffer, byteOffset, byteLength / 4);
  if (data instanceof Float32Array) return new Float32Array(buffer, byteOffset, byteLength / 4);
  return new Uint8Array(buffer, byteOffset, byteLength);
}

function createTypedViewForGLType(type: number, buffer: ArrayBufferLike, byteOffset: number, byteLength: number): ArrayBufferView {
  if (type === GL_UNSIGNED_SHORT_1_5_5_5_REV || type === GL_UNSIGNED_SHORT_5_5_5_1) {
    return new Uint16Array(buffer, byteOffset, byteLength / 2);
  }
  if (type === GL_UNSIGNED_INT_24_8) {
    return new Uint32Array(buffer, byteOffset, byteLength / 4);
  }
  return new Uint8Array(buffer, byteOffset, byteLength);
}

function estimatePixelByteLength(width: number, height: number, format: number, type: number): number {
  let channels = 4;
  if (format === GL_RED || format === GL_RED_INTEGER) channels = 1;
  else if (format === GL_RGB) channels = 3;
  else if (format === GL_DEPTH_STENCIL) channels = 1;

  let bytesPerChannel = 1;
  if (type === GL_UNSIGNED_INT_24_8) {
    return width * height * 4;
  }
  if (type === GL_UNSIGNED_SHORT_1_5_5_5_REV || type === GL_UNSIGNED_SHORT_5_5_5_1) {
    return width * height * 2;
  }
  if (type !== GL_UNSIGNED_BYTE) {
    bytesPerChannel = 2;
  }

  return width * height * channels * bytesPerChannel;
}

function slicePixelData(
  data: ArrayBufferView | null,
  offsetElements: number | undefined,
  byteLength: number,
): ArrayBufferView | null {
  if (!data) {
    return data;
  }
  if (offsetElements == null) {
    return data;
  }

  const bytesPerElement = (data as any).BYTES_PER_ELEMENT ?? 1;
  const start = data.byteOffset + offsetElements * bytesPerElement;
  return createTypedViewLike(data, data.buffer, start, byteLength);
}

function prepareUploadData(
  data: ArrayBufferView | null,
  needsRev555Swap: boolean,
  needsBgraSwap: boolean,
  outputType: number,
): ArrayBufferView | null {
  if (!data || (!needsRev555Swap && !needsBgraSwap)) {
    return data;
  }

  const copy = cloneBytes(data);
  if (needsRev555Swap) {
    swapRev555To5551(copy);
  }
  if (needsBgraSwap) {
    swapRB(copy);
  }
  return createTypedViewForGLType(outputType, copy.buffer, copy.byteOffset, copy.byteLength);
}

// 诊断用：记录已见过的 GL 参数组合（避免刷屏）
const _seenCombos = new Set<string>();

function installWebGLCompatPatch(): void {
  const proto = HTMLCanvasElement.prototype as any;
  if (proto.__melondsWebGLCompatInstalled) {
    return;
  }

  // IMPORTANT: 不能 bind 原生 getContext — 原生 DOM 方法必须用实际的 canvas
  // 元素作为 this 调用，否则会抛出 "Illegal invocation"。
  const origGetContext = HTMLCanvasElement.prototype.getContext;

  proto.getContext = function (
    contextType: string,
    attrs?: any,
  ): RenderingContext | null {
    const ctx = origGetContext.call(this, contextType, attrs);
    if (!ctx || !contextType.includes('webgl')) return ctx;

    const gl = ctx as any;
    if (gl.__melondsCompatWrapped) {
      return ctx;
    }
    gl.__melondsCompatWrapped = true;

    // ── 1. texImage2D ─────────────────────────────────────
    const origTexImage2D = gl.texImage2D.bind(gl);
    gl.texImage2D = function (...rawArgs: any[]): void {
      let [target, level, internalformat, width, height, border, format, type, data, srcOffset] = rawArgs as [
        number, number, number, number, number, number, number, number, ArrayBufferView | null, number | undefined
      ];

      const origInternalformat = internalformat;
      const origFormat = format;
      const origType = type;

      data = slicePixelData(data, srcOffset, estimatePixelByteLength(width, height, format, type));

      const needsRev555Swap = type === GL_UNSIGNED_SHORT_1_5_5_5_REV;
      const needsBgraSwap = format === GL_BGRA;

      if (needsRev555Swap) {
        type = GL_UNSIGNED_SHORT_5_5_5_1;
      }
      if (needsBgraSwap) {
        format = GL_RGBA;
        if (internalformat === GL_BGRA) {
          internalformat = GL_RGBA;
        }
      }
      if (internalformat === GL_R8UI && format === GL_RED) {
        format = GL_RED_INTEGER;
      }
      if (format === GL_RGBA_INTEGER && internalformat === GL_RGBA) {
        format = GL_RGBA;
      }

      const uploadData = prepareUploadData(data, needsRev555Swap, needsBgraSwap, type);

      if (origFormat !== format || origInternalformat !== internalformat || origType !== type) {
        const key = `texImage2D ifmt=${origInternalformat}->${internalformat} fmt=${origFormat}->${format} type=${origType}->${type}`;
        if (!_seenCombos.has(key)) { _seenCombos.add(key); console.debug('[WebGL compat]', key); }
      }

      origTexImage2D(target, level, internalformat, width, height, border, format, type, uploadData);
    } as any;

    // ── 2. texSubImage2D ──────────────────────────────────
    const origTexSubImage2D = gl.texSubImage2D.bind(gl);
    gl.texSubImage2D = function (...rawArgs: any[]): void {
      let [target, level, xoffset, yoffset, width, height, format, type, data, srcOffset] = rawArgs as [
        number, number, number, number, number, number, number, number, ArrayBufferView | null, number | undefined
      ];

      const origFormat = format;
      const origType = type;

      data = slicePixelData(data, srcOffset, estimatePixelByteLength(width, height, format, type));

      const needsRev555Swap = type === GL_UNSIGNED_SHORT_1_5_5_5_REV;
      const needsBgraSwap = format === GL_BGRA;

      if (needsRev555Swap) {
        type = GL_UNSIGNED_SHORT_5_5_5_1;
      }
      if (needsBgraSwap) {
        format = GL_RGBA;
      }
      if (format === GL_RED && type === GL_UNSIGNED_BYTE) {
        format = GL_RED_INTEGER;
      }
      if (format === GL_RGBA_INTEGER) {
        format = GL_RGBA;
      }

      const uploadData = prepareUploadData(data, needsRev555Swap, needsBgraSwap, type);

      if (origFormat !== format || origType !== type) {
        const key = `texSubImage2D fmt=${origFormat}->${format} type=${origType}->${type}`;
        if (!_seenCombos.has(key)) { _seenCombos.add(key); console.debug('[WebGL compat]', key); }
      }

      origTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, uploadData);
    } as any;

    // ── 3. readPixels ─────────────────────────────────────
    const origReadPixels = gl.readPixels.bind(gl);
    gl.readPixels = function (...rawArgs: any[]): void {
      const [x, y, width, height, format, type, pixels, dstOffset] = rawArgs as [
        number, number, number, number, number, number, ArrayBufferView | null, number | undefined
      ];

      const pixelLength = estimatePixelByteLength(width, height, format, type);
      const outputPixels = slicePixelData(pixels, dstOffset, pixelLength);
      origReadPixels(...rawArgs);
    } as any;

    return ctx;
  };

  proto.__melondsWebGLCompatInstalled = true;
}

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

  // ── 抑制 Emscripten 控制台日志 + WebGL Monkey-Patch ──
  // wasmemulator.js 默认把所有 WASM printf 输出绑定到 console.log，
  // melonDS 运行时会疯狂刷屏（107 个 out() 调用点），拖垮浏览器和 API。
  const mod = (window as any).Module || {};
  (window as any).Module = mod;
  mod.print = mod.print || (() => {});
  mod.printErr = mod.printErr || (() => {});

  // ── WebGL 兼容性 Monkey-Patch ───────────────────────────
  // melonDS 的 OpenGL 渲染器使用桌面 OpenGL 3.2 API，编译为 WASM 后通过
  // Emscripten 映射到 WebGL/GLES。但 melonDS 用了一些桌面 GL 独有的
  // type/format（如 GL_UNSIGNED_SHORT_1_5_5_5_REV），这些在 WebGL 2.0 /
  // GLES 3.0 中不存在，导致 glTexImage2D 失败 → FBO 不完整 → 黑屏。
  //
  // 此处拦截 HTMLCanvasElement.getContext 来包装 WebGL 上下文，
  // 修复不兼容的 GL 调用。
  installWebGLCompatPatch();

  // melonDS 3D GPU 需要一个 DOM Canvas 承载 WebGL 上下文。
  // melonDS 内部 ASM_CONSTS 会动态创建 #melonDS-gl-canvas，
  // 但提前创建可避免 document.body 未就绪的时序问题。
  let glCanvas = document.getElementById('melonDS-gl-canvas') as HTMLCanvasElement | null;
  if (!glCanvas) {
    glCanvas = document.createElement('canvas');
    glCanvas.id = 'melonDS-gl-canvas';
    glCanvas.width = 256;
    glCanvas.height = 192;
    glCanvas.style.display = 'none';
    document.body.appendChild(glCanvas);
  }
  mod.canvas = glCanvas;

  // 加载 Emscripten 胶水代码
  await loadScript('/emulator/nds/wasmemulator.js');
  // 加载 webmelon SDK
  await loadScript('/emulator/nds/webmelon.js');

  return new Promise((resolve) => {
    window.WebMelon.assembly.addLoadListener(() => {
      // 初始化虚拟文件系统 — 使用 MEMFS（内存文件系统），写入极快不卡帧
      // Emscripten 5.0.7 + pthreads 不导出 HEAPU8 到 Module；
      // 确保 Module.HEAPU8 可用（webmelon.js frameUpdate 需要）
      const w = window as any;
      if (!w.Module.HEAPU8 && w.HEAPU8) {
        w.Module.HEAPU8 = w.HEAPU8;
      }

      const { storage, emulator } = window.WebMelon;
      storage.createDirectory('/roms');
      storage.createDirectory('/savefiles');

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
          // 4. 先设置存档路径，再 loadCart。
          // wasm 侧会在 loadCart/loadRom 过程中检查该路径并加载现有存档。
          emulator.setSavePath(SAVE_FILE_PATH);
          // 5. 加载卡带并启动模拟
          emulator.loadCart();
          emulator.startEmulation(topCanvas.id, bottomCanvas.id);
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
          // webmelon 内部 GainNode（createAudioProcessor 创建，已插入音频链路）
          try {
            const gain: GainNode | undefined = window.WebMelon?._internal?.emulatorAudioGain;
            if (gain) {
              gain.gain.value = Math.max(0, Math.min(1, pct / 100));
            }
          } catch {}
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
