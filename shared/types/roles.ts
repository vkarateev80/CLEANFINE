/**
 * Роли пользователей (RBAC). Источник: УСТАВ.md → Агент Backend Auth (enum Role).
 * Значения совпадают с Prisma-enum: OPERATOR | SUPERVISOR | MANAGER | ADMIN | CLIENT.
 *
 * MANAGER (14.10.2026, решение владельца): офисный менеджер. Права — как у
 * SUPERVISOR (создаёт и правит объекты, техкарты, маршруты, заявки, графики,
 * материалы, чаты; видит сотрудников), без админских действий: управление
 * пользователями, пароли и удаления остаются за ADMIN.
 */
export const ROLES = ['OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'CLIENT'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: 'Оператор',
  SUPERVISOR: 'Бригадир',
  MANAGER: 'Менеджер',
  ADMIN: 'Администратор',
  CLIENT: 'Клиент',
};
