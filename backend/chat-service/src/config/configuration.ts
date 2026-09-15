/**
 * Конфигурация chat-service. Значения берутся из корневого .env
 * (backend/chat-service → корень репозитория, как в core/ticket/file/auth).
 */

export const DEFAULT_PORT = 3009;

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
  // Порт фиксирован .env (CHAT_SERVICE_PORT); PORT оставлен как общий фолбэк.
  port: positiveInt(process.env.CHAT_SERVICE_PORT ?? process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: токены auth действуют в chat-service
    // и в REST, и в WebSocket-handshake.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  /**
   * Сервисный токен для внутренних вызовов (chat → ticket/core/notification):
   * chat-service логинится в auth-service учётной записью сервиса.
   */
  authService: {
    baseUrl: baseUrl(process.env.AUTH_SERVICE_URL ?? process.env.E2E_API_URL, 'http://localhost:3001'),
    email: nonEmpty(process.env.SERVICE_AUTH_EMAIL, 'admin@cleaning-ops.com'),
    password: nonEmpty(process.env.SERVICE_AUTH_PASSWORD, 'admin123'),
    timeoutMs: positiveInt(process.env.AUTH_SERVICE_TIMEOUT_MS, 5_000),
  },
  // Участники TICKET-чата и проверка «сотрудник заявки» — ticket-service.
  ticketService: {
    baseUrl: baseUrl(process.env.TICKET_SERVICE_URL, 'http://localhost:3005'),
    timeoutMs: positiveInt(process.env.TICKET_SERVICE_TIMEOUT_MS, 5_000),
  },
  // Существование объекта для OBJECT-чата — core-service.
  coreService: {
    baseUrl: baseUrl(process.env.CORE_SERVICE_URL, 'http://localhost:3003'),
    timeoutMs: positiveInt(process.env.CORE_SERVICE_TIMEOUT_MS, 5_000),
  },
  /**
   * Push оффлайн-получателям: REST-вызов notification-service (М5.1).
   * Отдельного routing key для сообщений чата в shared/constants/events.ts нет,
   * а контракт событий меняется только через review архитектора, поэтому
   * используется HTTP-вызов с graceful degradation (см. README).
   */
  notificationService: {
    baseUrl: baseUrl(process.env.NOTIFICATION_SERVICE_URL, 'http://localhost:3006'),
    timeoutMs: positiveInt(process.env.NOTIFICATION_SERVICE_TIMEOUT_MS, 5_000),
    /** Выключатель для отладки: CHAT_PUSH_ENABLED=false. */
    enabled: (process.env.CHAT_PUSH_ENABLED ?? 'true') !== 'false',
  },
  chat: {
    /** Сколько последних сообщений брать в превью списка чатов. */
    lastMessagePreviewLength: positiveInt(process.env.CHAT_PREVIEW_LENGTH, 120),
  },
});
