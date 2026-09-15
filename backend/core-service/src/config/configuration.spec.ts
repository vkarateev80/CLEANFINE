import configuration, { DEFAULT_PORT, positiveInt } from './configuration';

describe('configuration (core-service)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('использует dev-значения по умолчанию', () => {
    // Дефолты — это то, с чем сервис поднимается без .env (локальная разработка).
    delete process.env.PORT;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.FILE_SERVICE_URL;
    delete process.env.FILE_SERVICE_TIMEOUT_MS;

    const cfg = configuration();

    expect(cfg.port).toBe(3003);
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.jwt.accessSecret).toBe('dev-access-secret');
    expect(cfg.fileService.baseUrl).toBe('http://localhost:3002');
    expect(cfg.fileService.timeoutMs).toBe(15_000);
  });

  it('переопределяется переменными окружения', () => {
    process.env.PORT = '4000';
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    process.env.FILE_SERVICE_URL = 'http://files:3002';
    process.env.FILE_SERVICE_TIMEOUT_MS = '2500';

    const cfg = configuration();

    expect(cfg.port).toBe(4000);
    // Общий секрет с auth-service: иначе access-токены не пройдут проверку в core.
    expect(cfg.jwt.accessSecret).toBe('shared-secret');
    expect(cfg.fileService.baseUrl).toBe('http://files:3002');
    expect(cfg.fileService.timeoutMs).toBe(2500);
  });

  it.each(['abc', '0', '-1', ''])(
    'нечисловой/неположительный PORT (%s) не ломает запуск — берётся дефолт',
    (port) => {
      // Порт 0 или NaN означает «случайный порт» — тогда сервис не найти по ожидаемому адресу.
      process.env.PORT = port;

      expect(configuration().port).toBe(DEFAULT_PORT);
    },
  );

  it('дефолтный таймаут file-service, если переменная задана мусором', () => {
    process.env.FILE_SERVICE_TIMEOUT_MS = 'soon';

    expect(configuration().fileService.timeoutMs).toBe(15_000);
  });
});

describe('positiveInt', () => {
  it.each([
    ['50', 5, 50],
    ['0', 5, 5],
    ['-3', 5, 5],
    ['abc', 5, 5],
    [undefined, 5, 5],
    ['', 5, 5],
    ['Infinity', 5, 5],
  ])('значение %s с fallback %s → %s', (value, fallback, expected) => {
    expect(positiveInt(value as string | undefined, fallback)).toBe(expected);
  });

  it('дробное положительное значение сохраняется как есть', () => {
    expect(positiveInt('0.5', 10)).toBe(0.5);
  });
});
