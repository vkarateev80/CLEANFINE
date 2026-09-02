/**
 * Валидация обязательных переменных окружения при старте (устав: config/validation.ts).
 * В dev допускаются значения по умолчанию (configuration.ts); в prod — обязательны.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  if (env.NODE_ENV === 'production') {
    for (const key of required) {
      if (!env[key]) {
        throw new Error(`Отсутствует обязательная переменная окружения: ${key}`);
      }
    }
  }
  return env;
}
