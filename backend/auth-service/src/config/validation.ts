/**
 * Валидация переменных окружения при старте (устав: config/validation.ts).
 * Подключается через `ConfigModule.forRoot({ validate: validateEnv })`.
 *
 * В dev допускаются значения по умолчанию из configuration.ts (но о них предупреждаем);
 * в prod секреты обязательны, не могут быть заглушками и не могут совпадать.
 * Формат TTL проверяется всегда — кривой TTL не зависит от окружения.
 */

/** Значения-заглушки из .env.example — в prod недопустимы. */
const PLACEHOLDERS = ['change-me', 'change-me-access', 'change-me-refresh', 'dev-access-secret', 'dev-refresh-secret'];

/** Минимальная длина JWT-секрета (256 бит в base64 ≈ 43 символа). */
const MIN_SECRET_LENGTH = 32;

const SECRET_KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

/** Формат TTL для jsonwebtoken: число секунд или строка вида 15m/30d/12h/1w. */
const TTL_PATTERN = /^\d+(ms|s|m|h|d|w|y)?$/;

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const isProd = env.NODE_ENV === 'production';
  const problems: string[] = [];

  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (!value) {
      if (isProd) {
        problems.push(`${key} не задан`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[config] ${key} не задан — используется dev-значение по умолчанию`);
      }
      continue;
    }
    if (typeof value !== 'string') {
      problems.push(`${key} должен быть строкой`);
      continue;
    }
    if (isProd && PLACEHOLDERS.includes(value)) {
      problems.push(`${key} содержит значение-заглушку из .env.example`);
    }
    if (isProd && value.length < MIN_SECRET_LENGTH) {
      problems.push(`${key} короче ${MIN_SECRET_LENGTH} символов`);
    }
  }

  if (isProd) {
    if (!env.DATABASE_URL) {
      problems.push('DATABASE_URL не задан');
    }
    if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      problems.push('JWT_ACCESS_SECRET и JWT_REFRESH_SECRET совпадают — нужны разные секреты');
    }
  }

  for (const key of ['JWT_ACCESS_TTL', 'JWT_REFRESH_TTL']) {
    const value = env[key];
    if (value !== undefined && !TTL_PATTERN.test(String(value))) {
      problems.push(`${key} имеет недопустимый формат: "${String(value)}" (ожидается 15m, 30d, 3600 …)`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Некорректная конфигурация окружения:\n  - ${problems.join('\n  - ')}`);
  }
  return env;
}
