import type { MovementType } from '@cleaning-ops/shared/types/materials';

/**
 * Единственное место, где определяется «знак» движения для остатка.
 *
 * IN / TRANSFER — приход (TRANSFER приходует на объект-получатель),
 * OUT / WRITE_OFF — расход. Всё остальное (агрегаты отчёта, автосписание)
 * опирается на эти функции, поэтому правило существует в одном экземпляре.
 */
export const INCOMING_MOVEMENT_TYPES: readonly MovementType[] = ['IN', 'TRANSFER'];
export const OUTGOING_MOVEMENT_TYPES: readonly MovementType[] = ['OUT', 'WRITE_OFF'];

/** Движения, которые уменьшают склад объекта (расход и списание). */
export function isConsumingMovement(type: MovementType): boolean {
  return OUTGOING_MOVEMENT_TYPES.includes(type);
}

/** Движения, которые увеличивают склад объекта (приход и перемещение). */
export function isIncomingMovement(type: MovementType): boolean {
  return INCOMING_MOVEMENT_TYPES.includes(type);
}

/**
 * Складской эффект движения по объекту `objectId` (сторона движения).
 * Для TRANSFER это −quantity (списание с исходного объекта).
 */
export function stockDelta(type: MovementType, quantity: number): number {
  return isIncomingMovement(type) ? quantity : -quantity;
}

/**
 * Пары «объект → изменение остатка» для движения. Для IN/OUT/WRITE_OFF это одна
 * пара, для TRANSFER — две: расход с исходного объекта и приход на целевой.
 */
export function stockEffects(
  type: MovementType,
  quantity: number,
  objectId: string,
  targetObjectId?: string | null,
): Array<{ objectId: string; delta: number }> {
  if (type === 'TRANSFER') {
    if (!targetObjectId || targetObjectId === objectId) {
      throw new Error('TRANSFER требует targetObjectId, отличный от objectId');
    }
    return [
      { objectId, delta: -quantity },
      { objectId: targetObjectId, delta: quantity },
    ];
  }
  return [{ objectId, delta: stockDelta(type, quantity) }];
}
