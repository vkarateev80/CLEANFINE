import { execFileSync } from 'node:child_process';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { authHeader, loginAs, type Role } from './core';
import { expectStatus, operationsTracker, sqlAvailable, type ApiOptions } from './operations';

/**
 * Хелперы планирования и учёта М4.7: schedule-service и material-service.
 *
 * Границы сервисов (по абсолютным адресам, как core-набор М2.9 и «оперативка» М3.8):
 *  - auth-service      (E2E_API_URL,          :3001) — access-токены;
 *  - schedule-service  (E2E_SCHEDULE_URL,     :3008) — графики, смены, check-in/out;
 *  - material-service  (E2E_MATERIALS_URL,    :3007) — справочник, склад, движения, отчёт.
 *
 * ПОЧЕМУ уборка идёт SQL-ом, хотя у обоих сервисов есть DELETE.
 * У графиков и материалов DELETE есть, но он не покрывает всё, что создаёт набор:
 *  - `ConsumedOperation` (идемпотентность автосписания) — служебная таблица без API и
 *    БЕЗ внешнего ключа на `Material` (`materialId`/`ticketId` — строки чужих сервисов),
 *    поэтому удаление материала её НЕ каскадит: без явного DELETE строки оставались бы
 *    на стенде после каждого прогона (проверено на стенде — см. отчёт М4.7);
 *  - смены графика удобнее снимать пачкой по id, не полагаясь на каскад Prisma.
 * Поэтому набор помнит созданные id (трекер) и сносит РОВНО свои строки через
 * `docker exec cleaning-ops-postgres psql` — тот же приём, что в `helpers/operations.ts`.
 *
 * Если docker недоступен (`sqlAvailable()` === false), уборка не выполняется: спека
 * проверки чистоты честно скипается, а не «зеленеет» на грязных данных.
 */

export const SCHEDULE_URL = process.env.E2E_SCHEDULE_URL ?? 'http://localhost:3008';
export const MATERIALS_URL = process.env.E2E_MATERIALS_URL ?? 'http://localhost:3007';

/** Контейнер и базы стенда для точечной уборки М4. */
const POSTGRES_CONTAINER = process.env.E2E_POSTGRES_CONTAINER ?? 'cleaning-ops-postgres';
const POSTGRES_USER = process.env.E2E_POSTGRES_USER ?? 'admin';
const DB = {
  schedule: process.env.E2E_SCHEDULE_DB ?? 'cleaning_ops_schedule',
  materials: process.env.E2E_MATERIALS_DB ?? 'cleaning_ops_materials',
} as const;

/** Идентификатор автора автосписания (`MaterialConsumptionService.SYSTEM_USER_ID`). */
export const AUTO_CONSUMPTION_USER_ID = 'system:auto-consumption';

// ---------------------------------------------------------------------------
// Обёртки запросов
// ---------------------------------------------------------------------------

/** Запрос к schedule-service (по умолчанию ADMIN — он умеет и генерацию, и графики). */
export function scheduleApi(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return authorized(request, SCHEDULE_URL, method, path, options);
}

/** Запрос к material-service (по умолчанию ADMIN). */
export function materialsApi(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return authorized(request, MATERIALS_URL, method, path, options);
}

async function authorized(
  request: APIRequestContext,
  baseUrl: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions,
): Promise<APIResponse> {
  const token = options.token ?? (await loginAs(request, options.role ?? 'ADMIN'));
  return request[method](`${baseUrl}${path}`, {
    headers: authHeader(token),
    ...(options.data !== undefined ? { data: options.data } : {}),
  });
}

// ---------------------------------------------------------------------------
// Типы schedule-service (backend/schedule-service/src/schedule)
// ---------------------------------------------------------------------------

export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface RecurrenceRule {
  frequency: Frequency;
  /** Дни недели для weekly: 1 = Пн … 7 = Вс (ISO). */
  days?: number[];
  dayOfMonth?: number;
  /** Время начала смены "HH:mm" в UTC. */
  time: string;
}

