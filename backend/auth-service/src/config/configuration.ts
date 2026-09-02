/**
 * Конфигурация auth-service. Значения из .env (корень репозитория),
 * dev-значения по умолчанию — только для локальной разработки.
 */
export default () => ({
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  port: Number(process.env.PORT) || 3001,
});
