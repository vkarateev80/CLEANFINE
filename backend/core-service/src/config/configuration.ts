/**
 * Конфигурация core-service. Значения из корневого .env (как в auth/file).
 */

export const DEFAULT_PORT = 3003;

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default () => ({
  port: positiveInt(process.env.PORT, DEFAULT_PORT),
  jwt: {
    // Тот же секрет, что у auth-service: токены auth действуют в core-service.
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
  },
  /**
   * Базовый URL file-service — core загружает планы этажей через его API (М2.3),
   * а не ходит в MinIO напрямую (границы сервисов: файлы знает только file-service).
   */
  fileService: {
    baseUrl: process.env.FILE_SERVICE_URL ?? 'http://localhost:3002',
    timeoutMs: positiveInt(process.env.FILE_SERVICE_TIMEOUT_MS, 15_000),
  },
});
