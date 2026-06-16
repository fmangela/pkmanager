/**
 * mGBA WebAssembly 模拟器 — @thenick775/mgba-wasm
 */
import mGBA from '@thenick775/mgba-wasm';
import { getI18nGameName } from '../i18n/i18n';

export interface MGBAEmulator {
  loadGame(romPath: string, savePath?: string): boolean;
  getSave(): Uint8Array | null;
  buttonPress(name: string): void;
  buttonUnpress(name: string): void;
  pauseGame(): void;
  resumeGame(): void;
  getVolume(): number;
  setVolume(pct: number): void;
  setFastForwardMultiplier(m: number): void;
  getFastForwardMultiplier(): number;
  bindKey(key: string, action: string): void;
  saveState(slot: number): boolean;
  loadState(slot: number): boolean;
  quickReload(): void;
  FS: any;
  savePath: string;
  gamePath: string;
  writeSave(data: Uint8Array, filename: string): void;
  uploadCheats(file: File): Promise<void>;
  autoLoadCheats(): boolean;
  getCheatsPath(): string;
}

export const KEY_MAP: Record<string, string> = {
  'KeyZ': 'A', 'KeyX': 'B', 'KeyA': 'L', 'KeyS': 'R',
  'Enter': 'Start', 'Backspace': 'Select',
  'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
};

export function getGbaRomDisplayName(gameId: string): string {
  return getI18nGameName(gameId);
}

export async function createMGBA(canvas: HTMLCanvasElement): Promise<MGBAEmulator> {
  console.log('[mGBA] crossOriginIsolated:', self.crossOriginIsolated);
  console.log('[mGBA] Calling mGBA({canvas})...');
  const module = await mGBA({ canvas });
  console.log('[mGBA] Module loaded, FSInit...');
  await module.FSInit();
  console.log('[mGBA] Ready');

  // Disable auto-save-state restore so game starts fresh from title screen
  module.setCoreSettings?.({ restoreAutoSaveStateOnLoad: false, autoSaveStateEnable: false });

  const paths = module.filePaths?.() || { gamePath: '/data/', savePath: '/data/' } as any;
  console.log('[mGBA] paths:', paths);

  return {
    FS: module.FS,
    gamePath: paths.gamePath,
    savePath: paths.savePath,
    loadGame(romPath: string, savePath?: string) { return module.loadGame(romPath, savePath); },
    getSave(): Uint8Array | null { try { return module.getSave(); } catch { return null; } },
    writeSave(data: Uint8Array, filename: string) { module.FS.writeFile((paths.savePath || '/data/') + filename, data); },
    buttonPress(n: string) { module.buttonPress(n); },
    buttonUnpress(n: string) { module.buttonUnpress(n); },
    pauseGame() { module.pauseGame?.(); },
    resumeGame() { module.resumeGame?.(); },
    getVolume(): number { return module.getVolume?.() ?? 1; },
    setVolume(pct: number) { module.setVolume?.(pct); },
    setFastForwardMultiplier(m: number) { module.setFastForwardMultiplier?.(m); },
    getFastForwardMultiplier(): number { return module.getFastForwardMultiplier?.() ?? 1; },
    bindKey(key: string, action: string) { module.bindKey?.(key, action); },
    saveState(s: number) { return module.saveState?.(s) ?? false; },
    loadState(s: number) { return module.loadState?.(s) ?? false; },
    quickReload() { module.quickReload?.(); },
    uploadCheats(file: File) {
      return new Promise<void>((resolve, reject) => {
        try {
          if (!module.uploadCheats) {
            reject(new Error('mGBA cheats API 不可用'));
            return;
          }
          module.uploadCheats(file, () => resolve());
        } catch (err) {
          reject(err);
        }
      });
    },
    autoLoadCheats() { return module.autoLoadCheats?.() ?? false; },
    getCheatsPath() { return module.filePaths?.().cheatsPath || '/data/cheats'; },
  };
}