export interface Schedule {
  id: string;
  objectId: string | null;
  routeId: string | null;
  name: string;
  recurrence: RecurrenceRule;
  assignees: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleEventStatus = 'PLANNED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'MISSED';

/** Смена в ответах `/events`, `/my`, `/events/:id` (плоское представление). */
export interface ScheduleEventView {
  id: string;
  scheduleId: string;
  scheduleName: string;
  objectId: string | null;
  routeId: string | null;
  /** День смены "YYYY-MM-DD" (UTC). */
  date: string;
  plannedStart: string;
  status: ScheduleEventStatus;
  userId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  ticketId: string | null;
  checkOutReason: string | null;
}

/** Сводка `POST /api/schedule/generate` (GenerationResult). */
export interface GenerationResult {
  date: string;
  schedulesMatched: number;
  shiftsCreated: number;
  shiftsSkipped: number;
  ticketsCreated: number;
  ticketsFailed: number;
  ticketsBackfilled: number;
  ticketServiceUnavailable: boolean;
  errors: string[];
}

/** Сводка `POST /api/schedule/check-missed`. */
export interface MissedScanSummary {
  missed: { scanned: number; missed: number; eventIds: string[] };
  autoCheckout: { closed: number; eventIds: string[] };
}

/** День "YYYY-MM-DD" в UTC: планирование живёт в UTC, локальная зона процесса не важна. */
export function utcDate(offsetDays = 0, now: Date = new Date()): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
  return date.toISOString().slice(0, 10);
}

/**
 * Время "HH:mm" в UTC, которое ГАРАНТИРОВАННО уже прошло сегодня.
 *
 * Зачем: неявка (`PLANNED` + прошедший `plannedStart`) проверяется по факту времени, а
 * фиксированное «00:00» сломалось бы на прогоне ровно в полночь. Час берём на один
 * меньше текущего UTC-часа, а на нулевом часе — «00:00» (полночь уже наступила).
 */
export function pastUtcTime(now: Date = new Date()): string {
  const hour = Math.max(0, now.getUTCHours() - 1);
  return `${String(hour).padStart(2, '0')}:00`;
}

// ---------------------------------------------------------------------------
// DTO-хелперы schedule-service
// ---------------------------------------------------------------------------

export interface CreateScheduleInput {
  objectId?: string;
  routeId?: string;
  name?: string;
  recurrence: RecurrenceRule;
  assignees: string[];
  isActive?: boolean;
  role?: Role;
  token?: string;
}

