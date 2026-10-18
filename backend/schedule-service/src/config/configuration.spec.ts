import configuration, { DEFAULT_PORT, HOUR_MS, positiveInt } from './configuration';

describe('configuration (schedule-service)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('использует dev-значения по умолчанию без .env', () => {
    for (const key of [
      'SCHEDULE_SERVICE_PORT',
      'PORT',
      'JWT_ACCESS_SECRET',
      'RABBITMQ_URL',
      'RABBITMQ_TIMEOUT_MS',
      'AUTH_SERVICE_URL',
      'AUTH_SERVICE_TIMEOUT_MS',
      'SERVICE_AUTH_EMAIL',
      'SERVICE_AUTH_PASSWORD',
      'GPS_SERVICE_URL',
      'GPS_SERVICE_TIMEOUT_MS',
      'TICKET_SERVICE_URL',
      'TICKET_SERVICE_TIMEOUT_MS',
      'CORE_SERVICE_URL',
      'CORE_SERVICE_TIMEOUT_MS',
      'SCHEDULE_MISSED_CHECKIN_INTERVAL_MS',
      'SCHEDULE_AUTO_CHECKOUT_MINUTES',
      'SCHEDULE_GENERATE_INTERVAL_MS',
      'SCHEDULE_GENERATE_HOUR',
      'SCHEDULE_TIME_ZONE',
      'SCHEDULE_CRON_ENABLED',
      'SCHEDULE_BATCH_SIZE',
    ]) {
      delete process.env[key];
    }

    const cfg = configuration();

    // Порт 3008 и адреса зависимостей зафиксированы в .env/ПЛАН.md для М4.
    expect(cfg.port).toBe(3008);
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.jwt.accessSecret).toBe('dev-access-secret');
    expect(cfg.rabbitmq.url).toBe('amqp://localhost:5672');
    expect(cfg.authService.baseUrl).toBe('http://localhost:3001');
    expect(cfg.gpsService.baseUrl).toBe('http://localhost:3004');
    expect(cfg.ticketService.baseUrl).toBe('http://localhost:3005');
    expect(cfg.coreService.baseUrl).toBe('http://localhost:3003');
    // Таймеры М4.5 по умолчанию: неявки раз в 5 минут, авто check-out через 15 минут.
    expect(cfg.schedule.missedCheckinIntervalMs).toBe(5 * 60 * 1000);
    expect(cfg.schedule.autoCheckoutMinutes).toBe(15);
    // Тик генерации раз в час, смены — в полночь по времени расписания (Москва).
    expect(cfg.schedule.generateIntervalMs).toBe(HOUR_MS);
    expect(cfg.schedule.generateHour).toBe(0);
    expect(cfg.schedule.timeZone).toBe('Europe/Moscow');
    expect(cfg.schedule.cronEnabled).toBe(true);
    expect(cfg.schedule.batchSize).toBe(200);
  });

  it('переопределяется переменными окружения и срезает хвостовой слэш', () => {
    process.env.SCHEDULE_SERVICE_PORT = '4008';
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    process.env.RABBITMQ_URL = 'amqp://rabbit:5672';
    process.env.AUTH_SERVICE_URL = 'http://auth:3001/';
    process.env.GPS_SERVICE_URL = 'http://gps:3004/';
    process.env.TICKET_SERVICE_URL = 'http://ticket:3005/';
    process.env.CORE_SERVICE_URL = 'http://core:3003/';
    process.env.SERVICE_AUTH_EMAIL = 'svc@cleaning-ops.com';
    process.env.SERVICE_AUTH_PASSWORD = 'svc-password';
    process.env.SCHEDULE_MISSED_CHECKIN_INTERVAL_MS = '1000';
    process.env.SCHEDULE_AUTO_CHECKOUT_MINUTES = '1';
    process.env.SCHEDULE_GENERATE_INTERVAL_MS = '60000';
    process.env.SCHEDULE_GENERATE_HOUR = '6';
    process.env.SCHEDULE_TIME_ZONE = 'Asia/Bishkek';
    process.env.SCHEDULE_CRON_ENABLED = 'false';

    const cfg = configuration();

    expect(cfg.port).toBe(4008);
    expect(cfg.jwt.accessSecret).toBe('shared-secret');
    expect(cfg.rabbitmq.url).toBe('amqp://rabbit:5672');
    // Хвостовой слэш срезается: иначе получился бы //api/...
    expect(cfg.authService.baseUrl).toBe('http://auth:3001');
    expect(cfg.gpsService.baseUrl).toBe('http://gps:3004');
    expect(cfg.ticketService.baseUrl).toBe('http://ticket:3005');
    expect(cfg.coreService.baseUrl).toBe('http://core:3003');
    expect(cfg.authService.email).toBe('svc@cleaning-ops.com');
    expect(cfg.authService.password).toBe('svc-password');
    expect(cfg.schedule.missedCheckinIntervalMs).toBe(1000);
    expect(cfg.schedule.autoCheckoutMinutes).toBe(1);
    expect(cfg.schedule.generateIntervalMs).toBe(60_000);
    expect(cfg.schedule.generateHour).toBe(6);
    expect(cfg.schedule.timeZone).toBe('Asia/Bishkek');
    expect(cfg.schedule.cronEnabled).toBe(false);
  });

  it('PORT используется как общий фолбэк, если SCHEDULE_SERVICE_PORT не задан', () => {
    delete process.env.SCHEDULE_SERVICE_PORT;
    process.env.PORT = '4108';
    expect(configuration().port).toBe(4108);
  });

  it.each(['abc', '0', '-1', ''])('нечисловой порт %s → дефолт', (port) => {
    process.env.SCHEDULE_SERVICE_PORT = port;
    delete process.env.PORT;
    expect(configuration().port).toBe(DEFAULT_PORT);
  });

  it('пустые URL заменяются на dev-адреса', () => {
    process.env.RABBITMQ_URL = '   ';
    process.env.GPS_SERVICE_URL = '';
    process.env.TICKET_SERVICE_URL = '';
    process.env.AUTH_SERVICE_URL = '';
    process.env.CORE_SERVICE_URL = '';

    const cfg = configuration();

    expect(cfg.rabbitmq.url).toBe('amqp://localhost:5672');
    expect(cfg.gpsService.baseUrl).toBe('http://localhost:3004');
    expect(cfg.ticketService.baseUrl).toBe('http://localhost:3005');
    expect(cfg.authService.baseUrl).toBe('http://localhost:3001');
    expect(cfg.coreService.baseUrl).toBe('http://localhost:3003');
  });

  it('мусор в числовых переменных → дефолт', () => {
    process.env.GPS_SERVICE_TIMEOUT_MS = 'soon';
    process.env.SCHEDULE_MISSED_CHECKIN_INTERVAL_MS = '-5';
    process.env.SCHEDULE_AUTO_CHECKOUT_MINUTES = 'abc';
    process.env.SCHEDULE_BATCH_SIZE = '0';

    const cfg = configuration();

    expect(cfg.gpsService.timeoutMs).toBe(5_000);
    expect(cfg.schedule.missedCheckinIntervalMs).toBe(5 * 60 * 1000);
    expect(cfg.schedule.autoCheckoutMinutes).toBe(15);
    expect(cfg.schedule.batchSize).toBe(200);
  });

  it('час генерации ограничен диапазоном 0..23', () => {
    process.env.SCHEDULE_GENERATE_HOUR = '99';
    expect(configuration().schedule.generateHour).toBe(23);
    process.env.SCHEDULE_GENERATE_HOUR = '-3';
    expect(configuration().schedule.generateHour).toBe(0);
    process.env.SCHEDULE_GENERATE_HOUR = '7.9';
    expect(configuration().schedule.generateHour).toBe(7);
    process.env.SCHEDULE_GENERATE_HOUR = 'не число';
    expect(configuration().schedule.generateHour).toBe(0);
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
});
