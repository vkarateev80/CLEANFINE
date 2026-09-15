/**
 * Контракты ядра домена. Источник: УСТАВ.md → Агент Backend Core (Prisma enum'ы).
 * Значения совпадают с enum'ами core-service: ObjectStatus, RouteStatus.
 */

/** Статус объекта обслуживания. */
export const OBJECT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const OBJECT_STATUS_LABELS: Record<ObjectStatus, string> = {
  ACTIVE: 'Активен',
  PAUSED: 'Приостановлен',
  ARCHIVED: 'В архиве',
};

/** Статус маршрута уборки. */
export const ROUTE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  DRAFT: 'Черновик',
  ACTIVE: 'Активен',
  ARCHIVED: 'В архиве',
};

/**
 * Допустимые переходы статуса маршрута.
 * DRAFT → ACTIVE (утверждение), ACTIVE → ARCHIVED (снятие с эксплуатации),
 * ARCHIVED — терминальный.
 */
export const ROUTE_ALLOWED_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: [],
};

export function canTransitionRoute(from: RouteStatus, to: RouteStatus): boolean {
  return ROUTE_ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Допустимые переходы статуса объекта.
 * ARCHIVED — терминальный: возврат только через явное восстановление администратором.
 */
export const OBJECT_ALLOWED_TRANSITIONS: Record<ObjectStatus, ObjectStatus[]> = {
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionObject(from: ObjectStatus, to: ObjectStatus): boolean {
  return from === to || OBJECT_ALLOWED_TRANSITIONS[from].includes(to);
}
