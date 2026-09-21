import { expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userByRole, type FixtureUser } from './users';

/**
 * Хелперы core-service и file-service для e2e (М2.9).
 *
 * Границы:
 *  - auth-service  (E2E_API_URL,  :3001) — только выдача access-токенов;
 *  - core-service  (E2E_CORE_URL, :3003) — объекты → этажи → помещения, маршруты, техкарты;
 *  - file-service  (E2E_FILE_URL, :3002) — загрузка файлов и привязки.
 *
 * ВАЖНО про логин: auth-service ограничивает вход по частоте (прод-дефолт 5/мин).
 * Хелпер кэширует токен на роль на время одного воркера, поэтому весь набор делает
 * ровно 4 логина вместо десятков. Если лимит всё же поднят (штатный прогон стенда),
 * кэш просто экономит запросы.
 */

export const AUTH_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
export const CORE_URL = process.env.E2E_CORE_URL ?? 'http://localhost:3003';
export const FILE_URL = process.env.E2E_FILE_URL ?? 'http://localhost:3002';

export type Role = FixtureUser['role'];

/** Пара токенов, как её отдаёт auth-service. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

/** Окно лимита входа в auth-service (прод-дефолт: 5 попыток / 60 с). */
const THROTTLE_WINDOW_MS = 61_000;

const tokenCache = new Map<Role, Promise<string>>();

/**
 * Логин под ролью из test/fixtures/users.json; результат кэшируется на прогон,
 * поэтому весь набор делает по одному логину на роль.
 *
 * Тонкость стенда: auth-service ограничивает вход (прод-дефолт 5/мин на IP).
 * Если квота уже израсходована (например, перед этим отработал auth-набор),
 * хелпер дожидается конца окна и повторяет попытку один раз — иначе набор был бы
 * «красным» из-за лимита, а не из-за дефекта. Штатный прогон на поднятом лимите
 * этого ожидания не замечает.
 */
export function loginAs(request: APIRequestContext, role: Role): Promise<string> {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const promise = (async () => {
    const user = userByRole(role);
    const attempt = async () =>
      request.post(`${AUTH_URL}/api/auth/login`, {
        data: { email: user.email, password: user.password },
      });

    let res = await attempt();
    if (res.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_WINDOW_MS));
      res = await attempt();
    }

    expect(res.status(), `логин ${role}: ${await res.text()}`).toBe(201);
    return ((await res.json()) as TokenPair).accessToken;
  })();

  tokenCache.set(role, promise);
  return promise;
}

/**
 * Запрос к core-service под токеном роли.
 * Дефолт — ADMIN: он умеет всё, а мусор за собой тесты убирают сами.
 */
export async function core(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: { data?: unknown; token?: string; role?: Role; multipart?: ApiMultipart } = {},
): Promise<import('@playwright/test').APIResponse> {
  const token = options.token ?? (await loginAs(request, options.role ?? 'ADMIN'));
  return request[method](`${CORE_URL}${path}`, {
    headers: authHeader(token),
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.multipart !== undefined ? { multipart: options.multipart } : {}),
  });
}

/** Запрос к file-service под токеном роли (по умолчанию ADMIN). */
export async function file(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  options: { data?: unknown; token?: string; role?: Role; multipart?: ApiMultipart } = {},
): Promise<import('@playwright/test').APIResponse> {
  const token = options.token ?? (await loginAs(request, options.role ?? 'ADMIN'));
  return request[method](`${FILE_URL}${path}`, {
    headers: authHeader(token),
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.multipart !== undefined ? { multipart: options.multipart } : {}),
  });
}

/** Элемент multipart-формы Playwright: либо файл, либо обычное текстовое поле. */
export type ApiMultipart = Record<
  string,
  string | number | boolean | { name: string; mimeType: string; buffer: Buffer }
>;

// ---------------------------------------------------------------------------
// DTO-хелперы core-service
// ---------------------------------------------------------------------------

