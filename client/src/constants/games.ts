import i18n, { getI18nGameName } from '../i18n/i18n';

export type GamePlatform = 'GBA' | 'NDS' | '3DS' | 'Switch';

export interface GameMeta {
  gameId: string;
  color: string;
  gameVersion: number;
  generation: number;
  platform: GamePlatform;
}

export const GAME_META: Record<string, GameMeta> = {
  pkm_ruby: { gameId: 'pkm_ruby', color: '#cf1322', gameVersion: 2, generation: 3, platform: 'GBA' },
  pkm_sapphire: { gameId: 'pkm_sapphire', color: '#0958d9', gameVersion: 1, generation: 3, platform: 'GBA' },
  pkm_emerald: { gameId: 'pkm_emerald', color: '#08979c', gameVersion: 3, generation: 3, platform: 'GBA' },
  pkm_firered: { gameId: 'pkm_firered', color: '#d4380d', gameVersion: 4, generation: 3, platform: 'GBA' },
  pkm_leafgreen: { gameId: 'pkm_leafgreen', color: '#389e0d', gameVersion: 5, generation: 3, platform: 'GBA' },

  pkm_diamond: { gameId: 'pkm_diamond', color: '#5b8bd4', gameVersion: 10, generation: 4, platform: 'NDS' },
  pkm_pearl: { gameId: 'pkm_pearl', color: '#e799b0', gameVersion: 11, generation: 4, platform: 'NDS' },
  pkm_platinum: { gameId: 'pkm_platinum', color: '#b8b8b8', gameVersion: 12, generation: 4, platform: 'NDS' },
  pkm_heartgold: { gameId: 'pkm_heartgold', color: '#d4a017', gameVersion: 7, generation: 4, platform: 'NDS' },
  pkm_soulsilver: { gameId: 'pkm_soulsilver', color: '#8b9dc3', gameVersion: 8, generation: 4, platform: 'NDS' },

  pkm_white: { gameId: 'pkm_white', color: '#b0b0b0', gameVersion: 20, generation: 5, platform: 'NDS' },
  pkm_black: { gameId: 'pkm_black', color: '#1a1a1a', gameVersion: 21, generation: 5, platform: 'NDS' },
  pkm_white2: { gameId: 'pkm_white2', color: '#f0e6d3', gameVersion: 22, generation: 5, platform: 'NDS' },
  pkm_black2: { gameId: 'pkm_black2', color: '#0d2137', gameVersion: 23, generation: 5, platform: 'NDS' },

  pkm_x: { gameId: 'pkm_x', color: '#6376b4', gameVersion: 24, generation: 6, platform: '3DS' },
  pkm_y: { gameId: 'pkm_y', color: '#e03a2e', gameVersion: 25, generation: 6, platform: '3DS' },
  pkm_omegaruby: { gameId: 'pkm_omegaruby', color: '#cf1322', gameVersion: 26, generation: 6, platform: '3DS' },
  pkm_alphasapphire: { gameId: 'pkm_alphasapphire', color: '#0958d9', gameVersion: 27, generation: 6, platform: '3DS' },

  pkm_sun: { gameId: 'pkm_sun', color: '#fa8c16', gameVersion: 30, generation: 7, platform: '3DS' },
  pkm_moon: { gameId: 'pkm_moon', color: '#722ed1', gameVersion: 31, generation: 7, platform: '3DS' },
  pkm_ultrasun: { gameId: 'pkm_ultrasun', color: '#fa541c', gameVersion: 32, generation: 7, platform: '3DS' },
  pkm_ultramoon: { gameId: 'pkm_ultramoon', color: '#531dab', gameVersion: 33, generation: 7, platform: '3DS' },

  pkm_sword: { gameId: 'pkm_sword', color: '#1677ff', gameVersion: 44, generation: 8, platform: 'Switch' },
  pkm_shield: { gameId: 'pkm_shield', color: '#f5222d', gameVersion: 45, generation: 8, platform: 'Switch' },
  pkm_legendsarceus: { gameId: 'pkm_legendsarceus', color: '#13c2c2', gameVersion: 47, generation: 8, platform: 'Switch' },
  pkm_brilliantdiamond: { gameId: 'pkm_brilliantdiamond', color: '#5b8bd4', gameVersion: 48, generation: 8, platform: 'Switch' },
  pkm_shiningpearl: { gameId: 'pkm_shiningpearl', color: '#e799b0', gameVersion: 49, generation: 8, platform: 'Switch' },
  pkm_scarlet: { gameId: 'pkm_scarlet', color: '#fa541c', gameVersion: 50, generation: 9, platform: 'Switch' },
  pkm_violet: { gameId: 'pkm_violet', color: '#722ed1', gameVersion: 51, generation: 9, platform: 'Switch' },
};

export const PLAYABLE_GAMES: GameMeta[] = [
  GAME_META.pkm_ruby,
  GAME_META.pkm_sapphire,
  GAME_META.pkm_firered,
  GAME_META.pkm_leafgreen,
  GAME_META.pkm_emerald,
  GAME_META.pkm_diamond,
  GAME_META.pkm_pearl,
  GAME_META.pkm_platinum,
  GAME_META.pkm_heartgold,
  GAME_META.pkm_soulsilver,
  GAME_META.pkm_black,
  GAME_META.pkm_white,
  GAME_META.pkm_black2,
  GAME_META.pkm_white2,
  GAME_META.pkm_x,
  GAME_META.pkm_y,
  GAME_META.pkm_omegaruby,
  GAME_META.pkm_alphasapphire,
  GAME_META.pkm_sun,
  GAME_META.pkm_moon,
  GAME_META.pkm_ultrasun,
  GAME_META.pkm_ultramoon,
];

