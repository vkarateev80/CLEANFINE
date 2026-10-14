import { useAuthStore } from '../stores/authStore';

/**
 * Права интерфейса повторяют `@Roles(...)` core-service, чтобы кнопка не вела
 * в 403. Источник истины — бэкенд: `ADMIN`, `SUPERVISOR` и `MANAGER` (офисный
 * менеджер, 14.10.2026 — права как у бригадира) создают и правят, удаляют и
 * управляют сотрудниками только `ADMIN`.
 */

export function useCurrentRole() {
  return useAuthStore((s) => s.user?.role ?? null);
}

/** Создание и редактирование: `@Roles('ADMIN', 'SUPERVISOR')`. */
export function useCanEdit(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER';
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
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER' || role === 'CLIENT';
}

/** Смена статуса: у CLIENT кнопок переходов нет — бэкенд ответит 403. */
export function useCanTransitionTicketStatus(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER' || role === 'OPERATOR';
}

/** Назначение исполнителя и справочник сотрудников (`/api/users`). */
export function useCanAssignTicket(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER';
}

/*
 * Материалы (М4.3). Права повторяют `@Roles(...)` material-service:
 *  • GET /api/materials, /stocks, /:id/movements, /report — без @Roles,
 *    то есть все авторизованные (оператору и заказчику остатки нужны в работе);
 *  • POST/PATCH/DELETE справочника — ADMIN, SUPERVISOR;
 *  • POST /api/materials/movements — ADMIN, SUPERVISOR, OPERATOR (склад двигает
 *    и оператор, но править сам справочник — нет).
 */

/** Создание, правка и удаление материалов справочника. */
export function useCanManageMaterials(): boolean {
  return useCanEdit();
}

/** Проведение движений (приход/расход/перемещение/списание). */
export function useCanMoveMaterials(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER' || role === 'OPERATOR';
}

/*
 * Графики и смены (М4.6). Права повторяют `@Roles(...)` schedule-service:
 *  • GET (список графиков, смены дня, /my, смена по id) — без @Roles, то есть
 *    все авторизованные: свои смены смотрит и оператор, и заказчик;
 *  • POST/PATCH/DELETE графика — ADMIN, SUPERVISOR;
 *  • POST /check-in и /check-out — OPERATOR, SUPERVISOR, ADMIN;
 *  • POST /generate, POST /check-missed, GET /scheduler/state — только ADMIN:
 *    это ручные триггеры периодических проходов, а не рабочее действие смены.
 */

/** Создание, правка и удаление графиков. */
export function useCanManageSchedule(): boolean {
  return useCanEdit();
}

/** Ручные триггеры: генерация смен на дату, прогон неявок, состояние планировщика. */
export function useIsScheduleAdmin(): boolean {
  return useIsAdmin();
}

/** Отметка прихода/ухода по смене. */
export function useCanCheckIn(): boolean {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'MANAGER' || role === 'OPERATOR';
}
