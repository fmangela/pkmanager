import { create } from 'zustand';
import { resourceApi, type ResourceItem } from '../api/resource';
import { useDiagnosticStore } from './diagnosticStore';
import i18n from '../i18n/i18n';
import { getI18nText } from '../i18n/i18n';
import type { ApiError } from '../api/axios';

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
  language: string | null;

  loadAll: () => Promise<void>;
  getSpeciesName: (id: number) => string;
  getMoveName: (id: number) => string;
  getAbilityName: (id: number) => string;
  getNatureName: (id: number) => string;
  getItemName: (id: number) => string;
}

function fallbackResourceName(key: string, id: number): string {
  return `${getI18nText(key, undefined, 'common')} ${id}`;
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
  language: null,

  loadAll: async () => {
    const currentLang = i18n.language;
    if (get().loaded && get().language === currentLang) return;
    if (get().loading) return;
    set({ loading: true, error: null });

    try {
      const results = await Promise.allSettled([
        resourceApi.species(currentLang),
        resourceApi.moves(undefined, currentLang),
        resourceApi.abilities(currentLang),
        resourceApi.natures(currentLang),
        resourceApi.items(currentLang),
        resourceApi.balls(currentLang),
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
            message: `${getI18nText('resource.loadFailedPrefix', undefined, 'messages') || '资源加载失败'}: ${names[i]}`,
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
        language: currentLang,
        loading: false,
        error: failed.length > 0 ? `${getI18nText('resource.partialLoadFailed', undefined, 'messages') || '部分资源加载失败'}: ${failed.join(', ')}` : null,
      });
    } catch (err: unknown) {
      const apiError = err as ApiError & { message?: string };
      // This should not happen with Promise.allSettled, but just in case
      set({ loading: false, error: getI18nText('resource.loadRetry', undefined, 'messages') || '资源加载失败，请刷新页面重试' });
      useDiagnosticStore.getState().log({
        category: 'api',
        level: 'error',
        message: getI18nText('resource.loadException', undefined, 'messages') || '资源批量加载异常',
        stack: apiError.message,
      });
    }
  },

  getSpeciesName: (id: number) => get().species.find((s) => s.id === id)?.name ?? `#${id}`,
  getMoveName: (id: number) => get().moves.find((m) => m.id === id)?.name ?? fallbackResourceName('resource.move', id),
  getAbilityName: (id: number) => get().abilities.find((a) => a.id === id)?.name ?? fallbackResourceName('resource.ability', id),
  getNatureName: (id: number) => get().natures.find((n) => n.id === id)?.name ?? fallbackResourceName('resource.nature', id),
  getItemName: (id: number) => get().items.find((i) => i.id === id)?.name ?? fallbackResourceName('resource.item', id),
}));
