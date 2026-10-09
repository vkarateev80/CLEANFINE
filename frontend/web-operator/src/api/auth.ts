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

/**
 * Выход: отзыв refresh-токена на сервере, затем локальная очистка. Без сети
 * сервер не ответит — выходим всё равно (профиль оператора не должен оставаться
 * на чужом телефоне из-за отсутствия связи).
 */
export async function logout(): Promise<void> {
  const { refreshToken } = useAuthStore.getState();
  try {
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken });
    }
  } catch {
    /* см. комментарий выше */
  } finally {
    useAuthStore.getState().logout();
  }
}

export async function fetchMe(): Promise<SessionUser> {
  const { data } = await apiClient.get<SessionUser>('/auth/me');
  useAuthStore.getState().setUser(data);
  return data;
}

/**
 * Смена пароля. После успеха сервер отзывает ВСЕ сессии (auth.service.ts),
 * поэтому вызывающий экран ведёт на /login (profile.md §3.2).
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiClient
    .post('/auth/change-password', { currentPassword, newPassword })
    .then(() => undefined);
}
