import { t } from '../i18n';
/**
 * Геолокация браузера. Координаты нужны для check-in (сервер проверяет геозону)
 * и для SOS (`lat`/`lng` обязательны в `EmergencyTicketDto`).
 *
 * Ограничение веба: позиция определяется только пока страница открыта, фонового
 * трекинга нет — это осознанная цена отказа от нативных сборок (09.10.2026).
 */
export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
}

export class LocationUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationUnavailable';
  }
}

export const LOCATION_DENIED_TEXT = 'Нет доступа к геолокации. Включите GPS и повторите';
export const LOCATION_FAILED_TEXT = 'Не удалось определить местоположение';

/** Сколько браузер может отдавать закэшированную позицию, если свежая не нужна. */
export const CACHED_POSITION_MAX_AGE_MS = 30_000;

/**
 * Позиция устройства. `fresh` — только новый замер (`maximumAge: 0`): нужен
 * отметке прихода, где сервер решает «в зоне / вне зоны». 07.11.2026: повторная
 * отметка после «Вы находитесь вне зоны объекта» до 30 с получала из кэша те же
 * координаты и снова получала отказ, хотя оператор уже вошёл в зону.
 */
export function getCurrentPosition(
  timeoutMs = 15_000,
  options: { fresh?: boolean } = {},
): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationUnavailable(t(LOCATION_FAILED_TEXT)));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          timestamp: position.timestamp,
        }),
      (error) => {
        reject(
          new LocationUnavailable(
            error.code === error.PERMISSION_DENIED ? t(LOCATION_DENIED_TEXT) : t(LOCATION_FAILED_TEXT),
          ),
        );
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: options.fresh ? 0 : CACHED_POSITION_MAX_AGE_MS,
      },
    );
  });
}

export function formatCoords(point: Pick<GeoPoint, 'lat' | 'lng'>): string {
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}
