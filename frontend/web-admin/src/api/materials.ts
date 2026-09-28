import { apiClient } from './client';
import type {
  ConsumptionReport,
  CreateMaterialPayload,
  CreateMovementPayload,
  CreateMovementResult,
  ListMaterialsQuery,
  ListMaterialsResult,
  ListMovementsQuery,
  ListMovementsResult,
  MaterialDetailEntity,
  MaterialListItem,
  ReportQuery,
  StockView,
  StocksQuery,
  UpdateMaterialPayload,
} from '../types/materials';

/**
 * Клиент material-service (:3007 через прокси `/api/materials`). Как и
 * `api/core`, пути собраны в одном модуле: страницы не должны знать про
 * `/materials/:id/movements`, иначе путь размножится по компонентам и разойдётся
 * с контроллером `MaterialsController`.
 *
 * Роли (повторяют `@Roles(...)`, см. `usePermissions.ts`):
 *  • GET (справочник, остатки, история, отчёт) — все авторизованные;
 *  • POST/PATCH/DELETE справочника — ADMIN, SUPERVISOR;
 *  • POST /movements — ADMIN, SUPERVISOR, OPERATOR.
 */

/** Справочник: `{ items, total }`, поиск по названию и поставщику (`take` ≤ 100). */
export function listMaterials(query: ListMaterialsQuery = {}): Promise<ListMaterialsResult> {
  return apiClient.get('/materials', { params: query }).then((r) => r.data);
}

/** Материал с остатками по объектам — деталь справочника. */
export function getMaterial(id: string): Promise<MaterialDetailEntity> {
  return apiClient.get(`/materials/${id}`).then((r) => r.data);
}

export function createMaterial(payload: CreateMaterialPayload): Promise<MaterialListItem> {
  return apiClient.post('/materials', payload).then((r) => r.data);
}

export function updateMaterial(
  id: string,
  payload: UpdateMaterialPayload,
): Promise<MaterialListItem> {
  return apiClient.patch(`/materials/${id}`, payload).then((r) => r.data);
}

/** Удаление каскадом снимает остатки и историю движений материала. */
export function deleteMaterial(id: string): Promise<void> {
  return apiClient.delete(`/materials/${id}`).then(() => undefined);
}

/**
 * Остатки по объектам. `onlyLow` уходит ТОЛЬКО значением `true` и только когда
 * фильтр включён: в `StocksQueryDto` стоит `@Type(() => Boolean)`, а
 * `Boolean('false') === true` — то есть `onlyLow=false` в query-строке включил бы
 * фильтр «ниже порога» вместо того, чтобы его выключить.
 */
export function listStocks(
  query: StocksQuery = {},
): Promise<{ items: StockView[]; total: number }> {
  return apiClient
    .get('/materials/stocks', {
      params: {
        ...(query.objectId ? { objectId: query.objectId } : {}),
        ...(query.onlyLow ? { onlyLow: true } : {}),
      },
    })
    .then((r) => r.data);
}

/**
 * Движение материала: `IN`/`TRANSFER` увеличивают остаток, `OUT`/`WRITE_OFF`
 * уменьшают. Попытка уйти в минус → **400** с текстом «Недостаточно материала…»:
 * ошибку показываем пользователю, а не глотаем (см. `MovementModal`).
 */
export function createMovement(payload: CreateMovementPayload): Promise<CreateMovementResult> {
  return apiClient.post('/materials/movements', payload).then((r) => r.data);
}

/** История одного материала: только `limit` (≤ 500), пагинации `skip` в API нет. */
export function listMovements(
  materialId: string,
  query: ListMovementsQuery = {},
): Promise<ListMovementsResult> {
  return apiClient.get(`/materials/${materialId}/movements`, { params: query }).then((r) => r.data);
}

/** Отчёт по расходу: агрегаты `OUT`/`WRITE_OFF` + итог по стоимости. */
export function getConsumptionReport(query: ReportQuery = {}): Promise<ConsumptionReport> {
  return apiClient.get('/materials/report', { params: query }).then((r) => r.data);
}
