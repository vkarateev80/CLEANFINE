import { execFileSync } from 'node:child_process';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { authHeader, loginAs, runTag, type Role } from './core';

/**
 * Хелперы «оперативки» М3.8: gps-service, ticket-service, notification-service.
 *
 * Границы сервисов (каждый ходит по абсолютному адресу, как core-набор М2.9):
 *  - auth-service          (E2E_API_URL,          :3001) — только access-токены;
 *  - gps-service           (E2E_GPS_URL,          :3004) — треки, геозоны, nearby;
 *  - ticket-service        (E2E_TICKET_URL,       :3005) — заявки, статусы, SOS;
 *  - notification-service  (E2E_NOTIFICATION_URL, :3006) — устройства и in-app уведомления.
 *
 * Почему уборка идёт SQL-ом, а не API. У gps/ticket/notification нет DELETE:
 * треки и геозоны живут в PostGIS-таблицах, заявки удалять через API контракт не даёт,
 * in-app уведомления не удаляются вообще. Поэтому набор хранит id/маркеры созданного и
 * сносит РОВНО свои строки через `docker exec cleaning-ops-postgres psql` (крайняя мера
 * из требований М3.8). Засеянные данные, чужие геозоны и уведомления не трогаются:
 * геозоны удаляются по id, треки — по (userId, окно времени), заявки — по id.
 *
 * Если docker недоступен (нет запущенного cleaning-ops-postgres), `sqlAvailable()`
 * вернёт false: спеки, которым уборка нужна для честности, помечаются skip, а не
 * «проходят», оставив мусор.
 */

export const AUTH_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
export const GPS_URL = process.env.E2E_GPS_URL ?? 'http://localhost:3004';
export const TICKETS_URL = process.env.E2E_TICKET_URL ?? 'http://localhost:3005';
export const NOTIFICATIONS_URL = process.env.E2E_NOTIFICATION_URL ?? 'http://localhost:3006';

/** Контейнер и базы стенда для точечной уборки. */
const POSTGRES_CONTAINER = process.env.E2E_POSTGRES_CONTAINER ?? 'cleaning-ops-postgres';
const POSTGRES_USER = process.env.E2E_POSTGRES_USER ?? 'admin';
const DB = {
  auth: process.env.E2E_AUTH_DB ?? 'cleaning_ops',
  gps: process.env.E2E_GPS_DB ?? 'cleaning_ops_gps',
  tickets: process.env.E2E_TICKETS_DB ?? 'cleaning_ops_tickets',
  notifications: process.env.E2E_NOTIFICATIONS_DB ?? 'cleaning_ops_notifications',
} as const;/** Стабильный UUID объекта core для «оперативных» заявок и геозон (объект создавать не нужно). */
export const OPERATIONS_OBJECT_ID =
  process.env.E2E_OPERATIONS_OBJECT_ID ?? '00000000-0000-4000-8000-0000000000aa';

/**
 * Тестовый квадрат геозоны ~65×65 м рядом с 55.7558/37.6173 (Москва).
 * `GEOFENCE_INSIDE` лежит в центре, `GEOFENCE_OUTSIDE` — за десятки километров,
 * поэтому вхождение не зависит от точности PostGIS-расчётов.
 */
export const GEOFENCE_BOUNDARY = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [37.617, 55.7555],
      [37.6176, 55.7555],
      [37.6176, 55.7561],
      [37.617, 55.7561],
      [37.617, 55.7555],
    ],
  ],
};
export const GEOFENCE_INSIDE = { lat: 55.7558, lng: 37.6173 };
export const GEOFENCE_OUTSIDE = { lat: 55.79, lng: 37.66 };
/** Точка внутри радиуса поиска геозоны (~267 м от центра), но СНАРУЖИ полигона. */
export const GEOFENCE_NEARBY_OUTSIDE = { lat: 55.7585, lng: 37.6173 };

/**
 * Уникальная геозона на прогон: квадрат ~66×66 м в стороне от «общих» координат стенда.
 *
 * Сдвиг обязателен по двум причинам:
 *  1) gps-service ищет БЛИЖАЙШУЮ геозону в радиусе 1000 м, поэтому две геозоны в одной
 *     точке (например, оставшаяся от упавшего прогона и новая) делают ответ `check`
 *     недетерминированным;
 *  2) тесты набора не должны видеть геозоны друг друга.
 * `index` разводит площадки тестов внутри прогона, а база 55.80/37.70 уводит набор от
 * «шумных» координат центра (55.7558/37.6173), где могли осесть чужие геозоны.
 */
export function uniqueGeofenceCell(index = 0, seed = runTag()): {
  boundary: typeof GEOFENCE_BOUNDARY;
  inside: { lat: number; lng: number };
  outside: { lat: number; lng: number };
} {
  const digits = seed.replace(/\D/g, '').slice(-3).padStart(3, '0');
  // Первая ступень — 0..0.009°, вторая (index) — шаг 0.02°: площадки гарантированно
  // дальше 1 км друг от друга (0.02° широты ≈ 2.2 км).
  const base = 55.8 + Number(digits) / 100_000;
  const lat = base + index * 0.02;
  const lng = 37.7 + Number(digits) / 100_000 + index * 0.02;
  const half = 0.0003;

  return {
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [lng - half, lat - half],
          [lng + half, lat - half],
          [lng + half, lat + half],
          [lng - half, lat + half],
          [lng - half, lat - half],
        ],
      ],
    },
    inside: { lat, lng },
    outside: { lat: 55.95 + index * 0.01, lng: 37.95 + index * 0.01 },
  };
}

// ---------------------------------------------------------------------------
// Токены и идентификаторы
// ---------------------------------------------------------------------------

/**
 * id пользователя из access-токена (поле `sub`).
 * Отдельного публичного «me» с id в оперативных сервисах нет, а токен подписан
 * самим auth-service — читать его payload безопасно и дешевле лишнего запроса.
 */
