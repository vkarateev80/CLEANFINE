import configuration from './configuration';

describe('configuration', () => {
  const KEYS = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_TTL',
    'JWT_REFRESH_TTL',
    'PORT',
  ] as const;

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('возвращает dev-значения по умолчанию', () => {
    const config = configuration();
    expect(config.jwt.accessSecret).toBe('dev-access-secret');
    expect(config.jwt.refreshSecret).toBe('dev-refresh-secret');
    expect(config.jwt.accessTtl).toBe('15m');
    expect(config.jwt.refreshTtl).toBe('30d');
    expect(config.port).toBe(3001);
  });

  it('читает значения из окружения', () => {
    process.env.JWT_ACCESS_SECRET = 'acc';
    process.env.JWT_REFRESH_SECRET = 'ref';
    process.env.JWT_ACCESS_TTL = '5m';
    process.env.JWT_REFRESH_TTL = '7d';
    process.env.PORT = '4000';

    const config = configuration();
    expect(config.jwt).toEqual({
      accessSecret: 'acc',
      refreshSecret: 'ref',
      accessTtl: '5m',
      refreshTtl: '7d',
    });
    expect(config.port).toBe(4000);
  });

  it('падает на нечисловой PORT обратно к 3001', () => {
    process.env.PORT = 'not-a-number';
    expect(configuration().port).toBe(3001);
  });
});
