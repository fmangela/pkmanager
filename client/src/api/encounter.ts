import apiClient from './axios';
import type { PokemonDto } from './saveFile';

// ── Request types ──

export interface EncounterSearchRequest {
  species: number;
  form?: number;
  saveFileId: string;
  levelMin?: number;
  levelMax?: number;
  encounterTypes?: string[];
}

export interface EncounterApplyRequest {
  recomputeToken: string;
  pkmDataBase64: string;
  editSnapshot: Record<string, unknown>;
  saveFileId: string;
}

export interface EncounterGenerateRequest {
  recomputeToken: string;
  saveFileId: string;
  boxIndex: number;
  slotIndex: number;
  allowOverwrite?: boolean;
  level?: number;
  nature?: number;
  gender?: number;
  forceShiny?: boolean;
}

// ── Response types ──

export interface EncounterItemDto {
  index: number;
  encounterType: string;
  typeName: string;
  longName: string;
  version: number;
  versionName: string;
  generation: number;
  locationName?: string;
  levelMin: number;
  levelMax: number;
  shiny: string;
  ability: string;
  moves: number[];
  moveNames: string[];
  fixedBall?: number;
  fixedBallName?: string;
  fixedNature?: number;
  gender?: number;
  relearnMoves?: number[];
  recomputeToken: string;
}

export interface EncounterSearchResultDto {
  totalCount: number;
  items: EncounterItemDto[];
}

export interface EncounterApplyResultDto {
  success: boolean;
  error?: string;
  pokemon?: PokemonDto;
  appliedFields: string[];
}

export interface EncounterGenerateResultDto {
  success: boolean;
  error?: string;
  pokemon?: PokemonDto;
  pkmDataBase64?: string;
  isLegal: boolean;
  legalityReport?: string;
}

// ── API methods ──

export const encounterApi = {
  search: (data: EncounterSearchRequest) =>
    apiClient.post<EncounterSearchResultDto>('/Pokemon/search-encounters', data),

  applyEncounter: (data: EncounterApplyRequest) =>
    apiClient.post<EncounterApplyResultDto>('/Pokemon/apply-encounter', data),

  generateFromEncounter: (data: EncounterGenerateRequest) =>
    apiClient.post<EncounterGenerateResultDto>('/Pokemon/generate-from-encounter', data),
};
