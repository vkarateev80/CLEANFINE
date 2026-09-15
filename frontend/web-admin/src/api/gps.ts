import { apiClient } from './client';
import type {
  GeofenceListResponse,
  NearbyEmployeesResponse,
  TrackHistoryResponse,
} from '../types/gps';

/**
 * Клиент gps-service (:3004 через прокси). Один модуль на весь GPS-домен:
 * страницы не собирают URL сами — иначе путь `/employees/nearby` размножился бы
 * по компонентам и разошёлся с бэкендом (см. `api/core.ts`).
 *
 * Чтение геозон, ближних сотрудников и истории доступно всем авторизованным
 * ролям: на этих ручках gps-service нет `@Roles` (только создание геозоны —
 * ADMIN/SUPERVISOR, и карте оно не нужно).
 */

export interface ListGeofencesQuery {
  /** Фильтр по объекту core-service; без него вернутся все геозоны стенда. */
  objectId?: string;
}

/** `GET /api/gps/geofences` — геозоны с GeoJSON-полигонами. */
export function listGeofences(query: ListGeofencesQuery = {}): Promise<GeofenceListResponse> {
  return apiClient
    .get('/gps/geofences', {
      params: {
        // Пустой `objectId` бэкенд отвергнет как невалидный UUID — параметр не отправляем.
        ...(query.objectId ? { objectId: query.objectId } : {}),
      },
    })
    .then((r) => r.data);
}

export interface NearbyEmployeesQuery {
  lat: number;
  lng: number;
  /** Метры; по умолчанию на бэкенде 500, максимум 50 000. */
  radius?: number;
}

/** `GET /api/gps/employees/nearby` — последняя точка каждого сотрудника в радиусе. */
export function listNearbyEmployees(query: NearbyEmployeesQuery): Promise<NearbyEmployeesResponse> {
  return apiClient
    .get('/gps/employees/nearby', {
      params: {
        lat: query.lat,
        lng: query.lng,
        ...(query.radius === undefined ? {} : { radius: query.radius }),
      },
    })
    .then((r) => r.data);
}

export interface TrackHistoryQuery {
  userId: string;
  /** ISO 8601; без границ сервис отдаёт последние `limit` точек. */
  from?: string;
  to?: string;
  /** Максимум точек, у бэкенда ограничен 10 000. */
  limit?: number;
}

/** `GET /api/gps/tracks` — история перемещений сотрудника (по возрастанию времени). */
export function getTrackHistory(query: TrackHistoryQuery): Promise<TrackHistoryResponse> {
  return apiClient
    .get('/gps/tracks', {
      params: {
        userId: query.userId,
        ...(query.from === undefined ? {} : { from: query.from }),
        ...(query.to === undefined ? {} : { to: query.to }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      },
    })
    .then((r) => r.data);
}
