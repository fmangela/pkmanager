import apiClient from './axios';

export interface ResourceItem {
  id: number;
  name: string;
  slot?: number;
}

export interface SpeciesExperienceInfo {
  growthRate: number;
  expTable: number[];
}

export const resourceApi = {
  species: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/species', { params: { lang } }),

  moves: (generation?: number, lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/moves', { params: { generation, lang } }),

  abilities: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/abilities', { params: { lang } }),

  natures: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/natures', { params: { lang } }),

  items: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/items', { params: { lang } }),

  balls: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/balls', { params: { lang } }),

  games: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/games', { params: { lang } }),

  speciesAbilities: (speciesId: number, generation?: number, form?: number, lang?: string) =>
    apiClient.get<ResourceItem[]>(`/Resource/species/${speciesId}/abilities`, { params: { generation, form, lang } }),

  speciesMoves: (speciesId: number, generation?: number, form?: number, lang?: string) =>
    apiClient.get<ResourceItem[]>(`/Resource/species/${speciesId}/moves`, { params: { generation, form, lang } }),

  speciesExperience: (speciesId: number, generation?: number, form?: number, lang?: string) =>
    apiClient.get<SpeciesExperienceInfo>(`/Resource/species/${speciesId}/experience`, { params: { generation, form, lang } }),

  geoCountries: (lang?: string) =>
    apiClient.get<ResourceItem[]>('/Resource/geo/countries', { params: { lang } }),

  geoRegions: (countryId: number, lang?: string) =>
    apiClient.get<ResourceItem[]>(`/Resource/geo/regions/${countryId}`, { params: { lang } }),
};
