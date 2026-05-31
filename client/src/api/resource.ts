import apiClient from './axios';

export interface ResourceItem {
  id: number;
  name: string;
}

export const resourceApi = {
  species: () =>
    apiClient.get<ResourceItem[]>('/Resource/species'),

  moves: (generation?: number) =>
    apiClient.get<ResourceItem[]>('/Resource/moves', { params: { generation } }),

  abilities: () =>
    apiClient.get<ResourceItem[]>('/Resource/abilities'),

  natures: () =>
    apiClient.get<ResourceItem[]>('/Resource/natures'),

  items: () =>
    apiClient.get<ResourceItem[]>('/Resource/items'),

  balls: () =>
    apiClient.get<ResourceItem[]>('/Resource/balls'),

  games: () =>
    apiClient.get<ResourceItem[]>('/Resource/games'),

  speciesAbilities: (speciesId: number, generation?: number) =>
    apiClient.get<ResourceItem[]>(`/Resource/species/${speciesId}/abilities`, { params: { generation } }),

  speciesMoves: (speciesId: number, generation?: number) =>
    apiClient.get<ResourceItem[]>(`/Resource/species/${speciesId}/moves`, { params: { generation } }),

  geoCountries: () =>
    apiClient.get<ResourceItem[]>('/Resource/geo/countries'),

  geoRegions: (countryId: number) =>
    apiClient.get<ResourceItem[]>(`/Resource/geo/regions/${countryId}`),
};
