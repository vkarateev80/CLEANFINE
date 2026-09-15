/**
 * Типы ответов gps-service (М3.7 — экран «Карта»). Поля повторяют
 * `backend/gps-service/src/gps/gps.service.ts` и `geofence.service.ts`, но даты —
 * строки: axios отдаёт JSON, где `Date` уже сериализован в ISO 8601.
 *
 * Почему не из Prisma: у gps-service геометрия объявлена как
 * `Unsupported("geometry(Polygon, 4326)")` и читается только через `$queryRaw`,
 * поэтому сгенерированные типы не описывают `boundary` — его форма (GeoJSON)
 * задана контрактом DTO. Дублирование осознанное, как и в `types/core.ts`;
 * контракт проверяют e2e `test/e2e/api/gps.api.spec.ts`.
 */

/**
 * Геометрия геозоны. Кольца — пары `[lng, lat]` (порядок как в GeoJSON и PostGIS),
 * поэтому рисовать полигон нужно с `[coordinates[0], coordinates[1]]`, а не наоборот.
 */
export interface GeofenceBoundary {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Геозона объекта core (`GET /api/gps/geofences`). */
export interface GeofenceEntity {
  id: string;
  /** id объекта в core-service: связь между сервисами только по id, без FK. */
  objectId: string;
  name: string | null;
  radiusMeters: number | null;
  /** `null` — геометрия не сохранена/не распарсилась; такой полигон не рисуется. */
  boundary: GeofenceBoundary | null;
}

export interface GeofenceListResponse {
  count: number;
  geofences: GeofenceEntity[];
}

/**
 * Ближний сотрудник (`GET /api/gps/employees/nearby`): последняя точка не старше
 * 5 минут. Имени здесь нет — gps-service живёт в своей БД (`cleaning_ops_gps`) и
 * не может джойнить `users` из auth-service, поэтому имя резолвит клиент.
 */
export interface NearbyEmployee {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  batteryLevel: number | null;
  timestamp: string;
  /** Метры от точки поиска; `null`, если PostGIS не смог посчитать расстояние. */
  distanceMeters: number | null;
}

export interface NearbyEmployeesResponse {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Окно свежести точки, минуты (по умолчанию 5). */
  maxAgeMinutes: number;
  count: number;
  employees: NearbyEmployee[];
}

/** Точка истории (`GET /api/gps/tracks`). */
export interface TrackPointEntity {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  batteryLevel: number | null;
  timestamp: string;
}

export interface TrackHistoryResponse {
  userId: string;
  from: string | null;
  to: string | null;
  count: number;
  tracks: TrackPointEntity[];
}

/**
 * Радиус поиска ближних сотрудников. Границы повторяют DTO gps-service:
 * `Min(1)`, `Max(MAX_NEARBY_RADIUS_METERS = 50_000)`; по умолчанию 500 м.
 * Диапазон держим на клиенте, чтобы не получать 400 на заведомо неверный ввод.
 */
export const MIN_NEARBY_RADIUS_METERS = 1;
export const MAX_NEARBY_RADIUS_METERS = 50_000;
export const DEFAULT_NEARBY_RADIUS_METERS = 500;

/** Пресеты радиуса для селекта: чаще всего нужны круглые значения. */
export const NEARBY_RADIUS_OPTIONS = [250, 500, 1000, 2000, 5000, 10_000] as const;