export function userIdFromToken(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  if (!payload) {
    throw new Error('Не удалось прочитать payload access-токена');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
  if (!decoded.sub) {
    throw new Error('В access-токене нет sub (id пользователя)');
  }
  return decoded.sub;
}

const idCache = new Map<Role, Promise<string>>();

/** id пользователя роли (кэшируется вместе с токеном на время одного воркера). */
export function loginIdAs(request: APIRequestContext, role: Role): Promise<string> {
  const cached = idCache.get(role);
  if (cached) return cached;
  const promise = loginAs(request, role).then(userIdFromToken);
  idCache.set(role, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Обёртки запросов
// ---------------------------------------------------------------------------

export interface ApiOptions {
  data?: unknown;
  token?: string;
  role?: Role;
}

async function call(
  request: APIRequestContext,
  baseUrl: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  const token = options.token ?? (await loginAs(request, options.role ?? 'ADMIN'));
  return request[method](`${baseUrl}${path}`, {
    headers: authHeader(token),
    ...(options.data !== undefined ? { data: options.data } : {}),
  });
}

/** Запрос к gps-service (по умолчанию ADMIN). */
export function gps(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return call(request, GPS_URL, method, path, options);
}

/** Запрос к ticket-service (по умолчанию ADMIN). */
export function tickets(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return call(request, TICKETS_URL, method, path, options);
}

/** Запрос к notification-service (по умолчанию ADMIN). */
export function notifications(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: ApiOptions = {},
): Promise<APIResponse> {
  return call(request, NOTIFICATIONS_URL, method, path, options);
}

/** Текст ответа, разобранный из `{ message }`: Nest отдаёт строку или массив строк. */
export async function errorMessage(res: APIResponse): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    // тело не JSON — вернём как есть
  }
  return text;
}

/** Ассерт статуса с человекочитаемым текстом ошибки сервиса. */
export async function expectStatus(
  res: APIResponse,
  expected: number,
  label = 'запрос',
): Promise<void> {
  expect(res.status(), `${label}: ${await errorMessage(res)}`).toBe(expected);
}

// ---------------------------------------------------------------------------
// DTO-хелперы gps-service
// ---------------------------------------------------------------------------

export interface Geofence {
  id: string;
  objectId: string;
  name: string | null;
  radiusMeters: number | null;
  boundary: { type: 'Polygon'; coordinates: number[][][] } | null;
}

export interface GeofenceCheck {
  userId: string;
  lat: number;
  lng: number;
  inside: boolean;
  distanceMeters: number | null;
  geofence: { id: string; objectId: string; name: string | null } | null;
  checkedAt: string;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  battery?: number;
  timestamp?: string;
}

export interface GeofenceExit {
  geofenceId: string;
  objectId: string;
  name: string | null;
  published: boolean;
}

export interface TrackBatchResult {
  userId: string;
  accepted: number;
  employeeName: string;
  lastPointAt: string;
  geofenceExits: GeofenceExit[];
}

export interface NearbyEmployee {
  userId: string;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  timestamp: string;
}

export interface NearbyResult {
  radiusMeters: number;
  maxAgeMinutes: number;
  count: number;
  employees: NearbyEmployee[];
}

export interface TrackRecord {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  batteryLevel: number | null;
  timestamp: string;
}

export interface TrackHistory {
  userId: string;
  from: string | null;
  to: string | null;
  count: number;
  tracks: TrackRecord[];
}

/** POST /api/gps/geofences — геозона объекта core (ADMIN/SUPERVISOR). */
export async function createGeofence(
  request: APIRequestContext,
  input: {
    objectId?: string;
    name?: string;
    boundary?: typeof GEOFENCE_BOUNDARY;
    radiusMeters?: number;
    role?: Role;
    token?: string;
  } = {},
): Promise<Geofence> {
  const res = await gps(request, 'post', '/api/gps/geofences', {
    role: input.role,
    token: input.token,
    data: {
      objectId: input.objectId ?? OPERATIONS_OBJECT_ID,
      name: input.name ?? `E2E геозона ${runTag()}`,
      boundary: input.boundary ?? GEOFENCE_BOUNDARY,
      ...(input.radiusMeters !== undefined ? { radiusMeters: input.radiusMeters } : {}),
    },
  });
  await expectStatus(res, 201, 'создание геозоны');
  return (await res.json()) as Geofence;
}

/** GET /api/gps/geofences — список геозон (опционально по объекту). */
export async function listGeofences(
  request: APIRequestContext,
  options: { objectId?: string; role?: Role; token?: string } = {},
): Promise<{ count: number; geofences: Geofence[] }> {
  const query = options.objectId ? `?objectId=${encodeURIComponent(options.objectId)}` : '';
  const res = await gps(request, 'get', `/api/gps/geofences${query}`, {
    role: options.role,
    token: options.token,
  });
  await expectStatus(res, 200, 'список геозон');
  return (await res.json()) as { count: number; geofences: Geofence[] };
}

/** GET /api/gps/geofences/:userId/check — вхождение точки в ближайшую геозону. */
export async function checkGeofence(
  request: APIRequestContext,
  userId: string,
  point: { lat: number; lng: number },
  options: { role?: Role; token?: string } = {},
): Promise<GeofenceCheck> {
  const res = await gps(
    request,
    'get',
    `/api/gps/geofences/${userId}/check?lat=${point.lat}&lng=${point.lng}`,
    { role: options.role, token: options.token },
  );
  await expectStatus(res, 200, 'проверка геозоны');
  return (await res.json()) as GeofenceCheck;
}

/** POST /api/gps/track — batch-приём точек; возвращает ответ как есть (для негативных кейсов). */
export function postTrackBatch(
  request: APIRequestContext,
  input: {
    userId?: string;
    employeeName?: string;
    tracks: TrackPoint[];
    role?: Role;
    token?: string;
  },
): Promise<APIResponse> {
  return gps(request, 'post', '/api/gps/track', {
    role: input.role ?? 'OPERATOR',
    token: input.token,
    data: {
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.employeeName !== undefined ? { employeeName: input.employeeName } : {}),
      tracks: input.tracks,
    },
  });
}

/** POST /api/gps/track с проверкой 201 (основной путь). */
export async function sendTrackBatch(
  request: APIRequestContext,
  input: {
    userId?: string;
    employeeName?: string;
    tracks: TrackPoint[];
    role?: Role;
    token?: string;
  },
): Promise<TrackBatchResult> {
  const res = await postTrackBatch(request, input);
  await expectStatus(res, 201, 'приём треков');
  return (await res.json()) as TrackBatchResult;
}

