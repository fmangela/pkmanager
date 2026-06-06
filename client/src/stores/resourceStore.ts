import { create } from 'zustand';
import { resourceApi, type ResourceItem } from '../api/resource';
import { useDiagnosticStore } from './diagnosticStore';

interface ResourceState {
  species: ResourceItem[];
  moves: ResourceItem[];
  abilities: ResourceItem[];
  natures: ResourceItem[];
  items: ResourceItem[];
  balls: ResourceItem[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

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
  loading: false,
  error: null,

  loadAll: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });

    try {
      const results = await Promise.allSettled([
        resourceApi.species(),
        resourceApi.moves(),
        resourceApi.abilities(),
        resourceApi.natures(),
        resourceApi.items(),
        resourceApi.balls(),
      ]);

      const names = ['species', 'moves', 'abilities', 'natures', 'items', 'balls'] as const;
      const failed: string[] = [];

      const extracted = results.map((r, i) => {
        if (r.status === 'fulfilled') {
          return r.value.data || [];
        } else {
          failed.push(names[i]);
          useDiagnosticStore.getState().log({
            category: 'api',
            level: 'error',
            message: `资源加载失败: ${names[i]}`,
            stack: r.reason?.message,
          });
          return [];
        }
      });

      set({
        species: extracted[0],
        moves: extracted[1],
        abilities: extracted[2],
        natures: extracted[3],
        items: extracted[4],
        balls: extracted[5],
        loaded: true,
        loading: false,
        error: failed.length > 0 ? `部分资源加载失败: ${failed.join(', ')}` : null,
      });
    } catch (err: any) {
      // This should not happen with Promise.allSettled, but just in case
      set({ loading: false, error: '资源加载失败，请刷新页面重试' });
      useDiagnosticStore.getState().log({
        category: 'api',
        level: 'error',
        message: '资源批量加载异常',
        stack: err?.message,
      });
    }
  },

  getSpeciesName: (id: number) => get().species.find((s) => s.id === id)?.name ?? `#${id}`,
  getMoveName: (id: number) => get().moves.find((m) => m.id === id)?.name ?? `招式${id}`,
  getAbilityName: (id: number) => get().abilities.find((a) => a.id === id)?.name ?? `特性${id}`,
  getNatureName: (id: number) => get().natures.find((n) => n.id === id)?.name ?? `性格${id}`,
  getItemName: (id: number) => get().items.find((i) => i.id === id)?.name ?? '',
}));
