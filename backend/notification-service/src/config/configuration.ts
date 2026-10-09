/**
 * Конфигурация notification-service. Значения из корневого .env (как в core/auth/file).
 */

export const DEFAULT_PORT = 3006;
export const DEFAULT_RABBITMQ_URL = 'amqp://localhost:5672';

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Креды Firebase удалены: Firebase из проекта исключён (27.09.2026). */

export default () => ({
  port: positiveInt(process.env.NOTIFICATION_SERVICE_PORT ?? process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: токены auth действуют в notification-service.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? DEFAULT_RABBITMQ_URL,
    /**
     * Выключатель консьюмера (например, в интеграционных тестах без брокера).
     * Любое значение кроме 'false' — включено.
     */
    enabled: process.env.NOTIFICATION_RABBITMQ_ENABLED !== 'false',
    prefetch: positiveInt(process.env.NOTIFICATION_RABBITMQ_PREFETCH, 10),
    reconnectBaseMs: positiveInt(process.env.NOTIFICATION_RABBITMQ_RECONNECT_MS, 5_000),
  },
  // Канал push (решение 05.10): self-hosted ntfy вместо исключённого Firebase.
  // PUSH_PROVIDER=mock|ntfy (дефолт mock — e2e и юниты без внешнего сервиса).
  push: {
    provider: process.env.PUSH_PROVIDER ?? 'mock',
    ntfyUrl: process.env.NTFY_BASE_URL ?? 'http://ntfy:8080',
    // Web Push (VAPID) для PWA (09.10.2026); без ключей отправка в браузеры выключена.
    webPush: {
      publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '',
      privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? '',
      subject: process.env.WEB_PUSH_SUBJECT ?? 'mailto:admin@cleanfine.ru',
    },
  },
  /**
   * Справочник пользователей auth-service (получатели SOS/эскалаций/смены
   * статусов — бригадиры и админы): сервисный логин как у chat-service.
   */
  authService: {
    baseUrl: (process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
    email: process.env.SERVICE_AUTH_EMAIL || 'admin',
    password: process.env.SERVICE_AUTH_PASSWORD || 'admin123',
    timeoutMs: positiveInt(process.env.AUTH_SERVICE_TIMEOUT_MS, 5_000),
    directoryTtlMs: positiveInt(process.env.NOTIFICATION_DIRECTORY_TTL_MS, 60_000),
  },
});
