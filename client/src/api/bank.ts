import apiClient from './axios';
import type { PokemonDto } from './saveFile';

export interface BankPokemon {
  id: string;
  species: number;
  speciesName: string;
  nickname: string;
  level: number;
  nature: number;
  natureName: string;
  ability: number;
  abilityName: string;
  generation: number;
  gameVersion: number;
  isShiny: boolean;
  isEgg: boolean;
  source: string;
  createdAt: string;
  pokemonData: PokemonDto;
}

export interface BankListResponse {
  items: BankPokemon[];
  total: number;
  page: number;
  pageSize: number;
}

export const bankApi = {
  list: (params?: {
    generation?: number;
    isShiny?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => apiClient.get<BankListResponse>('/bank', { params }),

  getDetail: (id: string) =>
    apiClient.get<BankPokemon>(`/bank/${id}`),

  fromSave: (data: {
    saveFileId: string;
    boxIndex: number;
    slotIndex: number;
  }) => apiClient.post<BankPokemon>('/bank/from-save', data),

  moveToSave: (saveFileId: string, data: {
    bankPokemonId: string;
    targetBoxIndex: number;
    targetSlotIndex: number;
  }) => apiClient.post(`/save-file/${saveFileId}/move-from-bank`, data),

  delete: (id: string) =>
    apiClient.delete(`/bank/${id}`),

  batchDelete: (ids: string[]) =>
    apiClient.post('/bank/batch-delete', { ids }),
};
