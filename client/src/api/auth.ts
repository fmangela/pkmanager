import apiClient from './axios';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
  deviceId: string;
}

export interface UserDto {
  id: string;
  username: string;
  email: string;
  preferredLang: string;
}

export interface DeviceDto {
  deviceId: string;
  deviceLabel: string | null;
  userAgent: string | null;
  lastUsedAt: string | null;
  issuedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SetLanguageRequest {
  lang: string;
}

export interface LogoutRequest {
  refreshToken?: string;
}

export interface RenameDeviceRequest {
  label: string;
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/auth/register', data),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthResponse>('/auth/refresh', { refreshToken }),

  logout: (refreshToken?: string) =>
    apiClient.post('/auth/logout', { refreshToken } satisfies LogoutRequest),

  me: () => apiClient.get<UserDto>('/auth/me'),

  setLanguage: (lang: string) =>
    apiClient.put<boolean>('/auth/language', { lang } satisfies SetLanguageRequest),

  listDevices: () => apiClient.get<DeviceDto[]>('/auth/devices'),

  revokeDevice: (deviceId: string) =>
    apiClient.delete(`/auth/devices/${deviceId}`),

  renameDevice: (deviceId: string, label: string) =>
    apiClient.put(`/auth/devices/${deviceId}/label`, { label } satisfies RenameDeviceRequest),
};