export interface CreateObjectInput {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  type?: string;
  totalArea?: number;
  floorsCount?: number;
  clientName?: string;
  clientContact?: string;
  /**
   * Привязка объекта к аккаунту заказчика (id пользователя auth-service) —
   * именно она даёт клиенту доступ в портале. `null` — «привязки нет»;
   * отсутствие поля при PATCH означает «не менять привязку».
   */
  ownerClientId?: string | null;
}

/** Уникальный суффикс прогона: имена не должны сталкиваться между запусками. */
export function runTag(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

export interface CoreObject {
  id: string;
  name: string;
  status: string;
  /** Привязка к аккаунту заказчика (см. CreateObjectInput.ownerClientId). */
  ownerClientId?: string | null;
  clientName?: string;
  clientContact?: string;
}

export interface Floor {
  id: string;
  objectId: string;
  number: number;
  name: string;
  planImageUrl: string | null;
  planScale: number | null;
  planWidth: number | null;
  planHeight: number | null;
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  areaM2: number;
  floorType: string;
  coordsX: number | null;
  coordsY: number | null;
  coordsWidth: number | null;
  coordsHeight: number | null;
  techCardId: string | null;
}

export interface Route {
  id: string;
  floorId: string;
  name: string;
  status: string;
}

export interface RoutePoint {
  id: string;
  routeId: string;
  roomId: string;
  orderIndex: number;
  estimatedTimeMin: number | null;
  room?: Room;
}

export interface TechCard {
  id: string;
  name: string;
}

export interface TechOperation {
  id: string;
  techCardId: string;
  name: string;
  orderIndex: number;
  estimatedTimeMin: number;
  requiresPhoto: boolean;
  requiresQr: boolean;
  materials?: { materialId: string; consumptionPerOperation: number; unit: string }[];
}

/** POST /api/objects */
export async function createObject(
  request: APIRequestContext,
  input: CreateObjectInput = {},
  options: { role?: Role; token?: string } = {},
): Promise<CoreObject> {
  const res = await core(request, 'post', '/api/objects', {
    role: options.role,
    token: options.token,
    data: {
      name: `E2E объект ${runTag()}`,
      address: 'г. Москва, ул. Тестовая, 1',
      lat: 55.7558,
      lng: 37.6173,
      type: 'business-center',
      totalArea: 4200.5,
      floorsCount: 2,
      clientName: 'ООО «E2E Заказчик»',
      clientContact: '+7 495 000-00-00',
      ...input,
    },
  });
  expect(res.status(), `создание объекта: ${await res.text()}`).toBe(201);
  return (await res.json()) as CoreObject;
}

// ---------------------------------------------------------------------------
// Аккаунты заказчиков (auth-service) — нужны для проверок ownerClientId
// ---------------------------------------------------------------------------

/** Публичные поля аккаунта, которые отдаёт auth-service (`SafeUser`). */
export interface AccountUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export interface CreateClientInput {
  email: string;
  fullName: string;
  password?: string;
}

/**
 * POST /api/users — создание CLIENT-аккаунта (только ADMIN).
 * Возвращает id: он и есть значение `ownerClientId` для привязки объекта.
 */
export async function createClientAccount(
  request: APIRequestContext,
  input: CreateClientInput,
  options: { role?: Role; token?: string } = {},
): Promise<AccountUser> {
  const res = await request.post(`${AUTH_URL}/api/users`, {
    headers: authHeader(options.token ?? (await loginAs(request, options.role ?? 'ADMIN'))),
    data: {
      email: input.email,
      fullName: input.fullName,
      password: input.password ?? 'client123',
      role: 'CLIENT',
    },
  });
  expect(res.status(), `создание CLIENT-аккаунта: ${await res.text()}`).toBe(201);
  return (await res.json()) as AccountUser;
}

/** DELETE /api/users/:id — мягкая деактивация (`isActive=false`), жёсткого удаления нет. */
export async function deactivateAccount(
  request: APIRequestContext,
  userId: string,
  options: { role?: Role; token?: string } = {},
): Promise<void> {
  const res = await request.delete(`${AUTH_URL}/api/users/${userId}`, {
    headers: authHeader(options.token ?? (await loginAs(request, options.role ?? 'ADMIN'))),
  });
  expect([200, 204], `деактивация аккаунта ${userId}: ${await res.text()}`).toContain(res.status());
}

/** Уникальный email прогона: тесты не должны сталкиваться между запусками. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${runTag()}@example.com`;
}

/** POST /api/objects/:objectId/floors */
export async function createFloor(
  request: APIRequestContext,
  objectId: string,
  input: { number: number; name?: string; planScale?: number },
  options: { role?: Role; token?: string } = {},
): Promise<Floor> {
  const res = await core(request, 'post', `/api/objects/${objectId}/floors`, {
    role: options.role,
    token: options.token,
    data: {
      number: input.number,
      name: input.name ?? `Этаж ${input.number}`,
      ...(input.planScale !== undefined ? { planScale: input.planScale } : {}),
    },
  });
  expect(res.status(), `создание этажа: ${await res.text()}`).toBe(201);
  return (await res.json()) as Floor;
}

/** POST /api/floors/:floorId/rooms */
export async function createRoom(
  request: APIRequestContext,
  floorId: string,
  input: {
    name?: string;
    areaM2?: number;
    floorType?: string;
    coordsX?: number;
    coordsY?: number;
    coordsWidth?: number;
    coordsHeight?: number;
    zone?: string;
    techCardId?: string;
  },
  options: { role?: Role; token?: string } = {},
): Promise<Room> {
  const res = await core(request, 'post', `/api/floors/${floorId}/rooms`, {
    data: { name: `Помещение ${runTag()}`, areaM2: 18.5, floorType: 'office', ...input },
    role: options.role,
    token: options.token,
  });
  expect(res.status(), `создание помещения: ${await res.text()}`).toBe(201);
  return (await res.json()) as Room;
}

/** POST /api/floors/:floorId/routes */
export async function createRoute(
  request: APIRequestContext,
  floorId: string,
  input: { name?: string } = {},
  options: { role?: Role; token?: string } = {},
): Promise<Route> {
  const res = await core(request, 'post', `/api/floors/${floorId}/routes`, {
    role: options.role,
    token: options.token,
    data: { name: input.name ?? `Маршрут ${runTag()}` },
  });
  expect(res.status(), `создание маршрута: ${await res.text()}`).toBe(201);
  return (await res.json()) as Route;
}

/** POST /api/routes/:id/points — точка добавляется в конец маршрута. */
export async function addRoutePoint(
  request: APIRequestContext,
  routeId: string,
  input: { roomId: string; estimatedTimeMin?: number },
  options: { role?: Role; token?: string } = {},
): Promise<RoutePoint> {
  const res = await core(request, 'post', `/api/routes/${routeId}/points`, {
    role: options.role,
    token: options.token,
    data: input,
  });
  expect(res.status(), `добавление точки маршрута: ${await res.text()}`).toBe(201);
  return (await res.json()) as RoutePoint;
}

/** POST /api/tech-cards */
export async function createTechCard(
  request: APIRequestContext,
  input: { name?: string } = {},
  options: { role?: Role; token?: string } = {},
): Promise<TechCard> {
  const res = await core(request, 'post', '/api/tech-cards', {
    role: options.role,
    token: options.token,
    data: { name: input.name ?? `E2E техкарта ${runTag()}` },
  });
  expect(res.status(), `создание техкарты: ${await res.text()}`).toBe(201);
  return (await res.json()) as TechCard;
}

/** POST /api/tech-cards/:id/operations */
export async function addOperation(
  request: APIRequestContext,
  cardId: string,
  input: {
    name: string;
    estimatedTimeMin: number;
    orderIndex?: number;
    description?: string;
    equipment?: Record<string, unknown>;
    requiresPhoto?: boolean;
    requiresQr?: boolean;
    materials?: { materialId: string; consumptionPerOperation: number; unit: string }[];
  },
  options: { role?: Role; token?: string } = {},
): Promise<TechOperation> {
  const res = await core(request, 'post', `/api/tech-cards/${cardId}/operations`, {
    role: options.role,
    token: options.token,
    data: input,
  });
  expect(res.status(), `добавление операции: ${await res.text()}`).toBe(201);
  return (await res.json()) as TechOperation;
}

/**
 * Элемент плоского списка маршрутов (`GET /api/routes`, М4).
 * `objectId` — объект этажа маршрута, `pointsCount` — число точек.
 */
export interface RouteSummary {
  id: string;
  name: string;
  floorId: string;
  objectId: string;
  pointsCount: number;
  createdAt: string;
}

/**
 * GET /api/routes — плоский список маршрутов с фильтрами и пагинацией.
 *
 * Контракт М4: ответ `{ items, total }`, где `total` считает ВСЕ подходящие маршруты,
 * а не размер страницы. `objectId` отбирает маршруты всех этажей объекта, `floorId` —
 * одного этажа; `take` не больше 100 (валидатор DTO).
 */
export async function listRoutes(
  request: APIRequestContext,
  query: { skip?: number; take?: number; objectId?: string; floorId?: string } = {},
  options: { role?: Role; token?: string } = {},
): Promise<{ items: RouteSummary[]; total: number }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const res = await core(request, 'get', `/api/routes${suffix}`, {
    role: options.role,
    token: options.token,
  });
  expect(res.status(), `список маршрутов: ${await res.text()}`).toBe(200);
  return (await res.json()) as { items: RouteSummary[]; total: number };
}

