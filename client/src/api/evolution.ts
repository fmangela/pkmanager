import apiClient from './axios';
import type { PokemonDto } from './saveFile';

export interface EvolutionOptionDto {
  species: number;
  speciesName: string;
  form: number;
  formName: string;
  methodLabel: string;
  requiredLevel: number;
  argument: number;
  isAvailable: boolean;
  blockReason?: string;
}

export interface EvolutionPathDto {
  hasAnyEvolution: boolean;
  hasBranchingPaths: boolean;
  isNincada: boolean;
  options: EvolutionOptionDto[];
}

export interface GetEvolutionsRequest {
  pkmDataBase64: string;
  saveFileId: string;
  editSnapshot?: Record<string, unknown>;
}

export interface EvolveRequest {
  pkmDataBase64: string;
  saveFileId: string;
  boxIndex: number;
  slotIndex: number;
  isParty: boolean;
  editSnapshot?: Record<string, unknown>;
  targetSpecies: number;
  targetForm: number;
  alsoCreateShedinja: boolean;
}

export interface EvolveResultDto {
  success: boolean;
  error?: string;
  evolvedPokemon?: PokemonDto;
  shedinja?: PokemonDto;
  shedinjaLocation?: string;
}

export const evolutionApi = {
  getEvolutions: (data: GetEvolutionsRequest) =>
    apiClient.post<EvolutionPathDto>('/Pokemon/evolutions', data),

  evolve: (data: EvolveRequest) =>
    apiClient.post<EvolveResultDto>('/Pokemon/evolve', data),
};
