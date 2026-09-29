/**
 * Конфигурация material-service. Значения берутся из корневого .env
 * (backend/material-service → корень репозитория, как в core/ticket/file/auth).
 */

export const DEFAULT_PORT = 3007;

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Строка, которая может быть пустой: пустое значение → fallback. */
function nonEmpty(value: string | undefined, fallback: string): string {
  return value && value.trim() !== '' ? value : fallback;
}

/** Базовый URL без хвостовых слэшей — иначе склейка путей даёт `//api/...`. */
function baseUrl(value: string | undefined, fallback: string): string {
  return nonEmpty(value, fallback).replace(/\/+$/, '');
}

export default () => ({
  // Порт фиксирован .env (MATERIAL_SERVICE_PORT); PORT оставлен как общий фолбэк.
  port: positiveInt(process.env.MATERIAL_SERVICE_PORT ?? process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: токены auth действуют в material-service.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  rabbitmq: {
    // Общая шина событий: exchange cleaning-ops.events (shared/constants/events.ts).
    url: nonEmpty(process.env.RABBITMQ_URL, 'amqp://localhost:5672'),
    /** Сколько ждать подключения к брокеру, прежде чем сдаться (мс). */
    timeoutMs: positiveInt(process.env.RABBITMQ_TIMEOUT_MS, 5_000),
    /** Пауза между попытками подключения — чтобы не ждать таймаут на каждом сообщении. */
    reconnectCooldownMs: positiveInt(process.env.RABBITMQ_RECONNECT_COOLDOWN_MS, 10_000),
    /** Выключатель консьюмера для отладки: MATERIAL_CONSUMER_ENABLED=false. */
    consumerEnabled: (process.env.MATERIAL_CONSUMER_ENABLED ?? 'true') !== 'false',
  },
  /**
   * Сервисный токен для внутренних вызовов (ticket → core): material-service
   * логинится в auth-service учётной записью сервиса (SERVICE_AUTH_*).
   */
  authService: {
    baseUrl: baseUrl(
      process.env.AUTH_SERVICE_URL ?? process.env.E2E_API_URL,
      'http://localhost:3001',
    ),
    email: nonEmpty(process.env.SERVICE_AUTH_EMAIL, 'admin@cleaning-ops.com'),
    password: nonEmpty(process.env.SERVICE_AUTH_PASSWORD, 'admin123'),
    timeoutMs: positiveInt(process.env.AUTH_SERVICE_TIMEOUT_MS, 5_000),
  },
  // Цепочка получения материалов операции (М4.2): ticket → core(room) → core(tech-card).
  ticketService: {
    baseUrl: baseUrl(process.env.TICKET_SERVICE_URL, 'http://localhost:3005'),
    timeoutMs: positiveInt(process.env.TICKET_SERVICE_TIMEOUT_MS, 5_000),
  },
  coreService: {
    baseUrl: baseUrl(process.env.CORE_SERVICE_URL, 'http://localhost:3003'),
    timeoutMs: positiveInt(process.env.CORE_SERVICE_TIMEOUT_MS, 5_000),
  },
});
