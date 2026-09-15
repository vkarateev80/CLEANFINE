/**
 * Числовые константы конфигурации gps-service.
 * Отдельный модуль без рантайм-импортов workspace-пакета @cleaning-ops/shared:
 * конфиг и DTO не тянут общие контракты в тестовое окружение.
 */

export const DEFAULT_PORT = 3004;

/** Окно «свежести» последней точки при поиске ближних сотрудников (УСТАВ → GPS, п.4). */
export const DEFAULT_NEARBY_MAX_AGE_MINUTES = 5;

/** Максимальный размер batch-запроса треков (чек-лист GPS: 1000 точек/с). */
export const DEFAULT_MAX_BATCH_SIZE = 1000;

/** Радиус поиска ближайшей геозоны в проверке вхождения (УСТАВ → GPS, п.3). */
export const DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS = 1000;

export const DEFAULT_HISTORY_LIMIT = 1000;