/** GET /api/gps/employees/nearby — сотрудники со свежей (≤5 мин) точкой в радиусе. */
export async function nearbyEmployees(
  request: APIRequestContext,
  point: { lat: number; lng: number },
  options: { radius?: number; role?: Role; token?: string } = {},
): Promise<NearbyResult> {
  const radius = options.radius ?? 500;
  const res = await gps(
    request,
    'get',
    `/api/gps/employees/nearby?lat=${point.lat}&lng=${point.lng}&radius=${radius}`,
    { role: options.role, token: options.token },
  );
  await expectStatus(res, 200, 'поиск ближних сотрудников');
  return (await res.json()) as NearbyResult;
}

/** GET /api/gps/tracks — история перемещений (возвращает ответ как есть). */
export function getTracks(
  request: APIRequestContext,
  query: { userId?: string; from?: string; to?: string; limit?: number },
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  const params = new URLSearchParams();
  if (query.userId !== undefined) params.set('userId', query.userId);
  if (query.from !== undefined) params.set('from', query.from);
  if (query.to !== undefined) params.set('to', query.to);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return gps(request, 'get', `/api/gps/tracks${suffix}`, options);
}

/** GET /api/gps/tracks с проверкой 200. */
export async function trackHistory(
  request: APIRequestContext,
  query: { userId: string; from?: string; to?: string; limit?: number },
  options: { role?: Role; token?: string } = {},
): Promise<TrackHistory> {
  const res = await getTracks(request, query, options);
  await expectStatus(res, 200, 'история треков');
  return (await res.json()) as TrackHistory;
}

// ---------------------------------------------------------------------------
// DTO-хелперы ticket-service
// ---------------------------------------------------------------------------

export type TicketStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'verified'
  | 'rejected'
  | 'closed'
  | 'overdue';

export interface Ticket {
  id: string;
  type: 'planned' | 'unscheduled' | 'emergency';
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: TicketStatus;
  objectId: string;
  roomId: string | null;
  assigneeId: string | null;
  createdBy: string;
  description: string;
  lat: number | null;
  lng: number | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  reactionDeadline: string | null;
  arrivalDeadline: string | null;
  operationsTotal: number | null;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  assignments: { id: string; assigneeId: string; assignedBy: string }[];
  comments: { id: string; authorId: string; text: string }[];
  operations: { id: string; operationId: string; completedAt: string; photoUrl: string | null }[];
  operationsCompleted: number;
}

export interface TicketList {
  items: (Ticket & { _count?: { assignments: number; comments: number; operations: number } })[];
  total: number;
}

export interface EmergencyTicket extends Ticket {
  nearbyOperators: { userId: string; distanceMeters: number | null }[];
}

export interface CompleteOperationResult {
  ticketId: string;
  operationId: string;
  objectId: string;
  completedAt: string;
  photoUrl: string | null;
  alreadyCompleted: boolean;
  completedOperations: number;
  operationsTotal: number | null;
  allOperationsCompleted: boolean;
}

/** POST /api/tickets — плановая/внеплановая заявка (ADMIN, SUPERVISOR, CLIENT). */
export async function createTicket(
  request: APIRequestContext,
  input: {
    type?: 'planned' | 'unscheduled';
    priority?: 'low' | 'normal' | 'high' | 'critical';
    objectId?: string;
    roomId?: string;
    assigneeId?: string;
    description?: string;
    lat?: number;
    lng?: number;
    role?: Role;
    token?: string;
  } = {},
): Promise<Ticket> {
  const res = await tickets(request, 'post', '/api/tickets', {
    role: input.role,
    token: input.token,
    data: {
      type: input.type ?? 'planned',
      objectId: input.objectId ?? OPERATIONS_OBJECT_ID,
      description: input.description ?? `E2E заявка ${runTag()}`,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
    },
  });
  await expectStatus(res, 201, 'создание заявки');
  return (await res.json()) as Ticket;
}

/** POST /api/tickets/emergency — SOS-заявка (доступна всем аутентифицированным). */
export async function createEmergencyTicket(
  request: APIRequestContext,
  input: {
    objectId?: string;
    roomId?: string;
    description?: string;
    lat: number;
    lng: number;
    objectName?: string;
    floor?: string;
    radiusM?: number;
    role?: Role;
    token?: string;
  },
): Promise<EmergencyTicket> {
  const res = await tickets(request, 'post', '/api/tickets/emergency', {
    role: input.role ?? 'OPERATOR',
    token: input.token,
    data: {
      objectId: input.objectId ?? OPERATIONS_OBJECT_ID,
      description: input.description ?? `E2E SOS ${runTag()}`,
      lat: input.lat,
      lng: input.lng,
      ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
      ...(input.objectName !== undefined ? { objectName: input.objectName } : {}),
      ...(input.floor !== undefined ? { floor: input.floor } : {}),
      ...(input.radiusM !== undefined ? { radiusM: input.radiusM } : {}),
    },
  });
  await expectStatus(res, 201, 'создание аварийной заявки');
  return (await res.json()) as EmergencyTicket;
}

/** GET /api/tickets — список с фильтрами. */
export function listTickets(
  request: APIRequestContext,
  query: {
    status?: TicketStatus;
    type?: 'planned' | 'unscheduled' | 'emergency';
    priority?: string;
    objectId?: string;
    assigneeId?: string;
    skip?: number;
    take?: number;
  } = {},
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return tickets(request, 'get', `/api/tickets${suffix}`, options);
}

/** GET /api/tickets/:id — деталь заявки (назначения, комментарии, операции). */
export async function getTicketDetail(
  request: APIRequestContext,
  id: string,
  options: { role?: Role; token?: string } = {},
): Promise<TicketDetail> {
  const res = await tickets(request, 'get', `/api/tickets/${id}`, options);
  await expectStatus(res, 200, `деталь заявки ${id}`);
  return (await res.json()) as TicketDetail;
}

/** PATCH /api/tickets/:id/status (возвращает ответ как есть — для негативных кейсов). */
export function patchTicketStatus(
  request: APIRequestContext,
  id: string,
  status: TicketStatus,
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return tickets(request, 'patch', `/api/tickets/${id}/status`, {
    role: options.role ?? 'ADMIN',
    token: options.token,
    data: { status },
  });
}

