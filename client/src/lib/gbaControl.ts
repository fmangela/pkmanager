/**
 * GBA 模拟器外部控制接口
 * 供脚本/AI 通过 HTTP API 或浏览器 Console 操控 mGBA WASM
 */

export type GBAButton = 'A' | 'B' | 'L' | 'R' | 'Start' | 'Select' | 'Up' | 'Down' | 'Left' | 'Right';

export interface GBACommand {
  id?: string;
  action: string;
  params?: Record<string, any>;
}

export interface GBACommandResult {
  commandId?: string;
  action: string;
  ok: boolean;
  data?: any;
  error?: string;
  elapsedMs: number;
}

// ── Controller ─────────────────────────────────────────────────────

export class GBAController {
  private emu: any; // MGBAEmulator (internal Module reference)
  private canvas: HTMLCanvasElement;

  constructor(emu: any, canvas: HTMLCanvasElement) {
    this.emu = emu;
    this.canvas = canvas;
  }

  // ── 按键 ─────────────────────────────────────────────────

  press(button: GBAButton): void {
    this.emu.buttonPress(button);
  }

  release(button: GBAButton): void {
    this.emu.buttonUnpress(button);
  }

  tap(button: GBAButton, durationMs = 100): Promise<void> {
    this.emu.buttonPress(button);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emu.buttonUnpress(button);
        resolve();
      }, durationMs);
    });
  }

  async sequence(buttons: Array<{ button: GBAButton; duration: number }>): Promise<void> {
    for (const b of buttons) {
      await this.tap(b.button, b.duration);
    }
  }

  // ── 屏幕 ─────────────────────────────────────────────────

  screenshot(format: 'png' | 'raw' = 'png'): string | Uint8ClampedArray {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    if (format === 'raw') {
      return ctx.getImageData(0, 0, 240, 160).data;
    }
    // PNG base64
    return this.canvas.toDataURL('image/png');
  }

  getPixel(x: number, y: number): { r: number; g: number; b: number; a: number } {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    const d = ctx.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  }

  // ── 存档 ─────────────────────────────────────────────────

  saveState(slot: number): boolean {
    return this.emu.saveState(slot);
  }

  loadState(slot: number): boolean {
    return this.emu.loadState(slot);
  }

  getSave(): string | null {
    const data = this.emu.getSave();
    if (!data || data.length === 0) return null;
    // Convert Uint8Array to base64
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  // ── 速度 ─────────────────────────────────────────────────

  setSpeed(multiplier: number): void {
    this.emu.setFastForwardMultiplier(multiplier);
  }

  getSpeed(): number {
    return this.emu.getFastForwardMultiplier();
  }

  pause(): void {
    this.emu.pauseGame();
  }

  resume(): void {
    this.emu.resumeGame();
  }

  reset(): void {
    this.emu.quickReload();
  }

  // ── 命令执行器 ────────────────────────────────────────────

  async executeCommand(cmd: GBACommand): Promise<GBACommandResult> {
    const start = performance.now();
    try {
      let data: any;
      switch (cmd.action) {
        case 'press':
          this.press(cmd.params?.button || 'A');
          break;
        case 'release':
          this.release(cmd.params?.button || 'A');
          break;
        case 'tap':
          await this.tap(cmd.params?.button || 'A', cmd.params?.duration ?? 100);
          break;
        case 'sequence':
          await this.sequence(cmd.params?.buttons || []);
          break;
        case 'screenshot':
          data = this.screenshot(cmd.params?.format || 'png');
          break;
        case 'getPixel':
          data = this.getPixel(cmd.params?.x ?? 0, cmd.params?.y ?? 0);
          break;
        case 'saveState':
          data = this.saveState(cmd.params?.slot ?? 1);
          break;
        case 'loadState':
          data = this.loadState(cmd.params?.slot ?? 1);
          break;
        case 'getSave':
          data = this.getSave();
          break;
        case 'setSpeed':
          this.setSpeed(cmd.params?.multiplier ?? 1);
          break;
        case 'pause':
          this.pause();
          break;
        case 'resume':
          this.resume();
          break;
        case 'reset':
          this.reset();
          break;
        default:
          return { commandId: cmd.id, action: cmd.action, ok: false, error: `Unknown action: ${cmd.action}`, elapsedMs: 0 };
      }
      const elapsed = Math.round(performance.now() - start);
      return { commandId: cmd.id, action: cmd.action, ok: true, data, elapsedMs: elapsed };
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      return { commandId: cmd.id, action: cmd.action, ok: false, error: err.message, elapsedMs: elapsed };
    }
  }
}
