/**
 * Статусы домена — единый источник в `shared/types/core.ts`. Frontend их только
 * реэкспортирует: подписи и правила переходов должны совпадать с бэкендом
 * (core-service бросает 400 на недопустимый переход), поэтому вторая копия
 * словаря здесь была бы источником расхождений.
 */
export {
  OBJECT_ALLOWED_TRANSITIONS,
  OBJECT_STATUS_LABELS,
  OBJECT_STATUSES,
  ROUTE_ALLOWED_TRANSITIONS,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUSES,
  canTransitionObject,
  canTransitionRoute,
} from '@cleaning-ops/shared/types/core';

export type { ObjectStatus, RouteStatus } from '@cleaning-ops/shared/types/core';