/** PATCH /api/tickets/:id/status с проверкой 200; возвращает обновлённую заявку. */
export async function changeTicketStatus(
  request: APIRequestContext,
  id: string,
  status: TicketStatus,
  options: { role?: Role; token?: string } = {},
): Promise<Ticket> {
  const res = await patchTicketStatus(request, id, status, options);
  await expectStatus(res, 200, `смена статуса ${id} → ${status}`);
  return (await res.json()) as Ticket;
}

/** POST /api/tickets/:id/assign — назначение исполнителя (ADMIN/SUPERVISOR). */
export function assignTicket(
  request: APIRequestContext,
  id: string,
  assigneeId: string,
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return tickets(request, 'post', `/api/tickets/${id}/assign`, {
    role: options.role ?? 'ADMIN',
    token: options.token,
    data: { assigneeId },
  });
}

/** POST /api/tickets/:id/comments — комментарий к заявке. */
export function addTicketComment(
  request: APIRequestContext,
  id: string,
  text: string,
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return tickets(request, 'post', `/api/tickets/${id}/comments`, {
    role: options.role ?? 'OPERATOR',
    token: options.token,
    data: { text },
  });
}

/** POST /api/tickets/:id/operations/:operationId/complete — завершение операции техкарты. */
export function completeTicketOperation(
  request: APIRequestContext,
  ticketId: string,
  operationId: string,
  input: { photoUrl?: string; requiresPhoto?: boolean; totalOperations?: number } = {},
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return tickets(request, 'post', `/api/tickets/${ticketId}/operations/${operationId}/complete`, {
    role: options.role ?? 'OPERATOR',
    token: options.token,
    data: input,
  });
}

// ---------------------------------------------------------------------------
// DTO-хелперы notification-service
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'NEW_TICKET'
  | 'EMERGENCY'
  | 'TICKET_OVERDUE'
  | 'GEOFENCE_EXIT'
  | 'MATERIAL_LOW';

export interface Device {
  id: string;
  userId: string;
  token: string;
  platform: 'android' | 'ios' | 'web';
  isActive: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
}

export interface NotificationSettings {
  userId: string;
  disabledTypes: string[];
  availableTypes: NotificationType[];
}

/** Токен устройства, уникальный на прогон: не сталкивается с другими наборами и уборкой. */
export function deviceToken(role: string): string {
  return `e2e-m38-${role.toLowerCase()}-${runTag()}`;
}

/** POST /api/notifications/device — upsert push-токена (200, а не 201). */
export function registerDevice(
  request: APIRequestContext,
  input: { token: string; platform?: Device['platform'] },
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return notifications(request, 'post', '/api/notifications/device', {
    role: options.role ?? 'OPERATOR',
    token: options.token,
    data: { token: input.token, platform: input.platform ?? 'android' },
  });
}

/** POST /api/notifications/device с проверкой 200. */
export async function registerDeviceOrFail(
  request: APIRequestContext,
  input: { token: string; platform?: Device['platform'] },
  options: { role?: Role; token?: string } = {},
): Promise<Device> {
  const res = await registerDevice(request, input, options);
  await expectStatus(res, 200, 'регистрация устройства');
  return (await res.json()) as Device;
}

/** GET /api/notifications — in-app список (возвращает ответ как есть). */
export function listNotifications(
  request: APIRequestContext,
  query: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.unreadOnly !== undefined) params.set('unreadOnly', String(query.unreadOnly));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return notifications(request, 'get', `/api/notifications${suffix}`, options);
}

/** GET /api/notifications с проверкой 200. */
export async function notificationsPage(
  request: APIRequestContext,
  query: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  options: { role?: Role; token?: string } = {},
): Promise<NotificationsPage> {
  const res = await listNotifications(request, query, options);
  await expectStatus(res, 200, 'список уведомлений');
  return (await res.json()) as NotificationsPage;
}

/** Ищет уведомление заданного типа и (опционально) с заданным полем payload. */
export async function findNotification(
  request: APIRequestContext,
  matcher: { type: NotificationType; payloadKey?: string; payloadValue?: unknown },
  options: { role?: Role; token?: string; limit?: number } = {},
): Promise<AppNotification | undefined> {
  const page = await notificationsPage(request, { limit: options.limit ?? 100 }, options);
  return page.items.find(
    (item) =>
      item.type === matcher.type &&
      (matcher.payloadKey === undefined ||
        item.payload?.[matcher.payloadKey] === matcher.payloadValue),
  );
}

/**
 * Ждёт уведомление с ретраями (RabbitMQ-путь асинхронный: событие публикуется
 * ticket-service и превращается в in-app запись notification-service позже).
 * Никаких фиксированных sleep — только опрос с таймаутом.
 */
