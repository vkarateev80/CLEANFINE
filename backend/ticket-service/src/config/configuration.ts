/**
 * Конфигурация ticket-service. Значения берутся из корневого .env
 * (backend/ticket-service → корень репозитория, как в core/file/auth).
 */

export const DEFAULT_PORT = 3005;

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Строка, которая может быть пустой: пустое значение → fallback. */
function nonEmpty(value: string | undefined, fallback: string): string {
  return value && value.trim() !== '' ? value : fallback;
}

export default () => ({
  // Порт фиксирован .env (TICKET_SERVICE_PORT); PORT оставлен как общий фолбэк.
  port: positiveInt(process.env.TICKET_SERVICE_PORT ?? process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: токены auth действуют в ticket-service.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  rabbitmq: {
    // Общая шина событий: exchange cleaning-ops.events (shared/constants/events.ts).
    url: nonEmpty(process.env.RABBITMQ_URL, 'amqp://localhost:5672'),
    /** Сколько ждать подключения к брокеру, прежде чем сдаться (мс). */
    timeoutMs: positiveInt(process.env.RABBITMQ_TIMEOUT_MS, 5_000),
  },
  gpsService: {
    // ticket → gps: поиск ближних операторов для аварийной заявки (М3.2/М3.5).
    baseUrl: nonEmpty(process.env.GPS_SERVICE_URL, 'http://localhost:3004').replace(/\/+$/, ''),
    timeoutMs: positiveInt(process.env.GPS_SERVICE_TIMEOUT_MS, 5_000),
    /** Радиус поиска ближних операторов, м (в уставе — 500). */
    nearbyRadiusM: positiveInt(process.env.GPS_NEARBY_RADIUS_M, 500),
  },
  escalation: {
    /**
     * Период сканирования дедлайнов, мс. Сканирование БД выбрано вместо Bull/Redis:
     * дедлайны и так лежат в заявке, а Redis в тестах не нужен (обоснование — в отчёте).
     */
    intervalMs: positiveInt(process.env.TICKET_ESCALATION_INTERVAL_MS, 30_000),
    /** В env — минуты; в тестах дроби не нужны, поэтому поддерживаем и миллисекунды. */
    newToAcceptMin: positiveInt(process.env.ESCALATION_NEW_TO_ACCEPT_MIN, 5),
    acceptToArriveMin: positiveInt(process.env.ESCALATION_ACCEPT_TO_ARRIVE_MIN, 15),
    arriveToDoneMin: positiveInt(process.env.ESCALATION_ARRIVE_TO_DONE_MIN, 60),
    /** Выключатель для e2e/отладки: TICKET_ESCALATION_ENABLED=false. */
    enabled: (process.env.TICKET_ESCALATION_ENABLED ?? 'true') !== 'false',
  },
});