/** POST /api/schedule (ADMIN, SUPERVISOR) — возвращает ответ как есть (для 400/403). */
export function postSchedule(
  request: APIRequestContext,
  input: CreateScheduleInput,
): Promise<APIResponse> {
  return scheduleApi(request, 'post', '/api/schedule', {
    role: input.role,
    token: input.token,
    data: {
      ...(input.objectId !== undefined ? { objectId: input.objectId } : {}),
      ...(input.routeId !== undefined ? { routeId: input.routeId } : {}),
      name: input.name ?? `E2E график ${Date.now()}`,
      recurrence: input.recurrence,
      assignees: input.assignees,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

/** POST /api/schedule с проверкой 201. */
export async function createSchedule(
  request: APIRequestContext,
  input: CreateScheduleInput,
): Promise<Schedule> {
  const res = await postSchedule(request, input);
  await expectStatus(res, 201, 'создание графика');
  return (await res.json()) as Schedule;
}

/** Создаёт график и сразу ставит его на уборку. */
export async function trackSchedule(
  request: APIRequestContext,
  input: CreateScheduleInput,
): Promise<Schedule> {
  const schedule = await createSchedule(request, input);
  planningTracker.schedule(schedule.id);
  if (schedule.objectId) {
    // objectId графика — область уборки плановых заявок в ticket-service: генерация
    // создаёт заявку от имени schedule-service, и её id у теста не появляется. Уборка
    // «по объекту» (operationsTracker) сносит такие заявки, даже если смена с ticketId
    // уже удалена каскадом; без этого заявка осиротела бы на стенде.
    operationsTracker.object(schedule.objectId);
  }
  return schedule;
}

/** GET /api/schedule — список графиков с числом смен. */
export async function listSchedules(
  request: APIRequestContext,
  options: ApiOptions = {},
): Promise<Array<Schedule & { eventsCount: number }>> {
  const res = await scheduleApi(request, 'get', '/api/schedule', options);
  await expectStatus(res, 200, 'список графиков');
  return (await res.json()) as Array<Schedule & { eventsCount: number }>;
}

/** GET /api/schedule/:id — график по id (возвращает ответ как есть для 404). */
export function getSchedule(
  request: APIRequestContext,
  id: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return scheduleApi(request, 'get', `/api/schedule/${id}`, options);
}

/** DELETE /api/schedule/:id — каскадом уносит смены; 404 на уже удалённый безвреден. */
export async function deleteSchedule(
  request: APIRequestContext,
  id: string,
  options: ApiOptions = {},
): Promise<void> {
  const res = await scheduleApi(request, 'delete', `/api/schedule/${id}`, options);
  expect([200, 404], `удаление графика ${id}: ${await res.text()}`).toContain(res.status());
}

/**
 * Непустые параметры запроса в query-строку: `undefined`/пустая строка — «параметра нет».
 * Нужно для ручных триггеров, у которых «без параметров» — самостоятельное поведение
 * (проход по всем сменам), а не пустая область.
 */
function queryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, value);
  }
  return params.toString() ? `?${params.toString()}` : '';
}

/** POST /api/schedule/generate — детерминированный триггер (ADMIN). */
export function postGenerate(
  request: APIRequestContext,
  date?: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return scheduleApi(request, 'post', `/api/schedule/generate${queryString({ date })}`, {
    role: options.role ?? 'ADMIN',
    token: options.token,
  });
}

/**
 * POST /api/schedule/generate?scheduleId= — проход ровно по одному графику (задача A2).
 * Несуществующий график → 404, а не «успех с нулями».
 */
export function postGenerateScoped(
  request: APIRequestContext,
  scope: { date?: string; scheduleId: string },
  options: ApiOptions = {},
): Promise<APIResponse> {
  return scheduleApi(
    request,
    'post',
    `/api/schedule/generate${queryString({ date: scope.date, scheduleId: scope.scheduleId })}`,
    { role: options.role ?? 'ADMIN', token: options.token },
  );
}

/** POST /api/schedule/generate с проверкой 201. */
export async function generateForDate(
  request: APIRequestContext,
  date: string,
  options: ApiOptions = {},
): Promise<GenerationResult> {
  const res = await postGenerate(request, date, options);
  await expectStatus(res, 201, `генерация смен на ${date}`);
  return (await res.json()) as GenerationResult;
}

/** GET /api/schedule/events?date=&objectId=&userId= — смены дня с фильтрами. */
export async function listScheduleEvents(
  request: APIRequestContext,
  query: { date?: string; objectId?: string; userId?: string } = {},
  options: ApiOptions = {},
): Promise<ScheduleEventView[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await scheduleApi(request, 'get', `/api/schedule/events${suffix}`, options);
  await expectStatus(res, 200, 'смены дня');
  return (await res.json()) as ScheduleEventView[];
}

/** GET /api/schedule/events/:id — смена по id (ответ как есть для 404). */
export function getScheduleEvent(
  request: APIRequestContext,
  id: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return scheduleApi(request, 'get', `/api/schedule/events/${id}`, options);
}

/** POST /api/schedule/check-in — ответ как есть: важен и 201, и 403/404. */
export function checkIn(
  request: APIRequestContext,
  input: { scheduleId: string; lat: number; lng: number; role?: Role; token?: string },
): Promise<APIResponse> {
  return scheduleApi(request, 'post', '/api/schedule/check-in', {
    role: input.role,
    token: input.token,
    data: { scheduleId: input.scheduleId, lat: input.lat, lng: input.lng },
  });
}

/** POST /api/schedule/check-in с проверкой 201. */
export async function checkInOrFail(
  request: APIRequestContext,
  input: { scheduleId: string; lat: number; lng: number; role?: Role; token?: string },
): Promise<ScheduleEventView> {
  const res = await checkIn(request, input);
  await expectStatus(res, 201, 'check-in');
  return (await res.json()) as ScheduleEventView;
}

/** POST /api/schedule/check-out — ответ как есть. */
export function checkOut(
  request: APIRequestContext,
  input: { scheduleId: string; lat?: number; lng?: number; role?: Role; token?: string },
): Promise<APIResponse> {
  return scheduleApi(request, 'post', '/api/schedule/check-out', {
    role: input.role,
    token: input.token,
    data: {
      scheduleId: input.scheduleId,
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
    },
  });
}

/** POST /api/schedule/check-out с проверкой 201. */
export async function checkOutOrFail(
  request: APIRequestContext,
  input: { scheduleId: string; lat?: number; lng?: number; role?: Role; token?: string },
): Promise<ScheduleEventView> {
  const res = await checkOut(request, input);
  await expectStatus(res, 201, 'check-out');
  return (await res.json()) as ScheduleEventView;
}

/** Область ручного прохода «проверка неявок»: eventId приоритетнее scheduleId и date. */
export interface ScheduleSweepScope {
  date?: string;
  scheduleId?: string;
  eventId?: string;
}

/**
 * POST /api/schedule/check-missed с областью прохода (ADMIN).
 *
 * Пустая область — прежнее поведение: проход по всем сменам. `scheduleId` сужает проход
 * сменами одного графика, `eventId` — ровно одной сменой; несуществующий id → 404.
 */
export function postCheckMissedScoped(
  request: APIRequestContext,
  scope: ScheduleSweepScope = {},
  options: ApiOptions = {},
): Promise<APIResponse> {
  return scheduleApi(request, 'post', `/api/schedule/check-missed${queryString({ ...scope })}`, {
    role: options.role ?? 'ADMIN',
    token: options.token,
  });
}

/** POST /api/schedule/check-missed?date= — ручной прогон проверки неявок (ADMIN). */
export function postCheckMissed(
  request: APIRequestContext,
  date?: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return postCheckMissedScoped(request, { date }, options);
}

/** POST /api/schedule/check-missed с проверкой 201. */
export async function checkMissed(
  request: APIRequestContext,
  date: string,
  options: ApiOptions = {},
): Promise<MissedScanSummary> {
  const res = await postCheckMissed(request, date, options);
  await expectStatus(res, 201, `проверка неявок на ${date}`);
  return (await res.json()) as MissedScanSummary;
}

// ---------------------------------------------------------------------------
// Типы material-service (backend/material-service/src/materials)
// ---------------------------------------------------------------------------

export const MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'WRITE_OFF'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface Material {
  id: string;
  name: string;
  unit: string;
  defaultConsumption: number;
  minStockThreshold: number;
  costPerUnit: number;
  supplier: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Строка склада из `GET /api/materials/stocks` (`StockView`). */
export interface StockView {
  materialId: string;
  objectId: string;
  quantity: number;
  minStockThreshold: number;
  belowThreshold: boolean;
  updatedAt: string;
  material: { id: string; name: string; unit: string; costPerUnit: number };
}

export interface MaterialMovement {
  id: string;
  materialId: string;
  objectId: string;
  type: MovementType;
  quantity: number;
  ticketId: string | null;
  userId: string;
  targetObjectId: string | null;
  createdAt: string;
}

export interface CreateMovementResult {
  movement: MaterialMovement;
  stocks: Array<{ objectId: string; quantity: number }>;
}

export interface ConsumptionReport {
  objectId: string | null;
  from: string | null;
  to: string | null;
  rows: Array<{
    materialId: string;
    name: string;
    unit: string;
    costPerUnit: number;
    consumedQuantity: number;
    operationsCount: number;
    cost: number;
  }>;
  totals: { consumedQuantity: number; operationsCount: number; cost: number };
}

// ---------------------------------------------------------------------------
// DTO-хелперы material-service
// ---------------------------------------------------------------------------

export interface CreateMaterialInput {
  name?: string;
  unit?: string;
  defaultConsumption?: number | string;
  minStockThreshold?: number | string;
  costPerUnit?: number | string;
  supplier?: string;
  role?: Role;
  token?: string;
}

/** POST /api/materials — ответ как есть (нужны и 201, и 400). */
export function postMaterial(
  request: APIRequestContext,
  input: CreateMaterialInput = {},
): Promise<APIResponse> {
  return materialsApi(request, 'post', '/api/materials', {
    role: input.role,
    token: input.token,
    data: {
      name: input.name ?? `E2E материал ${Date.now()}`,
      unit: input.unit ?? 'л',
      defaultConsumption: input.defaultConsumption ?? 0.5,
      minStockThreshold: input.minStockThreshold ?? 5,
      costPerUnit: input.costPerUnit ?? 100,
      ...(input.supplier !== undefined ? { supplier: input.supplier } : {}),
    },
  });
}

/** POST /api/materials с проверкой 201. */
export async function createMaterial(
  request: APIRequestContext,
  input: CreateMaterialInput = {},
): Promise<Material> {
  const res = await postMaterial(request, input);
  await expectStatus(res, 201, 'создание материала');
  return (await res.json()) as Material;
}

/** Создаёт материал и сразу ставит его на уборку (вместе с движениями и остатками). */
export async function trackMaterial(
  request: APIRequestContext,
  input: CreateMaterialInput = {},
): Promise<Material> {
  const material = await createMaterial(request, input);
  planningTracker.material(material.id);
  return material;
}

/** GET /api/materials — справочник с поиском и пагинацией. */
export async function listMaterials(
  request: APIRequestContext,
  query: { skip?: number; take?: number; search?: string } = {},
  options: ApiOptions = {},
): Promise<{ items: Array<Material & { _count: { stocks: number; movements: number } }>; total: number }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await materialsApi(request, 'get', `/api/materials${suffix}`, options);
  await expectStatus(res, 200, 'список материалов');
  return await res.json();
}

/** GET /api/materials/:id — материал с остатками (ответ как есть для 404). */
export function getMaterial(
  request: APIRequestContext,
  id: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return materialsApi(request, 'get', `/api/materials/${id}`, options);
}

/** PATCH /api/materials/:id (ADMIN, SUPERVISOR). */
export async function updateMaterial(
  request: APIRequestContext,
  id: string,
  data: Record<string, unknown>,
  options: ApiOptions = {},
): Promise<Material> {
  const res = await materialsApi(request, 'patch', `/api/materials/${id}`, { ...options, data });
  await expectStatus(res, 200, 'правка материала');
  return (await res.json()) as Material;
}

/** DELETE /api/materials/:id — 204; 404 на уже удалённый безвреден. */
export async function deleteMaterial(
  request: APIRequestContext,
  id: string,
  options: ApiOptions = {},
): Promise<void> {
  const res = await materialsApi(request, 'delete', `/api/materials/${id}`, options);
  expect([204, 404], `удаление материала ${id}: ${await res.text()}`).toContain(res.status());
}

/** GET /api/materials/stocks — остатки (objectId, onlyLow). */
export async function listStocks(
  request: APIRequestContext,
  query: { objectId?: string; onlyLow?: boolean } = {},
  options: ApiOptions = {},
): Promise<{ items: StockView[]; total: number }> {
  const params = new URLSearchParams();
  if (query.objectId !== undefined) params.set('objectId', query.objectId);
  if (query.onlyLow === true) params.set('onlyLow', 'true');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await materialsApi(request, 'get', `/api/materials/stocks${suffix}`, options);
  await expectStatus(res, 200, 'остатки материалов');
  return await res.json();
}

/** Остаток конкретной пары (материал, объект); null — движения по паре ещё не было. */
export async function findStock(
  request: APIRequestContext,
  materialId: string,
  objectId: string,
  options: ApiOptions = {},
): Promise<StockView | null> {
  const stocks = await listStocks(request, { objectId }, options);
  return stocks.items.find((item) => item.materialId === materialId) ?? null;
}

/** POST /api/materials/movements — ответ как есть (нужны и 201, и 400). */
export function postMovement(
  request: APIRequestContext,
  input: {
    materialId: string;
    objectId: string;
    type: MovementType;
    quantity: number;
    targetObjectId?: string;
    ticketId?: string;
    role?: Role;
    token?: string;
  },
): Promise<APIResponse> {
  return materialsApi(request, 'post', '/api/materials/movements', {
    role: input.role,
    token: input.token,
    data: {
      materialId: input.materialId,
      objectId: input.objectId,
      type: input.type,
      quantity: input.quantity,
      ...(input.targetObjectId !== undefined ? { targetObjectId: input.targetObjectId } : {}),
      ...(input.ticketId !== undefined ? { ticketId: input.ticketId } : {}),
    },
  });
}

/** Движение с проверкой 201. */
export async function createMovement(
  request: APIRequestContext,
  input: Parameters<typeof postMovement>[1],
): Promise<CreateMovementResult> {
  const res = await postMovement(request, input);
  await expectStatus(res, 201, `движение ${input.type}`);
  return (await res.json()) as CreateMovementResult;
}

/** GET /api/materials/:id/movements — история движений материала. */
export async function listMovements(
  request: APIRequestContext,
  materialId: string,
  query: { objectId?: string; from?: string; to?: string; limit?: number } = {},
  options: ApiOptions = {},
): Promise<{ items: MaterialMovement[]; total: number }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await materialsApi(
    request,
    'get',
    `/api/materials/${materialId}/movements${suffix}`,
    options,
  );
  await expectStatus(res, 200, 'история движений');
  return await res.json();
}