export async function waitForNotification(
  request: APIRequestContext,
  matcher: { type: NotificationType; payloadKey?: string; payloadValue?: unknown },
  options: { role?: Role; token?: string; timeout?: number } = {},
): Promise<AppNotification> {
  const timeout = options.timeout ?? 15_000;
  const deadline = Date.now() + timeout;
  let last: AppNotification | undefined;

  while (Date.now() < deadline) {
    last = await findNotification(request, matcher, options);
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Уведомление ${matcher.type} (${matcher.payloadKey ?? '-'}=${String(
      matcher.payloadValue,
    )}) не появилось за ${timeout} мс`,
  );
}

/** PATCH /api/notifications/:id/read — отметка прочитанного (идемпотентно). */
export function markNotificationRead(
  request: APIRequestContext,
  id: string,
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return notifications(request, 'patch', `/api/notifications/${id}/read`, {
    role: options.role ?? 'OPERATOR',
    token: options.token,
  });
}

/** GET /api/notifications/settings. */
export async function getNotificationSettings(
  request: APIRequestContext,
  options: { role?: Role; token?: string } = {},
): Promise<NotificationSettings> {
  const res = await notifications(request, 'get', '/api/notifications/settings', options);
  await expectStatus(res, 200, 'настройки уведомлений');
  return (await res.json()) as NotificationSettings;
}

/** PATCH /api/notifications/settings — список отключённых типов. */
export function updateNotificationSettings(
  request: APIRequestContext,
  disabledTypes: string[],
  options: { role?: Role; token?: string } = {},
): Promise<APIResponse> {
  return notifications(request, 'patch', '/api/notifications/settings', {
    role: options.role ?? 'OPERATOR',
    token: options.token,
    data: { disabledTypes },
  });
}

// ---------------------------------------------------------------------------
// Уборка (SQL через docker)
// ---------------------------------------------------------------------------

let dockerChecked: boolean | null = null;

/**
 * Доступен ли `docker exec` до контейнера стенда. Проверяется один раз на воркер:
 * если docker нет, набор не «зеленеет» на грязных данных — зависимые тесты скипаются.
 */
export function sqlAvailable(): boolean {
  if (dockerChecked !== null) return dockerChecked;
  try {
    execFileSync('docker', ['exec', POSTGRES_CONTAINER, 'true'], { stdio: 'ignore' });
    dockerChecked = true;
  } catch {
    dockerChecked = false;
  }
  return dockerChecked;
}

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
  // На Windows psql печатает CRLF — убираем их, чтобы id сравнивался строго.
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

/** Первое слово ответа (`DELETE 3` → `3`). */
function affectedRows(output: string): number {
  const match = /^\s*(\d+)/.exec(output);
  return match ? Number(match[1]) : 0;
}

/**
 * LIKE-шаблон `'<prefix>%'`. Префикс — часть e-mail, поэтому набор символов уже, чем
 * у `literal`: только латиница, цифры и дефис. Это исключает подстановку `%`/`_`
 * и кавычек в шаблон.
 */
function likePrefixLiteral(prefix: string): string {
  if (!/^[0-9a-zA-Z-]*$/.test(prefix)) {
    throw new Error(`Недопустимый префикс e-mail для LIKE: ${prefix}`);
  }
  return `'${prefix}%'`;
}

/**
 * Уборка пользователей auth-service — СВОИХ тестовых, по id или по префиксу e-mail.
 *
 * Зачем отдельная функция. `DELETE /api/users/:id` в auth-service НЕ удаляет запись:
 * он ставит `isActive=false` и отзывает refresh-токены (users.controller.ts:98-103).
 * Поэтому без явного SQL после каждого прогона auth-набора на стенде копились бы
 * неактивные `e2e-*`/`pin-e2e-*` (проверено на стенде: 5+5 записей от прошлых прогонов).
 *
 * Уборка идёт тем же приёмом, что и остальные данные прогона: точечный `psql` в контейнер.
 * Настройки подписок лежат в БД уведомлений и не каскадируются при удалении в auth-БД,
 * поэтому снимаются явно. Refresh-токены уходят каскадом (onDelete: Cascade в схеме).
 *
 * Префиксы применяются к пользователям, созданным ТОЛЬКО этим набором (см. вызовы),
 * поэтому засеянные роли и чужие данные не затрагиваются.
 */
export function cleanupAuthUsers(input: {
  userIds?: Iterable<string>;
  emailPrefixes?: string[];
}): number {
  if (!sqlAvailable()) return 0;
  let removed = 0;

  const dropByIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const list = ids.map(literal).join(', ');
    psql(DB.notifications, `DELETE FROM notification_preferences WHERE "userId" IN (${list})`);
    removed += affectedRows(psql(DB.auth, `DELETE FROM users WHERE id IN (${list})`));
  };

  dropByIds([...(input.userIds ?? [])]);

  for (const prefix of input.emailPrefixes ?? []) {
    // Список id берём из auth-БД: Postgres не JOIN-ит таблицы другой базы, а
    // notification_preferences ссылается на пользователя строкой.
    const raw = psql(
      DB.auth,
      `SELECT coalesce(string_agg(id::text, ','), '') FROM users WHERE email LIKE ${likePrefixLiteral(prefix)}`,
    );
    dropByIds(raw.split(',').map((value) => value.trim()).filter(Boolean));
  }

  return removed;
}

/**
 * Сколько из перечисленных пользователей ещё лежит в auth-БД.
 * Для проверок уборки «по id» — глобальные счётчики строк на общем стенде недопустимы.
 */
export function countAuthUsers(ids: Iterable<string>): number {
  if (!sqlAvailable()) return 0;
  const list = [...ids];
  if (list.length === 0) return 0;
  return affectedRows(
    psql(DB.auth, `SELECT COUNT(*) FROM users WHERE id IN (${list.map(literal).join(', ')})`),
  );
}

/**
 * Сколько треков сотрудника попадает в область уборки (userId + время `since`).
 * Нужен тестам чистоты: они фиксируют id своих треков ДО уборки и проверяют, что
 * после неё этих строк уже нет, а чужие данные не пострадали.
 */
export function countTracks(userId: string, since: Date, ids?: string[]): number {
  if (!sqlAvailable()) return 0;
  const filter = ids && ids.length > 0 ? ` AND id IN (${ids.map(literal).join(', ')})` : '';
  const out = psql(
    DB.gps,
    `SELECT COUNT(*) FROM gps_tracks WHERE user_id = ${literal(userId)}::uuid AND timestamp >= ${literal(since.toISOString())}::timestamptz${filter}`,
  );
  return affectedRows(out);
}

/** Id треков сотрудника в области уборки — «до» для проверки чистоты после уборки. */
export function trackIds(userId: string, since: Date): string[] {
  if (!sqlAvailable()) return [];
  const out = psql(
    DB.gps,
    `SELECT coalesce(string_agg(id::text, ','), '') FROM gps_tracks WHERE user_id = ${literal(userId)}::uuid AND timestamp >= ${literal(since.toISOString())}::timestamptz`,
  );
  return out.length > 0 ? out.split(',') : [];
}

/**
 * Уборка оперативных данных прогона:
 *  - геозоны — по списку id (засеянные и чужие не трогаются);
 *  - треки — по паре (userId, окно времени `since`);
 *  - устройства — по токену;
 *  - уведомления — по id;
 *  - заявки — по id (вместе с назначениями, комментариями и завершёнными операциями).
 *
 * Значения подставляются только после проверки на безопасный набор символов, а
 * идентификаторы берутся из ответов сервисов, а не из пользовательского ввода.
 */
export function cleanupOperationsData(input: {
  geofenceIds?: Iterable<string>;
  trackUsers?: { userId: string; since: string | Date }[];
  deviceTokens?: Iterable<string>;
  deviceUsers?: Iterable<string>;
  notificationIds?: Iterable<string>;
  notificationScopes?: { userId: string; since: string | Date }[];
  /**
   * Снести ВСЕ уведомления, созданные после этого момента (кем угодно).
   *
   * Зачем: notification-service рассылает событие и подписчикам-broadcast
   * (владельцам активных устройств) — это засеянные роли operator/supervisor/admin,
   * которых набор не создаёт и потому не может удалить «по области пользователя».
   * Без этого шага каждый прогон копил бы копии EMERGENCY/NEW_TICKET на стенде.
   * Стенд тестовый, реальных уведомлений в нём нет, поэтому временной срез безопасен.
   */
  notificationSinceAll?: string | Date;
  ticketIds?: Iterable<string>;
  /** Свежие пользователи, созданные тестом: удаляются из auth-service (для чистоты стенда). */
  userIds?: Iterable<string>;
}): { geofences: number; tracks: number; devices: number; notifications: number } {
  const removed = { geofences: 0, tracks: 0, devices: 0, notifications: 0 };
  if (!sqlAvailable()) return removed;

  const geofenceIds = [...(input.geofenceIds ?? [])];
  if (geofenceIds.length > 0) {
    const list = geofenceIds.map(literal).join(', ');
    removed.geofences = affectedRows(psql(DB.gps, `DELETE FROM geofences WHERE id IN (${list})`));
  }

  for (const scope of input.trackUsers ?? []) {
    const since = scope.since instanceof Date ? scope.since.toISOString() : scope.since;
    removed.tracks += affectedRows(
      psql(
        DB.gps,
        `DELETE FROM gps_tracks WHERE user_id = ${literal(scope.userId)}::uuid AND timestamp >= ${literal(since)}::timestamptz`,
      ),
    );
  }

  const deviceTokens = [...(input.deviceTokens ?? [])];
  if (deviceTokens.length > 0) {
    const list = deviceTokens.map(literal).join(', ');
    removed.devices = affectedRows(psql(DB.notifications, `DELETE FROM devices WHERE token IN (${list})`));
  }

  // Устройства пользователя удаляются целиком: тесты регистрируют токены под свежих
  // пользователей, и осиротевшее устройство иначе осталось бы получателем broadcast.
  const deviceUsers = [...(input.deviceUsers ?? [])];
  if (deviceUsers.length > 0) {
    const list = deviceUsers.map(literal).join(', ');
    removed.devices += affectedRows(psql(DB.notifications, `DELETE FROM devices WHERE "userId" IN (${list})`));
  }

  const notificationIds = [...(input.notificationIds ?? [])];
  if (notificationIds.length > 0) {
    const list = notificationIds.map(literal).join(', ');
    removed.notifications += affectedRows(
      psql(DB.notifications, `DELETE FROM notifications WHERE id IN (${list})`),
    );
  }

  for (const scope of input.notificationScopes ?? []) {
    const since = scope.since instanceof Date ? scope.since.toISOString() : scope.since;
    removed.notifications += affectedRows(
      psql(
        DB.notifications,
        `DELETE FROM notifications WHERE "userId" = ${literal(scope.userId)} AND "createdAt" >= ${literal(since)}::timestamp`,
      ),
    );
  }

  // Копии broadcast-рассылок засеянным ролям: снимаются по времени прогона.
  if (input.notificationSinceAll !== undefined) {
    const since =
      input.notificationSinceAll instanceof Date
        ? input.notificationSinceAll.toISOString()
        : input.notificationSinceAll;
    removed.notifications += affectedRows(
      psql(DB.notifications, `DELETE FROM notifications WHERE "createdAt" >= ${literal(since)}::timestamp`),
    );
  }

  const ticketIds = [...(input.ticketIds ?? [])];
  if (ticketIds.length > 0) {
    const list = ticketIds.map(literal).join(', ');
    // Колонки ticket-service — camelCase (Prisma без @map), поэтому кавычки обязательны.
    psql(DB.tickets, `DELETE FROM ticket_assignments WHERE "ticketId" IN (${list})`);
    psql(DB.tickets, `DELETE FROM ticket_comments WHERE "ticketId" IN (${list})`);
    psql(DB.tickets, `DELETE FROM ticket_operation_completions WHERE "ticketId" IN (${list})`);
    psql(DB.tickets, `DELETE FROM tickets WHERE id IN (${list})`);
  }

  // Свежие пользователи теста: refresh_tokens уходят каскадом (ON DELETE CASCADE),
  // никакой доменной истории за ними нет — набор создаёт их только под этот прогон.
  const userIds = [...(input.userIds ?? [])];
  if (userIds.length > 0) {
    const list = userIds.map(literal).join(', ');
    // Настройки подписок лежат в БД уведомлений и НЕ каскадируются при удалении
    // пользователя в auth-service (разные БД) — снимаем их явно, иначе копится мусор.
    psql(DB.notifications, `DELETE FROM notification_preferences WHERE "userId" IN (${list})`);
    // Пользователи удаляются ПОСЛЕ области уведомлений выше: их записи уже сняты.
    psql(DB.auth, `DELETE FROM users WHERE id IN (${list})`);
  }

  return removed;
}

/** Финальная зачистка выполняется один раз на процесс: она дороже точечной уборки. */
let sweepDone = false;

/**
 * Финальная зачистка осиротевших уведомлений: записи, чей `userId` уже не существует
 * в auth-service, и оперативные записи прошлых прогонов.
 *
 * Зачем отдельный шаг. `afterEach` снимает уведомления по области (userId + время), но
 * событие из RabbitMQ может прийти уже после того, как тест завершил уборку, а сам
 * пользователь теста к этому моменту удалён — запись остаётся «в никуда». Такой мусор
 * копился бы между прогонами, поэтому один раз на процесс (afterAll первого набора)
 * набор делает детерминированную зачистку: пока auth-service отдаёт пользователя, его
 * уведомления не трогаются, поэтому засеянные роли не страдают.
 */
export function sweepOrphanNotifications(): void {
  if (sweepDone || !sqlAvailable()) return;
  sweepDone = true;

  try {
    // Postgres не может JOIN-ить таблицы другой базы, поэтому список живых id берём
    // из auth-service, а удаление делаем в базе уведомлений — обе доступны через psql.
    const alive = psql(DB.auth, `SELECT coalesce(string_agg(id::text, ','), '') FROM users`)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const guard = alive.length > 0 ? alive.map(literal).join(', ') : "''";

    // 1. Уведомления удалённых пользователей (сироты после гонки с RabbitMQ).
    const orphans = affectedRows(
      psql(DB.notifications, `DELETE FROM notifications WHERE "userId" NOT IN (${guard})`),
    );
    // 2. Оперативные записи давних прогонов: EMERGENCY/GEOFENCE_EXIT без получателя
    //    смысла не имеют, а копиться могут (broadcast идёт владельцам устройств).
    const stale = affectedRows(
      psql(
        DB.notifications,
        `DELETE FROM notifications WHERE type IN ('EMERGENCY','GEOFENCE_EXIT') AND "createdAt" < NOW() - INTERVAL '1 day'`,
      ),
    );

    if (orphans > 0 || stale > 0) {
      console.log(
        `[operations] финальная зачистка: осиротевших уведомлений ${orphans}, старых оперативных ${stale}`,
      );
    }
  } catch (error) {
    console.warn(
      `[operations] финальная зачистка не удалась: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
  }
}

