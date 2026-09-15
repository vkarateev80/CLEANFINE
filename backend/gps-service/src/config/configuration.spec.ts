import configuration, {
  DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_MAX_BATCH_SIZE,
  DEFAULT_NEARBY_MAX_AGE_MINUTES,
  DEFAULT_PORT,
  positiveInt,
} from './configuration';

describe('configuration (gps-service)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('использует dev-значения по умолчанию (без .env)', () => {
    delete process.env.GPS_SERVICE_PORT;
    delete process.env.PORT;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.RABBITMQ_URL;
    delete process.env.RABBITMQ_ENABLED;
    delete process.env.EVENTS_EXCHANGE;
    delete process.env.GPS_NEARBY_MAX_AGE_MINUTES;
    delete process.env.GPS_MAX_BATCH_SIZE;
    delete process.env.GPS_GEOFENCE_SEARCH_RADIUS_METERS;
    delete process.env.GPS_HISTORY_LIMIT;

    const cfg = configuration();

    expect(cfg.port).toBe(3004);
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.jwt.accessSecret).toBe('dev-access-secret');
    expect(cfg.rabbitmq.url).toBe('');
    expect(cfg.rabbitmq.enabled).toBe(true);
    // Общий exchange Cleaning Ops приходит из shared/constants/events.
    expect(cfg.rabbitmq.exchange).toBe('cleaning-ops.events');
    expect(cfg.gps.nearbyMaxAgeMinutes).toBe(DEFAULT_NEARBY_MAX_AGE_MINUTES);
    expect(cfg.gps.maxBatchSize).toBe(DEFAULT_MAX_BATCH_SIZE);
    expect(cfg.gps.geofenceSearchRadiusMeters).toBe(DEFAULT_GEOFENCE_SEARCH_RADIUS_METERS);
    expect(cfg.gps.historyLimit).toBe(DEFAULT_HISTORY_LIMIT);
  });

  it('переопределяется переменными окружения', () => {
    process.env.GPS_SERVICE_PORT = '4104';
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    process.env.RABBITMQ_URL = 'amqp://admin:secret@rabbit:5672';
    process.env.EVENTS_EXCHANGE = 'custom.events';
    process.env.GPS_NEARBY_MAX_AGE_MINUTES = '10';
    process.env.GPS_MAX_BATCH_SIZE = '250';
    process.env.GPS_GEOFENCE_SEARCH_RADIUS_METERS = '1500';
    process.env.GPS_HISTORY_LIMIT = '50';

    const cfg = configuration();

    expect(cfg.port).toBe(4104);
    // Общий секрет с auth-service: иначе access-токены не пройдут проверку в gps.
    expect(cfg.jwt.accessSecret).toBe('shared-secret');
    expect(cfg.rabbitmq.url).toBe('amqp://admin:secret@rabbit:5672');
    expect(cfg.rabbitmq.exchange).toBe('custom.events');
    expect(cfg.gps.nearbyMaxAgeMinutes).toBe(10);
    expect(cfg.gps.maxBatchSize).toBe(250);
    expect(cfg.gps.geofenceSearchRadiusMeters).toBe(1500);
    expect(cfg.gps.historyLimit).toBe(50);
  });

  it('PORT используется как fallback, если GPS_SERVICE_PORT не задан', () => {
    delete process.env.GPS_SERVICE_PORT;
    process.env.PORT = '3204';

    expect(configuration().port).toBe(3204);
  });

  it('RABBITMQ_ENABLED=false выключает публикацию событий', () => {
    process.env.RABBITMQ_ENABLED = 'false';

    expect(configuration().rabbitmq.enabled).toBe(false);
  });

  it('любое другое значение RABBITMQ_ENABLED оставляет публикацию включённой', () => {
    process.env.RABBITMQ_ENABLED = '1';

    expect(configuration().rabbitmq.enabled).toBe(true);
  });

  it.each(['abc', '0', '-1', ''])(
    'нечисловой/неположительный GPS_SERVICE_PORT (%s) не ломает запуск — берётся дефолт',
    (port) => {
      process.env.GPS_SERVICE_PORT = port;
      delete process.env.PORT;

      expect(configuration().port).toBe(DEFAULT_PORT);
    },
  );

  it('мусорные значения окон не ломают запуск — берутся дефолты', () => {
    process.env.GPS_NEARBY_MAX_AGE_MINUTES = 'soon';
    process.env.GPS_MAX_BATCH_SIZE = '0';
    process.env.GPS_HISTORY_LIMIT = '-5';

    const cfg = configuration();

    expect(cfg.gps.nearbyMaxAgeMinutes).toBe(DEFAULT_NEARBY_MAX_AGE_MINUTES);
    expect(cfg.gps.maxBatchSize).toBe(DEFAULT_MAX_BATCH_SIZE);
    expect(cfg.gps.historyLimit).toBe(DEFAULT_HISTORY_LIMIT);
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
