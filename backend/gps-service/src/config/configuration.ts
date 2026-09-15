/**
 * Конфигурация gps-service. Значения берутся из корневого .env
 * (как в auth/core/file-service): ConfigModule.forRoot подставляет их в process.env.
 */
import { EVENTS_EXCHANGE } from '@cleaning-ops/shared/constants/events';

export {
  DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_MAX_BATCH_SIZE,
  DEFAULT_NEARBY_MAX_AGE_MINUTES,
  DEFAULT_PORT,
} from './constants';

import {
  DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_MAX_BATCH_SIZE,
  DEFAULT_NEARBY_MAX_AGE_MINUTES,
  DEFAULT_PORT,
} from './constants';

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default () => ({
  port: positiveInt(process.env.GPS_SERVICE_PORT ?? process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: access-токены auth действуют в gps-service.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? '',
    exchange: process.env.EVENTS_EXCHANGE ?? EVENTS_EXCHANGE,
    // Выключатель для окружений без брокера (локальные прогоны/e2e): RABBITMQ_ENABLED=false.
    enabled: process.env.RABBITMQ_ENABLED !== 'false',
  },
  gps: {
    nearbyMaxAgeMinutes: positiveInt(
      process.env.GPS_NEARBY_MAX_AGE_MINUTES,
      DEFAULT_NEARBY_MAX_AGE_MINUTES,
    ),
    maxBatchSize: positiveInt(process.env.GPS_MAX_BATCH_SIZE, DEFAULT_MAX_BATCH_SIZE),
    geofenceSearchRadiusMeters: positiveInt(
      process.env.GPS_GEOFENCE_SEARCH_RADIUS_METERS,
      DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS,
    ),
    historyLimit: positiveInt(process.env.GPS_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT),
  },
});