/**
 * Накопитель созданного за прогон: после каждого теста сносит РОВНО эти строки.
 * Живёт в модуле хелпера, поэтому работает и когда тест упал в середине.
 */
/**
 * Трекер живёт в `globalThis`, а не в переменной модуля.
 *
 * Playwright грузит скомпилированный spec и его helpers двумя путями импорта
 * (спек → `../../helpers/operations` и helper → `./operations`), поэтому модуль
 * инстанциируется дважды: `operationsTracker` из сpec и трекер внутри `trackGeofence`
 * оказались бы РАЗНЫМИ объектами, и уборка не увидела бы созданные данные.
 * Общий слот в `globalThis` делает состояние действительно одним на воркер.
 */
const TRACKER_SLOT = Symbol.for('cleaning-ops.e2e.operationsTracker');

class OperationsTracker {
  private readonly geofences = new Set<string>();
  private readonly deviceTokens = new Set<string>();
  private readonly deviceUsers = new Set<string>();
  private readonly userIds = new Set<string>();
  private readonly notifications = new Set<string>();
  private readonly notificationScopes = new Map<string, string>();
  private readonly ticketIds = new Set<string>();
  private readonly trackScopes = new Map<string, string>();
  private readonly objectIds = new Set<string>();

  /**
   * Начало работы воркера: временной срез для снятия уведомлений, которые
   * notification-service разослал засеянным ролям (broadcast-копии).
   * Запас 15 с — на расхождение часов процесса и Postgres.
   */
  private readonly runStartedAt = new Date(Date.now() - 15_000).toISOString();

