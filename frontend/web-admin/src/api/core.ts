import { apiClient } from './client';
import type {
  CreateFloorPayload,
  CreateObjectPayload,
  CreateOperationPayload,
  CreateRoomPayload,
  FloorDetail,
  FloorEntity,
  ObjectDetail,
  ObjectEntity,
  Paginated,
  PageQuery,
  RoomEntity,
  RouteDetail,
  RouteEntity,
  RoutePointEntity,
  RouteWithPoints,
  TechCardDetail,
  TechCardEntity,
  TechCardListItem,
  TechOperationEntity,
  TechOperationWithMaterials,
  UpdateFloorPayload,
  UpdateObjectPayload,
  UpdateOperationPayload,
  UpdateRoomPayload,
} from '../types/core';

/**
 * Клиент core-service (:3003 через прокси). Один модуль на весь домен ядра:
 * страницы не собирают URL сами — иначе путь вида
 * `/objects/${id}/floors` размножился бы по компонентам и разошёлся с бэкендом.
 */

// ── Объекты ────────────────────────────────────────────────────────────────

export interface ListObjectsQuery extends PageQuery {
  status?: string;
  type?: string;
  search?: string;
}

export function listObjects(query: ListObjectsQuery = {}): Promise<Paginated<ObjectEntity>> {
  return apiClient.get('/objects', { params: query }).then((r) => r.data);
}

export function getObject(id: string): Promise<ObjectEntity> {
  return apiClient.get(`/objects/${id}`).then((r) => r.data);
}

/** Объект с этажами, помещениями и маршрутами — для карточки объекта. */
export function getObjectDetail(id: string): Promise<ObjectDetail> {
  return apiClient.get(`/objects/${id}/detail`).then((r) => r.data);
}

export function createObject(payload: CreateObjectPayload): Promise<ObjectEntity> {
  return apiClient.post('/objects', payload).then((r) => r.data);
}

export function updateObject(id: string, payload: UpdateObjectPayload): Promise<ObjectEntity> {
  return apiClient.patch(`/objects/${id}`, payload).then((r) => r.data);
}

/** Удаление доступно только для объекта без активных маршрутов (иначе 400). */
export function deleteObject(id: string): Promise<void> {
  return apiClient.delete(`/objects/${id}`).then(() => undefined);
}

// ── Этажи ──────────────────────────────────────────────────────────────────

export function listFloors(objectId: string): Promise<FloorEntity[]> {
  return apiClient.get(`/objects/${objectId}/floors`).then((r) => r.data);
}

export function createFloor(objectId: string, payload: CreateFloorPayload): Promise<FloorEntity> {
  return apiClient.post(`/objects/${objectId}/floors`, payload).then((r) => r.data);
}

export function getFloor(id: string): Promise<FloorEntity> {
  return apiClient.get(`/floors/${id}`).then((r) => r.data);
}

/** Этаж с помещениями и маршрутами — данные экрана плана. */
export function getFloorDetail(id: string): Promise<FloorDetail> {
  return apiClient.get(`/floors/${id}/detail`).then((r) => r.data);
}

export function updateFloor(id: string, payload: UpdateFloorPayload): Promise<FloorEntity> {
  return apiClient.patch(`/floors/${id}`, payload).then((r) => r.data);
}

export function deleteFloor(id: string): Promise<void> {
  return apiClient.delete(`/floors/${id}`).then(() => undefined);
}

/**
 * Загрузка плана этажа. Файл уходит в file-service руками core-service: тот
 * пробрасывает наш токен, поэтому отдельный запрос к :3002 здесь не нужен.
 * Поле обязательно называется `file` — так задано в FileInterceptor бэкенда.
 */
export function uploadFloorPlan(
  floorId: string,
  file: File,
  planScale?: number,
): Promise<FloorEntity> {
  const form = new FormData();
  form.append('file', file);
  if (planScale !== undefined) {
    form.append('planScale', String(planScale));
  }
  return apiClient.post(`/floors/${floorId}/plan`, form).then((r) => r.data);
}

/** Привязка уже загруженного плана по URL (альтернатива multipart-загрузке). */
export function attachFloorPlanUrl(
  floorId: string,
  planImageUrl: string,
  planScale?: number,
): Promise<FloorEntity> {
  return apiClient
    .post(`/floors/${floorId}/plan-url`, { planImageUrl, planScale })
    .then((r) => r.data);
}

// ── Помещения ──────────────────────────────────────────────────────────────

export function listRooms(floorId: string): Promise<RoomEntity[]> {
  return apiClient.get(`/floors/${floorId}/rooms`).then((r) => r.data);
}

export function createRoom(floorId: string, payload: CreateRoomPayload): Promise<RoomEntity> {
  return apiClient.post(`/floors/${floorId}/rooms`, payload).then((r) => r.data);
}

