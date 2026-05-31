import { create } from 'zustand';
import { resourceApi, type ResourceItem } from '../api/resource';

interface ResourceState {
  species: ResourceItem[];
  moves: ResourceItem[];
  abilities: ResourceItem[];
  natures: ResourceItem[];
  items: ResourceItem[];
  balls: ResourceItem[];
  loaded: boolean;

  loadAll: () => Promise<void>;
  getSpeciesName: (id: number) => string;
  getMoveName: (id: number) => string;
  getAbilityName: (id: number) => string;
  getNatureName: (id: number) => string;
  getItemName: (id: number) => string;
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  species: [],
  moves: [],
  abilities: [],
  natures: [],
  items: [],
  balls: [],
  loaded: false,

  loadAll: async () => {
    if (get().loaded) return;
    try {
      const [species, moves, abilities, natures, items, balls] = await Promise.all([
        resourceApi.species(),
        resourceApi.moves(),
        resourceApi.abilities(),
        resourceApi.natures(),
        resourceApi.items(),
        resourceApi.balls(),
      ]);
      set({
        species: species.data || [],
        moves: moves.data || [],
        abilities: abilities.data || [],
        natures: natures.data || [],
        items: items.data || [],
        balls: balls.data || [],
        loaded: true,
      });
    } catch {
      // 静默失败，稍后重试
    }
  },

  getSpeciesName: (id: number) => get().species.find(s => s.id === id)?.name ?? `#${id}`,
  getMoveName: (id: number) => get().moves.find(m => m.id === id)?.name ?? `招式${id}`,
  getAbilityName: (id: number) => get().abilities.find(a => a.id === id)?.name ?? `特性${id}`,
  getNatureName: (id: number) => get().natures.find(n => n.id === id)?.name ?? `性格${id}`,
  getItemName: (id: number) => get().items.find(i => i.id === id)?.name ?? '',
}));