/** GET /api/materials/report — агрегат расхода OUT+WRITE_OFF и стоимость. */
export async function getReport(
  request: APIRequestContext,
  query: { objectId?: string; from?: string; to?: string } = {},
  options: ApiOptions = {},
): Promise<ConsumptionReport> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await materialsApi(request, 'get', `/api/materials/report${suffix}`, options);
  await expectStatus(res, 200, 'отчёт по расходу');
  return (await res.json()) as ConsumptionReport;
}

/**
 * Ждёт появление движения автосписания по заявке (RabbitMQ → консьюмер — асинхронно).
 * Никаких фиксированных sleep: только опрос с таймаутом и понятной ошибкой.
 */
export async function waitForAutoConsumption(
  request: APIRequestContext,
  input: { materialId: string; objectId: string; ticketId: string; timeout?: number },
): Promise<MaterialMovement> {
  const timeout = input.timeout ?? 20_000;
  const deadline = Date.now() + timeout;
  let seen: MaterialMovement[] = [];

  while (Date.now() < deadline) {
    const page = await listMovements(request, input.materialId, { objectId: input.objectId });
    seen = page.items.filter(
      (movement) =>
        movement.userId === AUTO_CONSUMPTION_USER_ID && movement.ticketId === input.ticketId,
    );
    if (seen.length > 0) return seen[0];
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Автосписание по заявке ${input.ticketId} не появилось за ${timeout} мс ` +
      `(движений по материалу ${input.materialId}: ${seen.length})`,
  );
}

// ---------------------------------------------------------------------------
// SQL: уборка и счётчики
// ---------------------------------------------------------------------------

/** psql в базе сервиса; `-t -A` — только значение, без заголовков и рамок. */
function psql(database: string, statement: string): string {
  const raw = execFileSync(
    'docker',
    [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-c',
      statement,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // На Windows psql печатает CRLF — убираем, чтобы значения сравнивались строго.
  return raw.replace(/\r/g, '').trim();
}

/** Значение для SQL-литерала: строка в одинарных кавычках, число — как есть. */
function literal(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Недопустимое число для SQL');
    return String(value);
  }
  if (!/^[0-9a-zA-Z_.:@+\- ]*$/.test(value)) {
    throw new Error(`Недопустимое значение для SQL-литерала: ${value}`);
  }
  return `'${value}'`;
}

/** Первое слово ответа (`3` из `SELECT COUNT(*)`, `DELETE 3` → `3`). */
function scalar(output: string): number {
  const match = /^\s*(\d+)/.exec(output);
  return match ? Number(match[1]) : 0;
}

/** `id IN ('a', 'b')`; пустой список → NULL (условие всегда ложно, DELETE безвреден). */
function idList(ids: string[]): string {
  return ids.length > 0 ? ids.map(literal).join(', ') : 'NULL';
}

/**
 * Счётчики строк прогона по таблицам М4. Возвращает и «до», и «после» уборки:
 * тест чистоты обязан сначала доказать, что строки есть, иначе ноль «после» ничего не значит.
 */
export function planningCounts(input: { scheduleIds?: string[]; materialIds?: string[] }): {
  schedules: number;
  events: number;
  materials: number;
  stocks: number;
  movements: number;
  consumed: number;
} {
  const empty = { schedules: 0, events: 0, materials: 0, stocks: 0, movements: 0, consumed: 0 };
  if (!sqlAvailable()) return empty;

  const schedules = [...(input.scheduleIds ?? [])];
  const materials = [...(input.materialIds ?? [])];
  const scheduleList = idList(schedules);
  const materialList = idList(materials);

  return {
    schedules: scalar(psql(DB.schedule, `SELECT COUNT(*) FROM "Schedule" WHERE id IN (${scheduleList})`)),
    events: scalar(
      psql(DB.schedule, `SELECT COUNT(*) FROM "ScheduleEvent" WHERE "scheduleId" IN (${scheduleList})`),
    ),
    materials: scalar(psql(DB.materials, `SELECT COUNT(*) FROM "Material" WHERE id IN (${materialList})`)),
    stocks: scalar(
      psql(DB.materials, `SELECT COUNT(*) FROM "MaterialStock" WHERE "materialId" IN (${materialList})`),
    ),
    movements: scalar(
      psql(DB.materials, `SELECT COUNT(*) FROM "MaterialMovement" WHERE "materialId" IN (${materialList})`),
    ),
    // Служебная таблица идемпотентности автосписания: FK на Material нет, каскад её не уносит.
    consumed: scalar(
      psql(DB.materials, `SELECT COUNT(*) FROM "ConsumedOperation" WHERE "materialId" IN (${materialList})`),
    ),
  };
}

/**
 * Точечная уборка данных М4: смены и графики, а также материалы со остатками,
 * историей движений и записями идемпотентности автосписания.
 *
 * Материал удаляется ПОСЛЕ `ConsumedOperation`: у неё нет внешнего ключа, поэтому
 * порядок не важен для БД, но так в выводе видно, что служебные строки тоже сняты.
 * Заявки и уведомления снимает `operationsTracker` (helpers/operations.ts) — здесь
 * только то, чего он не знает.
 */
export function cleanupPlanningData(input: {
  scheduleIds?: Iterable<string>;
  materialIds?: Iterable<string>;
}): void {
  if (!sqlAvailable()) return;

  const scheduleIds = [...(input.scheduleIds ?? [])];
  const materialIds = [...(input.materialIds ?? [])];

  if (scheduleIds.length > 0) {
    const list = idList(scheduleIds);
    psql(DB.schedule, `DELETE FROM "ScheduleEvent" WHERE "scheduleId" IN (${list})`);
    psql(DB.schedule, `DELETE FROM "Schedule" WHERE id IN (${list})`);
  }

  if (materialIds.length > 0) {
    const list = idList(materialIds);
    psql(DB.materials, `DELETE FROM "ConsumedOperation" WHERE "materialId" IN (${list})`);
    // Остатки и движения уходят каскадом (onDelete: Cascade в схеме Prisma).
    psql(DB.materials, `DELETE FROM "Material" WHERE id IN (${list})`);
  }
}

// ---------------------------------------------------------------------------
// Трекер созданного
// ---------------------------------------------------------------------------

/**
 * Трекер живёт в `globalThis`, а не в переменной модуля, по той же причине, что и
 * `operationsTracker`: Playwright грузит скомпилированный spec и его helpers двумя
 * путями импорта, и модуль инстанциируется дважды — состояние обязано быть одним.
 */
const TRACKER_SLOT = Symbol.for('cleaning-ops.e2e.planningTracker');

class PlanningTracker {
  private readonly scheduleIds = new Set<string>();
  private readonly materialIds = new Set<string>();

  schedule(id: string): void {
    this.scheduleIds.add(id);
  }

  material(id: string): void {
    this.materialIds.add(id);
  }

  /** Снимок id для SQL-проверок «до/после» уборки. */
  ids(): { scheduleIds: string[]; materialIds: string[] } {
    return { scheduleIds: [...this.scheduleIds], materialIds: [...this.materialIds] };
  }

  /** Сносит накопленное; ошибка одного DELETE не мешает остальным. */
  flush(): void {
    if (!sqlAvailable()) return;
    const ids = this.ids();

    const safe = (label: string, run: () => void): void => {
      try {
        run();
      } catch (error) {
        console.warn(
          `[planning] уборка «${label}» не удалась: ${
            error instanceof Error ? error.message.split('\n')[0] : String(error)
          }`,
        );
      }
    };

    safe('данные М4', () =>
      cleanupPlanningData({ scheduleIds: ids.scheduleIds, materialIds: ids.materialIds }),
    );

    this.scheduleIds.clear();
    this.materialIds.clear();
  }
}

type TrackerGlobal = typeof globalThis & { [TRACKER_SLOT]?: PlanningTracker };

/** Единственный на процесс экземпляр трекера М4. */
export const planningTracker: PlanningTracker = (() => {
  const global = globalThis as TrackerGlobal;
  if (!global[TRACKER_SLOT]) {
    global[TRACKER_SLOT] = new PlanningTracker();
  }
  return global[TRACKER_SLOT];
})();

/** Безопасный `flush` для `afterEach`: падение уборки не превращается в каскад ошибок. */
export function flushPlanningData(): void {
  planningTracker.flush();
}
