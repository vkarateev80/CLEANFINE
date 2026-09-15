/**
 * Конфигурация notification-service. Значения из корневого .env (как в core/auth/file).
 */

export const DEFAULT_PORT = 3006;
export const DEFAULT_RABBITMQ_URL = 'amqp://localhost:5672';

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Креды Firebase, достаточные для реального FCM (иначе dev-мок, решение №3). */
export interface FirebaseCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Реальный FCM включается только при полном наборе кредов: в dev они пустые,
 * поэтому сервис поднимается на MockPushSender и не требует firebase-admin.
 */
export function isFirebaseConfigured(credentials: FirebaseCredentials): boolean {
  return Boolean(credentials.projectId && credentials.clientEmail && credentials.privateKey);
}

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
  push: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    // В .env приватный ключ хранится одной строкой с \n — возвращаем переводы строк.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
});
