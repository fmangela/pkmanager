import apiClient from './axios';

// 模拟器配置: key → value 字典
export type EmulatorSettings = Record<string, string>;

export const settingsApi = {
  getEmulators: () =>
    apiClient.get<EmulatorSettings>('/settings/emulators'),

  saveEmulators: (data: EmulatorSettings) =>
    apiClient.put<EmulatorSettings>('/settings/emulators', data),
};
