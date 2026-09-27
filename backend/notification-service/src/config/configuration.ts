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
  port: positiveInt(
    process.env.NOTIFICATION_SERVICE_PORT ?? process.env.PORT,
    DEFAULT_PORT,
  ),
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
  // Блока push больше нет: Firebase исключён из проекта (27.09.2026),
  // канал push — только MockPushSender (провайдер PUSH_SENDER в модуле).
});
