/**
 * Конфигурация schedule-service. Значения берутся из корневого .env
 * (backend/schedule-service → корень репозитория, как в ticket/core/auth).
 */

export const DEFAULT_PORT = 3008;

import { DEFAULT_SCHEDULE_TIME_ZONE } from '@cleaning-ops/shared/types/time-zone';

/** Миллисекунды в сутках. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Миллисекунды в часе: интервал прохода генерации по умолчанию. */
export const HOUR_MS = 60 * 60 * 1000;

/** Целое в границах [min, max]; нечисло или пустая строка → fallback (0 допустим). */
export function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), min), max) : fallback;
}

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Строка, которая может быть пустой: пустое значение → fallback. */
function nonEmpty(value: string | undefined, fallback: string): string {
  return value && value.trim() !== '' ? value : fallback;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export default () => ({
  // Порт фиксирован .env (SCHEDULE_SERVICE_PORT); PORT оставлен как общий фолбэк.
  port: positiveInt(process.env.SCHEDULE_SERVICE_PORT ?? process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: токены auth действуют в schedule-service.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  rabbitmq: {
    // Общая шина событий: exchange cleaning-ops.events (shared/constants/events.ts).
    url: nonEmpty(process.env.RABBITMQ_URL, 'amqp://localhost:5672'),
    timeoutMs: positiveInt(process.env.RABBITMQ_TIMEOUT_MS, 5_000),
  },
  authService: {
    // schedule → auth: служебный логин для cron и создания заявок (ServiceTokenProvider).
    baseUrl: stripTrailingSlash(nonEmpty(process.env.AUTH_SERVICE_URL, 'http://localhost:3001')),
    timeoutMs: positiveInt(process.env.AUTH_SERVICE_TIMEOUT_MS, 5_000),
    email: process.env.SERVICE_AUTH_EMAIL ?? '',
    password: process.env.SERVICE_AUTH_PASSWORD ?? '',
  },
  gpsService: {
    // schedule → gps: проверка геозоны при check-in (М4.5).
    baseUrl: stripTrailingSlash(nonEmpty(process.env.GPS_SERVICE_URL, 'http://localhost:3004')),
    timeoutMs: positiveInt(process.env.GPS_SERVICE_TIMEOUT_MS, 5_000),
  },
  ticketService: {
    // schedule → ticket: плановая заявка по смене (М4.4).
    baseUrl: stripTrailingSlash(nonEmpty(process.env.TICKET_SERVICE_URL, 'http://localhost:3005')),
    timeoutMs: positiveInt(process.env.TICKET_SERVICE_TIMEOUT_MS, 5_000),
  },
  coreService: {
    // schedule → core: имя объекта для события schedule.missed_checkin.
    baseUrl: stripTrailingSlash(nonEmpty(process.env.CORE_SERVICE_URL, 'http://localhost:3003')),
    timeoutMs: positiveInt(process.env.CORE_SERVICE_TIMEOUT_MS, 5_000),
  },
  schedule: {
    /**
     * Проверка неявок (М4.5): смена, у которой plannedStart прошёл, а check-in не сделан,
     * переводится в MISSED + событие schedule.missed_checkin.
     */
    missedCheckinIntervalMs: positiveInt(
      process.env.SCHEDULE_MISSED_CHECKIN_INTERVAL_MS,
      5 * 60 * 1000,
    ),
    /**
     * Авто check-out (М4.5): если оператор отметился, но не закрыл смену за
     * SCHEDULE_AUTO_CHECKOUT_MINUTES после планового конца — смена закрывается сама.
     * До 18.10.2026 отсчёт шёл от plannedStart: смена закрывалась посреди работы.
     */
    autoCheckoutMinutes: positiveInt(process.env.SCHEDULE_AUTO_CHECKOUT_MINUTES, 15),
    /**
     * Плановая длительность смены в минутах, если recurrence.durationMin не задан.
     * Нужна для plannedStart → plannedEnd (пробел API М6). 480 = 8 часов.
     */
    defaultShiftMinutes: positiveInt(process.env.SCHEDULE_DEFAULT_SHIFT_MINUTES, 480),
    /**
     * Пояс расписания по умолчанию (IANA): пока ADMIN не выбрал пояс в админке
     * («Настройки», таблица ScheduleSettings) или если таблица ещё не создана.
     */
    timeZone: nonEmpty(process.env.SCHEDULE_TIME_ZONE, DEFAULT_SCHEDULE_TIME_ZONE).trim(),
    /**
     * Интервал тика генерации. Тик раз в час, а смены создаются только в тот, что
     * попал в час `generateHour`: при суточном интервале фаза таймера зависела от
     * времени старта пода (22:08) и настроенный час не наступал никогда.
     */
    generateIntervalMs: positiveInt(process.env.SCHEDULE_GENERATE_INTERVAL_MS, HOUR_MS),
    /** Час по времени расписания, в который выполняется ежедневная генерация (0 — полночь). */
    generateHour: boundedInt(process.env.SCHEDULE_GENERATE_HOUR, 0, 0, 23),
    /** Выключатель cron для e2e/отладки: SCHEDULE_CRON_ENABLED=false. */
    cronEnabled: (process.env.SCHEDULE_CRON_ENABLED ?? 'true') !== 'false',
    /** Размер порции в проходах неявок/авто check-out, чтобы не грузить БД. */
    batchSize: positiveInt(process.env.SCHEDULE_BATCH_SIZE, 200),
  },
});
