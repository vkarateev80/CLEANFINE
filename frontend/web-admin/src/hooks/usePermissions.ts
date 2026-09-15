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

/*
 * Заявки (М3.7). Права повторяют `@Roles(...)` ticket-service дословно:
 *  • POST /api/tickets            — ADMIN, SUPERVISOR, CLIENT;
 *  • PATCH /api/tickets/:id/status — ADMIN, SUPERVISOR, OPERATOR;
 *  • POST /api/tickets/:id/assign  — ADMIN, SUPERVISOR;
 *  • GET (список и деталь)         — без @Roles, то есть все авторизованные.
 */

/** Создание плановой/внеплановой заявки. */
export function useCanCreateTicket(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'CLIENT';
}

/** Смена статуса: у CLIENT кнопок переходов нет — бэкенд ответит 403. */
export function useCanTransitionTicketStatus(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'OPERATOR';
}

/** Назначение исполнителя и справочник сотрудников (`/api/users`). */
export function useCanAssignTicket(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR';
}
