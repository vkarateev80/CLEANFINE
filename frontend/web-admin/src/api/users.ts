import { apiClient } from './client';
import type { Role } from '@cleaning-ops/shared/types/roles';
import type { Paginated } from '../types/core';
import type { SessionUser } from '../types';

/**
 * Клиент сотрудников (auth-service, `/api/users` через прокси). Поля ответа —
 * `SafeUser` бэкенда, он же используется в `/api/auth/me` (см. `SessionUser`).
 *
 * Список доступен только ролям ADMIN/SUPERVISOR (`@Roles`), поэтому вызовы
 * должны быть необязательными для остальных: экран заявок читают все роли, а
 * справочник исполнителей подтягивается лишь для ADMIN/SUPERVISOR.
 */

export interface ListUsersQuery {
  skip?: number;
  take?: number;
  role?: Role;
  isActive?: boolean;
  /** По ФИО, email или телефону. */
  search?: string;
}

export function listUsers(query: ListUsersQuery = {}): Promise<Paginated<SessionUser>> {
  return apiClient
    .get('/users', {
      params: {
        ...query,
        // `isActive` бэкенд читает как строку 'true'/'false' — undefined не отправляем.
        ...(query.isActive === undefined ? {} : { isActive: String(query.isActive) }),
      },
    })
    .then((r) => r.data);
}

export function getUser(id: string): Promise<SessionUser> {
  return apiClient.get(`/users/${id}`).then((r) => r.data);
}

/** Создание сотрудника (`POST /users`, только ADMIN). Пароль — от 6 символов. */
export interface CreateUserPayload {
  email: string;
  phone?: string;
  password: string;
  fullName: string;
  role?: Role;
}

/** Правка сотрудника (`PATCH /users/:id`, только ADMIN); `isActive` — мягкая деактивация/возврат. */
export interface UpdateUserPayload {
  email?: string;
  phone?: string;
  fullName?: string;
  role?: Role;
  isActive?: boolean;
  avatarUrl?: string;
}

export function createUser(payload: CreateUserPayload): Promise<SessionUser> {
  return apiClient.post('/users', payload).then((r) => r.data);
}

export function updateUser(id: string, payload: UpdateUserPayload): Promise<SessionUser> {
  return apiClient.patch(`/users/${id}`, payload).then((r) => r.data);
}

/** Мягкая деактивация: сотрудник остаётся в базе, вход блокируется (401). */
export function deactivateUser(id: string): Promise<void> {
  return apiClient.delete(`/users/${id}`).then(() => undefined);
}
