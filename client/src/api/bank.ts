import apiClient from './axios';
import type { PokemonDto, EditResultDto, PokemonSearchRequest, PokemonSearchResultDto } from './saveFile';

// ── 列表摘要（GET /api/bank 返回）─────────────────────

export interface BankListItem {
  id: string;
  species: number;
  speciesName: string;
  nickname?: string;
  level: number;
  natureName?: string;
  abilityName?: string;
  generation: number;
  gameVersion?: number;
  isShiny: boolean;
  isEgg: boolean;
  isValid: boolean;
  isAlpha: boolean;
  canGigantamax: boolean;
  heldItemName?: string;
  source: string;
  sourceSaveId?: string;
  createdAt: string;
}

export interface BankListResponse {
  items: BankListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 详情（GET /api/bank/{id} 返回完整 PokemonDto）─────
// 复用 PokemonDto，不再用独立的 BankPokemon 类型

export const bankApi = {
  list: (params?: {
    generation?: number;
    isShiny?: boolean;
    nature?: number;
    ability?: number;
    sortBy?: string;
    sortAsc?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => apiClient.get<BankListResponse>('/bank', { params }),

  getDetail: (id: string) =>
    apiClient.get<PokemonDto>(`/bank/${id}`),

  fromSave: (data: {
    saveFileId: string;
    boxIndex: number;
    slotIndex: number;
  }) => apiClient.post<{ bankPokemonId: string; pokemon: PokemonDto }>('/bank/from-save', data),

  moveToSave: (saveFileId: string, data: {
    bankPokemonId: string;
    targetBoxIndex: number;
    targetSlotIndex: number;
  }) => apiClient.post(`/SaveFile/${saveFileId}/move-from-bank`, data),

  delete: (id: string) =>
    apiClient.delete(`/bank/${id}`),

  batchDelete: (ids: string[]) =>
    apiClient.post('/bank/batch-delete', { ids }),

  batchExport: (ids: string[]) =>
    apiClient.post('/bank/batch-export', { ids }, { responseType: 'blob' }),

  batchMoveToSave: (data: {
    ids: string[];
    saveFileId: string;
    targetBoxIndex: number;
  }) => apiClient.post<{ movedCount: number; failedCount: number; failedIds: string[] }>('/bank/batch-move-to-save', data),

  saveEdit: (id: string, data: Record<string, unknown>) =>
    apiClient.put<EditResultDto>(`/bank/${id}`, data),

  /** 单只发送到存档 (POST /api/Bank/{id}/move-to-save) */
  sendToSave: (id: string, data: { saveFileId: string; targetBoxIndex: number; targetSlotIndex?: number }) =>
    apiClient.post(`/bank/${id}/move-to-save`, data),

  /** 高级搜索 — 在银行中按多条件筛选宝可梦 */
  searchBank: (request: PokemonSearchRequest) =>
    apiClient.post<PokemonSearchResultDto>('/bank/search', request),
};