export const VERSION_TO_GAME_ID: Record<number, string> = {
  1: 'pkm_sapphire', 2: 'pkm_ruby', 3: 'pkm_emerald',
  4: 'pkm_firered', 5: 'pkm_leafgreen',
  56: 'pkm_ruby', 57: 'pkm_emerald', 58: 'pkm_firered',
  10: 'pkm_diamond', 11: 'pkm_pearl', 12: 'pkm_platinum',
  7: 'pkm_heartgold', 8: 'pkm_soulsilver',
  62: 'pkm_diamond', 63: 'pkm_platinum', 64: 'pkm_heartgold',
  20: 'pkm_white', 21: 'pkm_black', 22: 'pkm_white2', 23: 'pkm_black2',
  66: 'pkm_black', 67: 'pkm_black2',
  24: 'pkm_x', 25: 'pkm_y', 26: 'pkm_omegaruby', 27: 'pkm_alphasapphire',
  68: 'pkm_x', 69: 'pkm_omegaruby',
  30: 'pkm_sun', 31: 'pkm_moon', 32: 'pkm_ultrasun', 33: 'pkm_ultramoon',
  71: 'pkm_sun', 72: 'pkm_ultrasun',
  44: 'pkm_sword', 45: 'pkm_shield', 47: 'pkm_legendsarceus',
  48: 'pkm_brilliantdiamond', 49: 'pkm_shiningpearl',
  74: 'pkm_sword', 75: 'pkm_brilliantdiamond',
  50: 'pkm_scarlet', 51: 'pkm_violet',
  76: 'pkm_scarlet',
};

export const GBA_VERSION_MAP: Record<number, string> = {
  1: 'pkm_sapphire', 2: 'pkm_ruby', 3: 'pkm_emerald',
  4: 'pkm_firered', 5: 'pkm_leafgreen',
  56: 'pkm_ruby', 57: 'pkm_emerald', 58: 'pkm_firered',
};

export const NDS_VERSION_MAP: Record<number, string> = {
  10: 'pkm_diamond', 11: 'pkm_pearl', 12: 'pkm_platinum',
  7: 'pkm_heartgold', 8: 'pkm_soulsilver',
  20: 'pkm_white', 21: 'pkm_black', 22: 'pkm_white2', 23: 'pkm_black2',
  62: 'pkm_diamond', 63: 'pkm_platinum', 64: 'pkm_heartgold',
  66: 'pkm_black', 67: 'pkm_black2',
};

export function getGameMetaByVersion(version: number): GameMeta | undefined {
  const gameId = VERSION_TO_GAME_ID[version];
  return gameId ? GAME_META[gameId] : undefined;
}

export const GAME_VERSION_COLORS: Record<number, string> = {
  1: '#0958d9',
  2: '#cf1322',
  3: '#08979c',
  4: '#d4380d',
  5: '#389e0d',
  7: '#d4a017',
  8: '#8b9dc3',
  10: '#5b8bd4',
  11: '#e799b0',
  12: '#b8b8b8',
  20: '#b0b0b0',
  21: '#1a1a1a',
  22: '#f0e6d3',
  23: '#0d2137',
  24: '#6376b4',
  25: '#e03a2e',
  26: '#cf1322',
  27: '#0958d9',
  30: '#fa8c16',
  31: '#722ed1',
  32: '#fa541c',
  33: '#531dab',
  34: '#52c41a',
  35: '#52c41a',
  36: '#fadb14',
  37: '#d48806',
  44: '#1677ff',
  45: '#f5222d',
  47: '#13c2c2',
  48: '#5b8bd4',
  49: '#e799b0',
  50: '#fa541c',
  51: '#722ed1',
  56: '#cf1322',
  57: '#08979c',
  58: '#d4380d',
  62: '#5b8bd4',
  63: '#b8b8b8',
  64: '#d4a017',
  66: '#1a1a1a',
  67: '#0d2137',
  68: '#6376b4',
  69: '#cf1322',
  71: '#fa8c16',
  72: '#fa541c',
  73: '#fadb14',
  74: '#1677ff',
  75: '#5b8bd4',
  76: '#fa541c',
};

export const GENERATION_MAP: Record<number, string> = {
  1: 'Gen1 (GB)', 2: 'Gen2 (GBC)', 3: 'Gen3 (GBA)',
  4: 'Gen4 (NDS)', 5: 'Gen5 (NDS)', 6: 'Gen6 (3DS)',
  7: 'Gen7 (3DS)', 8: 'Gen8 (Switch)', 9: 'Gen9 (Switch)',
};

export function getGameDisplayName(gameId: string): string {
  return getI18nGameName(gameId);
}

export function getGameShortName(gameId: string): string {
  return i18n.t(`${gameId}_short`, { ns: 'games', defaultValue: getGameDisplayName(gameId) });
}

export function getVersionDisplayName(version: number): string {
  return i18n.t(`version_display_${version}`, { ns: 'games', defaultValue: String(version) });
}

export function getPlatformTranslationKey(platform: GamePlatform): 'platform_gba' | 'platform_nds' | 'platform_3ds' | 'platform_switch' {
  switch (platform) {
    case 'GBA':
      return 'platform_gba';
    case 'NDS':
      return 'platform_nds';
    case '3DS':
      return 'platform_3ds';
    case 'Switch':
      return 'platform_switch';
  }
}
