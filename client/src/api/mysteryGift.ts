import apiClient from './axios';

// L.7 配信功能 — Wonder Card 注入 API
// 详见 docs/配信功能-技术文档.md

/** 可注入的 Wonder Card 索引（来自 wonder_cards 表） */
export interface WonderCardDto {
  id: string;
  cardId: number;
  gameVersion: string;
  title: string;
  description?: string;
  speciesId?: number;
  itemId?: number;
  language: string;
  cardType: string;
  filePath: string;
  releaseDate?: string;
}

/** 已注入到存档槽位的 wonder card */
export interface MysteryGiftSlotDto {
  slot: number;
  cardId: number;
  title: string;
  speciesId?: number;
  speciesName?: string;
  itemId?: number;
  cardType: string;
  isItem: boolean;
  isEntity: boolean;
}

/** 注入响应 */
export interface MysteryGiftInjectResultDto {
  slot: MysteryGiftSlotDto;
  cardId: string;
}

/** 列出当前存档已注入的 wonder card */
export const listInjectedWonderCards = (saveFileId: string) =>
  apiClient.get<MysteryGiftSlotDto[]>(`/SaveFile/${saveFileId}/wonder-cards`)
    .then((r) => r.data);

/** 列出可注入的 wonder card（按 gameVersion + language 过滤） */
export const listAvailableWonderCards = (saveFileId: string, language?: string) =>
  apiClient.get<WonderCardDto[]>(`/SaveFile/${saveFileId}/wonder-cards/available`, {
    params: language ? { language } : undefined,
  }).then((r) => r.data);

/** 注入指定 wonder card 到存档（自动选第一个空槽位，或通过 slot 指定） */
export const injectWonderCard = (saveFileId: string, cardId: string, slot?: number) =>
  apiClient.post<MysteryGiftInjectResultDto>(
    `/SaveFile/${saveFileId}/wonder-cards/${cardId}/inject`,
    null,
    { params: slot != null ? { slot } : undefined },
  ).then((r) => r.data);

/** 移除指定槽位的 wonder card */
export const removeWonderCard = (saveFileId: string, slot: number) =>
  apiClient.delete(`/SaveFile/${saveFileId}/wonder-cards/slot/${slot}`)
    .then((r) => r.data);

/** 清空所有已注入的 wonder card */
export const clearAllWonderCards = (saveFileId: string) =>
  apiClient.delete(`/SaveFile/${saveFileId}/wonder-cards`)
    .then((r) => r.data);