  geofence(id: string): void {
    this.geofences.add(id);
  }

  device(token: string): void {
    this.deviceTokens.add(token);
  }

  /** Пользователь теста: при уборке удаляются все его устройства и уведомления. */
  user(userId: string): void {
    this.deviceUsers.add(userId);
  }

  /**
   * Пользователь, СОЗДАННЫЙ этим прогоном (например, свежий оператор под SOS).
   * Такой пользователь удаляется из auth-service: иначе каждый прогон оставлял бы
   * на стенде новых «операторов» и их in-app записи.
   */
  userRow(userId: string): void {
    this.userIds.add(userId);
    this.deviceUsers.add(userId);
  }

  notification(id: string): void {
    this.notifications.add(id);
  }

  /**
   * Область уведомлений роли-фикстуры: сносит записи пользователя, созданные после
   * `since`. Иначе каждый SOS-прогон копил бы EMERGENCY записи на стенде.
   */
  notificationSince(userId: string, since: Date = new Date()): void {
    const value = new Date(since.getTime() - 10_000).toISOString();
    const current = this.notificationScopes.get(userId);
    if (current === undefined || value < current) {
      this.notificationScopes.set(userId, value);
    }
  }

  ticket(id: string): void {
    this.ticketIds.add(id);
  }

  /** Объект core, под которым создавались заявки/геозоны — для уборки «по объекту». */
  object(objectId: string): void {
    this.objectIds.add(objectId);
  }

  /** Включает (userId, since) в область удаления треков; при повторе берётся более ранняя граница. */
  trackSince(userId: string, since: Date = new Date()): void {
    // Запас 10 с: часы процесса и Postgres могут расходиться на секунды, а point-in-time
    // timestamp трека ставит СЕРВЕР (NOW()), поэтому граница обязана быть шире дрожания.
    const value = new Date(since.getTime() - 10_000).toISOString();
    const current = this.trackScopes.get(userId);
    if (current === undefined || value < current) {
      this.trackScopes.set(userId, value);
    }
  }

