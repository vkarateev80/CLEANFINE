import { apiClient } from './client';
import { useAuthStore } from '../stores/authStore';
import type { LoginPayload, SessionUser } from '../types';

export async function login(payload: LoginPayload): Promise<SessionUser> {
  const { data } = await apiClient.post('/auth/login', payload);
  useAuthStore.getState().setTokens(data);
  const { data: me } = await apiClient.get<SessionUser>('/auth/me');
  useAuthStore.getState().setUser(me);
  return me;
}

export async function logout(): Promise<void> {
  const { refreshToken } = useAuthStore.getState();
  try {
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken });
    }
  } finally {
    useAuthStore.getState().logout();
  }
}

export async function fetchMe(): Promise<SessionUser> {
  const { data } = await apiClient.get<SessionUser>('/auth/me');
  useAuthStore.getState().setUser(data);
  return data;
}
