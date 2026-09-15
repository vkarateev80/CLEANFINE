import { useAuthStore } from '../stores/authStore';

/**
 * Права интерфейса повторяют `@Roles(...)` core-service, чтобы кнопка не вела
 * в 403. Источник истины — бэкенд: `ADMIN` и `SUPERVISOR` создают и правят,
 * удаляют только `ADMIN`.
 */

export function useCurrentRole() {
  return useAuthStore((s) => s.user?.role ?? null);
}

/** Создание и редактирование: `@Roles('ADMIN', 'SUPERVISOR')`. */
export function useCanEdit(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR';
}

/** Удаление: `@Roles('ADMIN')` — у этажей, объектов, техкарт. */
export function useIsAdmin(): boolean {
  return useCurrentRole() === 'ADMIN';
}
