import configuration, { DEFAULT_PORT, positiveInt } from './configuration';

describe('configuration (ticket-service)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('использует dev-значения по умолчанию без .env', () => {
    for (const key of [
      'TICKET_SERVICE_PORT',
      'PORT',
      'JWT_ACCESS_SECRET',
      'RABBITMQ_URL',
      'RABBITMQ_TIMEOUT_MS',
      'GPS_SERVICE_URL',
      'GPS_SERVICE_TIMEOUT_MS',
      'GPS_NEARBY_RADIUS_M',
      'TICKET_ESCALATION_INTERVAL_MS',
      'ESCALATION_NEW_TO_ACCEPT_MIN',
      'ESCALATION_ACCEPT_TO_ARRIVE_MIN',
      'ESCALATION_ARRIVE_TO_DONE_MIN',
      'TICKET_ESCALATION_ENABLED',
    ]) {
      delete process.env[key];
    }

    const cfg = configuration();

    // Порт 3005 и адрес gps 3004 зафиксированы в ПЛАН.md/УСТАВ.md для М3.
    expect(cfg.port).toBe(3005);
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.jwt.accessSecret).toBe('dev-access-secret');
    expect(cfg.rabbitmq.url).toBe('amqp://localhost:5672');
    expect(cfg.rabbitmq.timeoutMs).toBe(5_000);
    expect(cfg.gpsService.baseUrl).toBe('http://localhost:3004');
    expect(cfg.gpsService.timeoutMs).toBe(5_000);
    expect(cfg.gpsService.nearbyRadiusM).toBe(500);
    // Таймеры эскалации из устава: 5 / 15 / 60 минут.
    expect(cfg.escalation.newToAcceptMin).toBe(5);
    expect(cfg.escalation.acceptToArriveMin).toBe(15);
    expect(cfg.escalation.arriveToDoneMin).toBe(60);
    expect(cfg.escalation.intervalMs).toBe(30_000);
    expect(cfg.escalation.enabled).toBe(true);
  });

  it('переопределяется переменными окружения', () => {
    process.env.TICKET_SERVICE_PORT = '4005';
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    process.env.RABBITMQ_URL = 'amqp://rabbit:5672';
    process.env.GPS_SERVICE_URL = 'http://gps:3004/';
    process.env.ESCALATION_NEW_TO_ACCEPT_MIN = '0.05';
    process.env.TICKET_ESCALATION_INTERVAL_MS = '1000';
    process.env.TICKET_ESCALATION_ENABLED = 'false';

    const cfg = configuration();

    expect(cfg.port).toBe(4005);
    // Общий секрет с auth-service: иначе access-токены не пройдут проверку.
    expect(cfg.jwt.accessSecret).toBe('shared-secret');
    expect(cfg.rabbitmq.url).toBe('amqp://rabbit:5672');
    // Хвостовой слэш в URL срезается: иначе получился бы //api/gps/...
    expect(cfg.gpsService.baseUrl).toBe('http://gps:3004');
    // Дробные минуты — для e2e со сжатыми таймерами (0.05 мин = 3 с).
    expect(cfg.escalation.newToAcceptMin).toBe(0.05);
    expect(cfg.escalation.intervalMs).toBe(1000);
    expect(cfg.escalation.enabled).toBe(false);
  });

  it('PORT используется как общий фолбэк, если TICKET_SERVICE_PORT не задан', () => {
    delete process.env.TICKET_SERVICE_PORT;
    process.env.PORT = '4100';

    expect(configuration().port).toBe(4100);
  });

  it.each(['abc', '0', '-1', ''])(
    'нечисловой/неположительный TICKET_SERVICE_PORT (%s) не ломает запуск — берётся дефолт',
    (port) => {
      process.env.TICKET_SERVICE_PORT = port;
      delete process.env.PORT;

      expect(configuration().port).toBe(DEFAULT_PORT);
    },
  );

  it('пустой RABBITMQ_URL и пустой GPS_SERVICE_URL заменяются на dev-адреса', () => {
    process.env.RABBITMQ_URL = '   ';
    process.env.GPS_SERVICE_URL = '';

    const cfg = configuration();

    expect(cfg.rabbitmq.url).toBe('amqp://localhost:5672');
    expect(cfg.gpsService.baseUrl).toBe('http://localhost:3004');
  });

  it('мусор в числовых переменных → дефолт', () => {
    process.env.GPS_SERVICE_TIMEOUT_MS = 'soon';
    process.env.GPS_NEARBY_RADIUS_M = '0';
    process.env.ESCALATION_ARRIVE_TO_DONE_MIN = 'abc';
    process.env.TICKET_ESCALATION_INTERVAL_MS = '-5';

    const cfg = configuration();

    expect(cfg.gpsService.timeoutMs).toBe(5_000);
    expect(cfg.gpsService.nearbyRadiusM).toBe(500);
    expect(cfg.escalation.arriveToDoneMin).toBe(60);
    expect(cfg.escalation.intervalMs).toBe(30_000);
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

  it('дробное положительное значение сохраняется: тесты сокращают таймеры', () => {
    expect(positiveInt('0.05', 5)).toBe(0.05);
  });
});