/** GET /api/routes/:id — маршрут с точками и totalEstimatedTimeMin. */
export async function getRouteDetail(
  request: APIRequestContext,
  routeId: string,
  options: { role?: Role; token?: string } = {},
): Promise<{ points: RoutePoint[]; totalEstimatedTimeMin: number } & Route> {
  const res = await core(request, 'get', `/api/routes/${routeId}`, {
    role: options.role,
    token: options.token,
  });
  expect(res.status(), `маршрут ${routeId}: ${await res.text()}`).toBe(200);
  return await res.json();
}

/** DELETE /api/objects/:id — каскадом уносит этажи, помещения, маршруты и точки. */
export async function deleteObject(
  request: APIRequestContext,
  objectId: string,
  options: { role?: Role; token?: string } = {},
): Promise<void> {
  const res = await core(request, 'delete', `/api/objects/${objectId}`, {
    role: options.role,
    token: options.token,
  });
  // 404 — объект уже удалён (идемпотентная уборка).
  expect([204, 404], `удаление объекта ${objectId}: ${await res.text()}`).toContain(res.status());
}

/** DELETE /api/tech-cards/:id — техкарты в core глобальные, e2e чистит только свои. */
export async function deleteTechCard(
  request: APIRequestContext,
  cardId: string,
  options: { role?: Role; token?: string } = {},
): Promise<void> {
  const res = await core(request, 'delete', `/api/tech-cards/${cardId}`, {
    role: options.role,
    token: options.token,
  });
  expect([204, 404], `удаление техкарты ${cardId}: ${await res.text()}`).toContain(res.status());
}

