import { create } from 'zustand';
import { settingsApi, type EmulatorSettings } from '../api/settings';

interface SettingsState {
  emulators: EmulatorSettings | null;
  loading: boolean;

  fetch: () => Promise<EmulatorSettings>;
  save: (data: EmulatorSettings) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  emulators: null,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const res = await settingsApi.getEmulators();
    const data = res.data as unknown as EmulatorSettings;
    set({ emulators: data, loading: false });
    return data;
  },

  save: async (data) => {
    set({ loading: true });
    const res = await settingsApi.saveEmulators(data);
    const updated = res.data as unknown as EmulatorSettings;
    set({ emulators: updated, loading: false });
  },
}));
