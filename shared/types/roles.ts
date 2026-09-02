/**
 * Роли пользователей (RBAC). Источник: УСТАВ.md → Агент Backend Auth (enum Role).
 * Значения совпадают с Prisma-enum: OPERATOR | SUPERVISOR | ADMIN | CLIENT.
 */
export const ROLES = ['OPERATOR', 'SUPERVISOR', 'ADMIN', 'CLIENT'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: 'Оператор',
  SUPERVISOR: 'Бригадир',
  ADMIN: 'Администратор',
  CLIENT: 'Клиент',
};
