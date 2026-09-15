/**
 * Числовые пределы gps-service. Вынесены отдельно от configuration.ts, чтобы
 * DTO не тянули в рантайме workspace-пакет @cleaning-ops/shared.
 */

/** Максимальное число точек в одном batch-запросе (чек-лист GPS: 1000 точек/с). */
export const MAX_TRACK_BATCH = 1000;

/** Радиус поиска ближних сотрудников по умолчанию, м (SOS-вертикаль М3: 500 м). */
export const DEFAULT_NEARBY_RADIUS_METERS = 500;

/** Границы осмысленных значений полей точки. */
export const MAX_ACCURACY_METERS = 100_000;
export const MAX_SPEED_MPS = 1_000;
export const MAX_GEOFENCE_RADIUS_METERS = 100_000;
export const MAX_NEARBY_RADIUS_METERS = 50_000;
export const MAX_HISTORY_LIMIT = 10_000;
export const INT4_MAX = 2_147_483_647;
