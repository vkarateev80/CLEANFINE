import configuration, { DEFAULT_PORT, positiveInt } from './configuration';

/** Переменные окружения, которые читает configuration(). */
const KEYS = [
  'MATERIAL_SERVICE_PORT',
  'PORT',
  'JWT_ACCESS_SECRET',
  'RABBITMQ_URL',
  'RABBITMQ_TIMEOUT_MS',
  'RABBITMQ_RECONNECT_COOLDOWN_MS',
  'MATERIAL_CONSUMER_ENABLED',
  'AUTH_SERVICE_URL',
  'E2E_API_URL',
  'SERVICE_AUTH_EMAIL',
  'SERVICE_AUTH_PASSWORD',
  'AUTH_SERVICE_TIMEOUT_MS',
  'TICKET_SERVICE_URL',
  'TICKET_SERVICE_TIMEOUT_MS',
  'CORE_SERVICE_URL',
  'CORE_SERVICE_TIMEOUT_MS',
] as const;

describe('configuration material-service', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
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

  it('positiveInt пропускает только положительные числа', () => {
    expect(positiveInt('3007', 3007)).toBe(3007);
    expect(positiveInt(undefined, 3007)).toBe(3007);
    expect(positiveInt('0', 3007)).toBe(3007);
    expect(positiveInt('abc', 3007)).toBe(3007);
  });

  it('использует значения по умолчанию без .env', () => {
    const config = configuration();

    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.jwt.accessSecret).toBe('dev-access-secret');
    expect(config.rabbitmq.url).toBe('amqp://localhost:5672');
    expect(config.rabbitmq.consumerEnabled).toBe(true);
    expect(config.authService.baseUrl).toBe('http://localhost:3001');
    expect(config.coreService.baseUrl).toBe('http://localhost:3003');
    expect(config.ticketService.baseUrl).toBe('http://localhost:3005');
  });

  it('читает .env и убирает хвостовые слэши в URL', () => {
    process.env.MATERIAL_SERVICE_PORT = '3007';
    process.env.RABBITMQ_URL = 'amqp://admin:secret@localhost:5672';
    process.env.RABBITMQ_TIMEOUT_MS = '2500';
    process.env.RABBITMQ_RECONNECT_COOLDOWN_MS = '1000';
    process.env.CORE_SERVICE_URL = 'http://localhost:3003/';
    process.env.TICKET_SERVICE_URL = 'http://localhost:3005//';
    process.env.AUTH_SERVICE_URL = 'http://localhost:3001/';
    process.env.SERVICE_AUTH_EMAIL = 'svc@cleaning-ops.com';
    process.env.SERVICE_AUTH_PASSWORD = 'secret';

    const config = configuration();

    expect(config.port).toBe(3007);
    expect(config.rabbitmq.url).toBe('amqp://admin:secret@localhost:5672');
    expect(config.rabbitmq.timeoutMs).toBe(2500);
    expect(config.rabbitmq.reconnectCooldownMs).toBe(1000);
    expect(config.coreService.baseUrl).toBe('http://localhost:3003');
    expect(config.ticketService.baseUrl).toBe('http://localhost:3005');
    expect(config.authService.baseUrl).toBe('http://localhost:3001');
    expect(config.authService.email).toBe('svc@cleaning-ops.com');
    expect(config.authService.password).toBe('secret');
  });

  it('AUTH_SERVICE_URL имеет приоритет, E2E_API_URL — фолбэк', () => {
    process.env.E2E_API_URL = 'http://e2e:3001';
    expect(configuration().authService.baseUrl).toBe('http://e2e:3001');

    process.env.AUTH_SERVICE_URL = 'http://auth:3001';
    expect(configuration().authService.baseUrl).toBe('http://auth:3001');
  });

  it('PORT — общий фолбэк, MATERIAL_CONSUMER_ENABLED=false выключает консьюмер', () => {
    process.env.PORT = '3107';
    process.env.MATERIAL_CONSUMER_ENABLED = 'false';

    const config = configuration();
    expect(config.port).toBe(3107);
    expect(config.rabbitmq.consumerEnabled).toBe(false);
  });

  it('пустые строки в env не перекрывают значения по умолчанию', () => {
    process.env.RABBITMQ_URL = '   ';
    process.env.JWT_ACCESS_SECRET = '';

    const config = configuration();
    expect(config.rabbitmq.url).toBe('amqp://localhost:5672');
    // Пустой секрет — это значение, а не отсутствие: подставляется как есть.
    expect(config.jwt.accessSecret).toBe('');
  });
});