  /** Сносит всё накопленное. Возвращает число удалённых заявок — для проверок уборки. */
  flush(): { tickets: number } {
    if (!sqlAvailable()) {
      return { tickets: 0 };
    }
    const ticketIds = [...this.ticketIds];
    const objectIds = [...this.objectIds];
    let removedTickets = 0;

    // Уборка не должна «залипать»: если один DELETE не прошёл (например, изменилась схема),
    // остальные данные теста всё равно обязаны быть сняты. Ошибка видна в выводе, но не
    // превращает afterEach в источник каскадных падений.
    const safe = (label: string, run: () => void): void => {
      try {
        run();
      } catch (error) {
        console.warn(
          `[operations] уборка «${label}» не удалась: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }
    };

    for (const objectId of objectIds) {
      // Заявки идут по уникальному objectId теста: чужие заявки на том же объекте не тронутся,
      // даже если тест упал до записи id в трекер.
      if (!/^[0-9a-fA-F-]{36}$/.test(objectId)) continue;
      // objectId — text-колонка Prisma (camelCase, без @map) и НЕ uuid-тип: приведение не нужно.
      const scope = `"objectId" = ${literal(objectId)}`;
      safe('assignments по objectId', () =>
        psql(DB.tickets, `DELETE FROM ticket_assignments WHERE "ticketId" IN (SELECT id FROM tickets WHERE ${scope})`),
      );
      safe('comments по objectId', () =>
        psql(DB.tickets, `DELETE FROM ticket_comments WHERE "ticketId" IN (SELECT id FROM tickets WHERE ${scope})`),
      );
      safe('operations по objectId', () =>
        psql(
          DB.tickets,
          `DELETE FROM ticket_operation_completions WHERE "ticketId" IN (SELECT id FROM tickets WHERE ${scope})`,
        ),
      );
      safe('tickets по objectId', () => {
        removedTickets += affectedRows(psql(DB.tickets, `DELETE FROM tickets WHERE ${scope}`));
      });
    }

    if (ticketIds.length > 0) {
      const list = ticketIds.map(literal).join(', ');
      // Пересечение с удалённым по объекту безвредно: DELETE по id идемпотентен.
      safe('assignments по id', () =>
        psql(DB.tickets, `DELETE FROM ticket_assignments WHERE "ticketId" IN (${list})`),
      );
      safe('comments по id', () =>
        psql(DB.tickets, `DELETE FROM ticket_comments WHERE "ticketId" IN (${list})`),
      );
      safe('operations по id', () =>
        psql(DB.tickets, `DELETE FROM ticket_operation_completions WHERE "ticketId" IN (${list})`),
      );
      safe('tickets по id', () => {
        removedTickets += affectedRows(psql(DB.tickets, `DELETE FROM tickets WHERE id IN (${list})`));
      });
    }

    safe('gps/notifications', () => {
      const result = cleanupOperationsData({
        geofenceIds: this.geofences,
        deviceTokens: this.deviceTokens,
        deviceUsers: this.deviceUsers,
        notificationIds: this.notifications,
        notificationScopes: [...this.notificationScopes].map(([userId, since]) => ({ userId, since })),
        notificationSinceAll: this.runStartedAt,
        trackUsers: [...this.trackScopes].map(([userId, since]) => ({ userId, since })),
        userIds: this.userIds,
      });
      // Уборка gps/уведомлений идёт «по областям», а не по id, поэтому полезно видеть
      // в выводе, сколько строк реально снято: молчаливый ноль — признак расхождения схемы.
      if (result.tracks > 0 || result.geofences > 0 || result.devices > 0 || result.notifications > 0) {
        console.log(
          `[operations] уборка: треков ${result.tracks}, геозон ${result.geofences}, устройств ${result.devices}, уведомлений ${result.notifications}`,
        );
      }
    });

    this.geofences.clear();
    this.deviceTokens.clear();
    this.deviceUsers.clear();
    this.userIds.clear();
    this.notifications.clear();
    this.notificationScopes.clear();
    this.ticketIds.clear();
    this.trackScopes.clear();
    this.objectIds.clear();

    return { tickets: removedTickets };
  }
}

type TrackerGlobal = typeof globalThis & { [TRACKER_SLOT]?: OperationsTracker };

/** Единственный на процесс экземпляр трекера (см. комментарий у TRACKER_SLOT). */
function sharedTracker(): OperationsTracker {
  const global = globalThis as TrackerGlobal;
  if (!global[TRACKER_SLOT]) {
    global[TRACKER_SLOT] = new OperationsTracker();
  }
  return global[TRACKER_SLOT];
}

/** Трекер созданного за прогон: см. sharedTracker. */
export const operationsTracker: OperationsTracker = sharedTracker();

/**
 * Безопасный `flush` для `afterEach`: уборка не должна превращать падение теста
 * в каскад ошибок. Проблемы уборки печатаются в вывод, но не бросаются.
 */
export function flushOperationsData(): void {
  sharedTracker().flush();
}

// ---------------------------------------------------------------------------
// Сценарии
// ---------------------------------------------------------------------------

/** Создаёт геозону и сразу ставит её на уборку. */
export async function trackGeofence(
  request: APIRequestContext,
  input: Parameters<typeof createGeofence>[1] = {},
): Promise<Geofence> {
  const geofence = await createGeofence(request, input);
  operationsTracker.geofence(geofence.id);
  operationsTracker.object(geofence.objectId);
  return geofence;
}

/** Создаёт заявку и сразу ставит её на уборку. */
export async function trackTicket(
  request: APIRequestContext,
  input: Parameters<typeof createTicket>[1] = {},
): Promise<Ticket> {
  const ticket = await createTicket(request, input);
  operationsTracker.ticket(ticket.id);
  operationsTracker.object(ticket.objectId);
  return ticket;
}

/** Создаёт аварийную заявку и сразу ставит её на уборку. */
export async function trackEmergencyTicket(
  request: APIRequestContext,
  input: Parameters<typeof createEmergencyTicket>[1],
): Promise<EmergencyTicket> {
  const ticket = await createEmergencyTicket(request, input);
  operationsTracker.ticket(ticket.id);
  operationsTracker.object(ticket.objectId);
  return ticket;
}

/**
 * Регистрирует устройство и ставит на уборку токен, пользователя и его уведомления:
 * владелец активного устройства — получатель broadcast-рассылок (SOS, overdue, material.low),
 * поэтому без этой области на стенде оседали бы EMERGENCY-записи.
 */
export async function trackDevice(
  request: APIRequestContext,
  input: { token: string; platform?: Device['platform'] },
  options: { role?: Role; token?: string } = {},
): Promise<Device> {
  const device = await registerDeviceOrFail(request, input, options);
  operationsTracker.device(input.token);
  operationsTracker.user(device.userId);
  operationsTracker.notificationSince(device.userId, new Date());
  return device;
}

/**
 * Отправляет batch точек и помечает на уборку время треков и уведомлений пользователя.
 *
 * Граница уборки — НЕ «сейчас», а минимальный timestamp из самого batch: тесты
 * намеренно пишут точки «в прошлом» (старый трек для nearby, точка до окна истории),
 * и такие строки иначе переживали бы уборку. Точки с timestamp от сервера (NOW())
 * покрываются запасом `trackSince`.
 *
 * Уведомления помечаются там же: выход из геозоны (geofence.exit) рождает in-app
 * запись, и без этого набор копил бы GEOFENCE_EXIT на стенде.
 */
export async function sendTracks(
  request: APIRequestContext,
  input: Parameters<typeof sendTrackBatch>[1],
): Promise<TrackBatchResult> {
  const startedAt = new Date();
  const explicit = input.tracks
    .map((point) => (point.timestamp ? Date.parse(point.timestamp) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  const scopeFrom = explicit.length > 0 ? new Date(Math.min(...explicit)) : startedAt;

  const result = await sendTrackBatch(request, input);
  operationsTracker.trackSince(result.userId, scopeFrom);
  operationsTracker.notificationSince(result.userId, startedAt);
  return result;
}
