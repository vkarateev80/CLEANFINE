/**
 * Конфигурация auth-service. Значения из .env (корень репозитория),
 * dev-значения по умолчанию — только для локальной разработки.
 */

/** Лимит попыток входа на IP (5/мин по чек-листу Auth). */
export const DEFAULT_LOGIN_THROTTLE_LIMIT = 5;
/** Общий лимит запросов на IP. */
export const DEFAULT_GLOBAL_THROTTLE_LIMIT = 100;
/** Окно лимита, мс. */
export const DEFAULT_THROTTLE_TTL_MS = 60_000;

export function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default () => ({
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  // E2E-прогон поднимает лимит, чтобы набор тестов не упирался в rate limit;
  // в проде значения остаются дефолтными (5 и 100).
  throttle: {
    loginLimit: positiveInt(process.env.THROTTLE_LOGIN_LIMIT, DEFAULT_LOGIN_THROTTLE_LIMIT),
    globalLimit: positiveInt(process.env.THROTTLE_GLOBAL_LIMIT, DEFAULT_GLOBAL_THROTTLE_LIMIT),
    ttlMs: positiveInt(process.env.THROTTLE_TTL_MS, DEFAULT_THROTTLE_TTL_MS),
  },
  port: Number(process.env.PORT) || 3001,
  // Сколько прокси перед сервисом (nginx пода = 1, traefik + nginx на k3s = 2):
  // по ним Express восстанавливает адрес клиента для rate limit.
  trustProxyHops: positiveInt(process.env.AUTH_TRUST_PROXY_HOPS, 1),
});
