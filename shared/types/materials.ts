/**
 * Движение материалов. Источник: УСТАВ.md → Агент Backend Materials (Prisma enum).
 */
export const MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'WRITE_OFF'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  IN: 'Приход',
  OUT: 'Расход',
  TRANSFER: 'Перемещение',
  WRITE_OFF: 'Списание',
};