/** Текст ответа без падения на пустом теле — удобно для сообщений об ошибке. */
export async function bodyText(res: import('@playwright/test').APIResponse): Promise<string> {
  return await res.text();
}

// ---------------------------------------------------------------------------
// Файлы (file-service)
// ---------------------------------------------------------------------------

export interface UploadedFile {
  id: string;
  bucket: string;
  url: string;
  thumbnailUrl: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Минимальный валидный PNG 1×1 — хватает file-service (тип и размер проверяются,
 * минимальное разрешение — только для kind=photo). Годится для документов/аватаров.
 */
export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Реальный план этажа 1200×800 (test/fixtures/files/floor-plan.png).
 * Координаты комнат в e2e валидируются core по РАЗМЕРУ плана (дефект B, М2.4),
 * поэтому план обязан быть «настоящим» изображением, а не PNG 1×1.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const PLAN_PNG = readFileSync(join(here, '..', 'fixtures', 'files', 'floor-plan.png'));

/** POST /api/files/upload (multipart, поле `file` + метаданные `kind`). */
export async function uploadFile(
  request: APIRequestContext,
  options: {
    kind?: 'photo' | 'plan' | 'avatar' | 'document';
    name?: string;
    mimeType?: string;
    buffer?: Buffer;
    role?: Role;
    token?: string;
  } = {},
): Promise<UploadedFile> {
  const kind = options.kind ?? 'plan';
  const res = await file(request, 'post', '/api/files/upload', {
    role: options.role,
    token: options.token,
    multipart: {
      file: {
        name: options.name ?? 'plan.png',
        mimeType: options.mimeType ?? 'image/png',
        // План — реальное изображение (координаты валидируются по его размеру),
        // остальные kind'ы — минимальный PNG.
        buffer: options.buffer ?? (kind === 'plan' ? PLAN_PNG : PNG_1x1),
      },
      kind,
    },
  });
  expect(res.status(), `загрузка файла (${kind}): ${await res.text()}`).toBe(201);
  return (await res.json()) as UploadedFile;
}

/** POST /api/files/:id/attach — кросс-сервисная привязка файла к сущности. */
export async function attachFile(
  request: APIRequestContext,
  fileId: string,
  entityType: 'FLOOR_PLAN' | 'TICKET' | 'CHAT_MESSAGE' | 'AVATAR' | 'DOCUMENT',
  entityId: string,
  options: { role?: Role; token?: string } = {},
): Promise<{ id: string }> {
  const res = await file(request, 'post', `/api/files/${fileId}/attach`, {
    role: options.role,
    token: options.token,
    data: { entityType, entityId },
  });
  expect(res.status(), `привязка файла: ${await res.text()}`).toBe(201);
  return (await res.json()) as { id: string };
}

/** DELETE /api/files/:id — идемпотентно (404 на уже удалённый файл не роняет уборку). */
export async function deleteFile(
  request: APIRequestContext,
  fileId: string,
  options: { role?: Role; token?: string } = {},
): Promise<void> {
  const res = await file(request, 'delete', `/api/files/${fileId}`, {
    role: options.role,
    token: options.token,
  });
  expect([204, 404], `удаление файла ${fileId}: ${await res.text()}`).toContain(res.status());
}

/** POST /api/floors/:id/plan — core сам сходит в file-service (сквозной проброс токена). */
export async function uploadPlanViaCore(
  request: APIRequestContext,
  floorId: string,
  planScale: number,
  options: { role?: Role; token?: string } = {},
): Promise<Floor> {
  const res = await core(request, 'post', `/api/floors/${floorId}/plan`, {
    role: options.role,
    token: options.token,
    multipart: {
      file: { name: 'floor-plan.png', mimeType: 'image/png', buffer: PLAN_PNG },
      planScale: String(planScale),
    },
  });
  expect(res.status(), `загрузка плана этажа: ${await res.text()}`).toBe(201);
  return (await res.json()) as Floor;
}

/** PUT /api/floors/:id/plan-url — привязка плана, уже загруженного в file-service. */
export async function attachPlanUrl(
  request: APIRequestContext,
  floorId: string,
  planImageUrl: string,
  planScale: number,
  options: { role?: Role; token?: string; width?: number; height?: number } = {},
): Promise<Floor> {
  const res = await core(request, 'post', `/api/floors/${floorId}/plan-url`, {
    role: options.role,
    token: options.token,
    data: {
      planImageUrl,
      planScale,
      ...(options.width !== undefined ? { planWidth: options.width } : {}),
      ...(options.height !== undefined ? { planHeight: options.height } : {}),
    },
  });
  expect(res.status(), `привязка плана по URL: ${await res.text()}`).toBe(201);
  return (await res.json()) as Floor;
}
