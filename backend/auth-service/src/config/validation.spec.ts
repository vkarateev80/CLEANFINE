import { validateEnv } from './validation';

describe('validateEnv', () => {
  const prodEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db:5432/cleaning_ops',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
  };

  describe('production', () => {
    it('пропускает корректный prod-набор', () => {
      expect(validateEnv({ ...prodEnv })).toEqual(prodEnv);
    });

    it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'])(
      'падает, если %s не задан',
      (key) => {
        const env = { ...prodEnv, [key]: undefined };
        expect(() => validateEnv(env)).toThrow(new RegExp(`${key} (не задан|обязателен)`));
      },
    );

    it('падает на значении-заглушке из .env.example', () => {
      expect(() => validateEnv({ ...prodEnv, JWT_ACCESS_SECRET: 'change-me-access' })).toThrow(
        /заглушку/,
      );
    });

    it('падает на слишком коротком секрете', () => {
      expect(() => validateEnv({ ...prodEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(/короче 32/);
    });

    it('падает, если access- и refresh-секреты совпадают', () => {
      const same = 'c'.repeat(48);
      expect(() =>
        validateEnv({ ...prodEnv, JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same }),
      ).toThrow(/совпадают/);
    });

    it('падает, если секрет не строка', () => {
      expect(() => validateEnv({ ...prodEnv, JWT_ACCESS_SECRET: 12345 })).toThrow(/должен быть строкой/);
    });
  });

  describe('development', () => {
    it('не требует секретов и лишь предупреждает', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_ACCESS_SECRET'));
      warn.mockRestore();
    });

    it('допускает dev-значения по умолчанию', () => {
      expect(validateEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'dev-access-secret' })).toBeDefined();
    });
  });

  describe('формат TTL (проверяется в любом окружении)', () => {
    it.each(['15m', '30d', '12h', '3600', '1w'])('принимает %s', (ttl) => {
      expect(() => validateEnv({ ...prodEnv, JWT_ACCESS_TTL: ttl })).not.toThrow();
    });

    it.each(['15 минут', 'abc', '15 m'])('отклоняет %s', (ttl) => {
      expect(() => validateEnv({ ...prodEnv, JWT_ACCESS_TTL: ttl })).toThrow(/недопустимый формат/);
    });

    it('проверяет и JWT_REFRESH_TTL в dev-режиме', () => {
      expect(() => validateEnv({ NODE_ENV: 'development', JWT_REFRESH_TTL: 'тридцать дней' })).toThrow(
        /JWT_REFRESH_TTL/,
      );
    });
  });

  it('собирает все проблемы в одно сообщение', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET[\s\S]*DATABASE_URL/);
  });
});