export function getRoom(id: string): Promise<RoomEntity> {
  return apiClient.get(`/rooms/${id}`).then((r) => r.data);
}

export function updateRoom(id: string, payload: UpdateRoomPayload): Promise<RoomEntity> {
  return apiClient.patch(`/rooms/${id}`, payload).then((r) => r.data);
}

export function deleteRoom(id: string): Promise<void> {
  return apiClient.delete(`/rooms/${id}`).then(() => undefined);
}

// ── Маршруты ───────────────────────────────────────────────────────────────

export function listRoutes(floorId: string): Promise<RouteWithPoints[]> {
  return apiClient.get(`/floors/${floorId}/routes`).then((r) => r.data);
}

export function createRoute(floorId: string, name: string): Promise<RouteEntity> {
  return apiClient.post(`/floors/${floorId}/routes`, { name }).then((r) => r.data);
}

export function getRoute(id: string): Promise<RouteDetail> {
  return apiClient.get(`/routes/${id}`).then((r) => r.data);
}

export function updateRoute(
  id: string,
  payload: { name?: string; status?: string },
): Promise<RouteEntity> {
  return apiClient.patch(`/routes/${id}`, payload).then((r) => r.data);
}

export function deleteRoute(id: string): Promise<void> {
  return apiClient.delete(`/routes/${id}`).then(() => undefined);
}

export function addRoutePoint(
  routeId: string,
  roomId: string,
  estimatedTimeMin?: number,
): Promise<RoutePointEntity> {
  return apiClient.post(`/routes/${routeId}/points`, { roomId, estimatedTimeMin }).then((r) => r.data);
}

/**
 * Переупорядочивание: передаётся ПОЛНЫЙ список id — частичный бэкенд отвергает.
 * Ответ — новый порядок точек, без подтянутых помещений: страница перезапрашивает
 * `getRoute`, чтобы не собирать состояние из двух источников.
 */
export function reorderRoutePoints(
  routeId: string,
  pointIds: string[],
): Promise<{ points: RoutePointEntity[] }> {
  return apiClient.patch(`/routes/${routeId}/reorder`, { pointIds }).then((r) => r.data);
}

export function updateRoutePoint(
  pointId: string,
  estimatedTimeMin: number,
): Promise<RoutePointEntity> {
  return apiClient.patch(`/route-points/${pointId}`, { estimatedTimeMin }).then((r) => r.data);
}

export function deleteRoutePoint(pointId: string): Promise<void> {
  return apiClient.delete(`/route-points/${pointId}`).then(() => undefined);
}

// ── Техкарты ───────────────────────────────────────────────────────────────

export interface ListTechCardsQuery extends PageQuery {
  search?: string;
}

export function listTechCards(query: ListTechCardsQuery = {}): Promise<Paginated<TechCardListItem>> {
  return apiClient.get('/tech-cards', { params: query }).then((r) => r.data);
}

export function getTechCard(id: string): Promise<TechCardDetail> {
  return apiClient.get(`/tech-cards/${id}`).then((r) => r.data);
}

export function createTechCard(name: string): Promise<TechCardEntity> {
  return apiClient.post('/tech-cards', { name }).then((r) => r.data);
}

export function updateTechCard(id: string, name: string): Promise<TechCardEntity> {
  return apiClient.patch(`/tech-cards/${id}`, { name }).then((r) => r.data);
}

export function deleteTechCard(id: string): Promise<void> {
  return apiClient.delete(`/tech-cards/${id}`).then(() => undefined);
}

/** Создание операции отдаёт саму операцию без материалов — материалы в `getTechCard`. */
export function addOperation(
  techCardId: string,
  payload: CreateOperationPayload,
): Promise<TechOperationEntity> {
  return apiClient.post(`/tech-cards/${techCardId}/operations`, payload).then((r) => r.data);
}

/** Полная замена списка материалов операции (передаётся вместе с остальными полями). */
export function updateOperation(
  operationId: string,
  payload: UpdateOperationPayload,
): Promise<TechOperationWithMaterials> {
  return apiClient.patch(`/tech-operations/${operationId}`, payload).then((r) => r.data);
}

export function deleteOperation(operationId: string): Promise<void> {
  return apiClient.delete(`/tech-operations/${operationId}`).then(() => undefined);
}

/** Симметрично reorder точек маршрута: полный список id в новом порядке. */
export function reorderOperations(
  techCardId: string,
  operationIds: string[],
): Promise<TechOperationEntity[]> {
  return apiClient.patch(`/tech-cards/${techCardId}/reorder`, { operationIds }).then((r) => r.data);
}

/** Сумма времени операций — тем же правилом, что и `totalEstimatedTimeMin` на бэкенде. */
export function sumOperationTime(operations: Array<{ estimatedTimeMin: number }>): number {
  return operations.reduce((sum, op) => sum + op.estimatedTimeMin, 0);
}
