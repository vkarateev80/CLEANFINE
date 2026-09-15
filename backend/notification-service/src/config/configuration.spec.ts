import configuration, {
  DEFAULT_PORT,
  DEFAULT_RABBITMQ_URL,
  isFirebaseConfigured,
  positiveInt,
} from './configuration';

describe('configuration (notification-service)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function clearEnv(): void {
    for (const name of [
      'NOTIFICATION_SERVICE_PORT',
      'PORT',
      'JWT_ACCESS_SECRET',
      'RABBITMQ_URL',
      'NOTIFICATION_RABBITMQ_ENABLED',
      'NOTIFICATION_RABBITMQ_PREFETCH',
      'NOTIFICATION_RABBITMQ_RECONNECT_MS',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]) {
      delete process.env[name];
    }
  }

  it('использует dev-значения по умолчанию (запуск без .env)', () => {
    clearEnv();

    const cfg = configuration();

    expect(cfg.port).toBe(3006);
    expect(cfg.port).toBe(DEFAULT_PORT);
    // Общий секрет с auth-service объявлен в конфиге: с другим именем ключа
    // токены auth молча перестали бы проходить проверку.
    expect(cfg.jwt.accessSecret).toBe('dev-access-secret');
    expect(cfg.rabbitmq.url).toBe(DEFAULT_RABBITMQ_URL);
    expect(cfg.rabbitmq.enabled).toBe(true);
    expect(cfg.rabbitmq.prefetch).toBe(10);
    expect(cfg.rabbitmq.reconnectBaseMs).toBe(5_000);
    // Пустые FIREBASE_* — это и есть dev-режим (решение №3): мок вместо FCM.
    expect(cfg.push).toEqual({ projectId: '', clientEmail: '', privateKey: '' });
  });

  it('переопределяется переменными окружения', () => {
    clearEnv();
    process.env.NOTIFICATION_SERVICE_PORT = '4006';
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    process.env.RABBITMQ_URL = 'amqp://rabbit:5672';
    process.env.NOTIFICATION_RABBITMQ_ENABLED = 'false';
    process.env.NOTIFICATION_RABBITMQ_PREFETCH = '25';
    process.env.NOTIFICATION_RABBITMQ_RECONNECT_MS = '1000';
    process.env.FIREBASE_PROJECT_ID = 'cleaning-ops';
    process.env.FIREBASE_CLIENT_EMAIL = 'svc@cleaning-ops.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = 'line1\\nline2';

    const cfg = configuration();

    expect(cfg.port).toBe(4006);
    expect(cfg.jwt.accessSecret).toBe('shared-secret');
    expect(cfg.rabbitmq.url).toBe('amqp://rabbit:5672');
    expect(cfg.rabbitmq.enabled).toBe(false);
    expect(cfg.rabbitmq.prefetch).toBe(25);
    expect(cfg.rabbitmq.reconnectBaseMs).toBe(1_000);
    expect(cfg.push.projectId).toBe('cleaning-ops');
    // В .env ключ хранится одной строкой: сервис обязан вернуть реальные переводы строк.
    expect(cfg.push.privateKey).toBe('line1\nline2');
  });

  it('откатывается на PORT, если NOTIFICATION_SERVICE_PORT не задан', () => {
    clearEnv();
    process.env.PORT = '9100';

    expect(configuration().port).toBe(9100);
  });

  it.each(['abc', '0', '-1', ''])(
    'нечисловой/неположительный NOTIFICATION_SERVICE_PORT (%s) не ломает запуск — берётся дефолт',
    (port) => {
      // Порт 0 означает «случайный порт»: сервис поднялся бы не по ожидаемому адресу.
      clearEnv();
      process.env.NOTIFICATION_SERVICE_PORT = port;

      expect(configuration().port).toBe(DEFAULT_PORT);
    },
  );

  it('мусор в prefetch и reconnect не ломает конфиг', () => {
    clearEnv();
    process.env.NOTIFICATION_RABBITMQ_PREFETCH = 'soon';
    process.env.NOTIFICATION_RABBITMQ_RECONNECT_MS = 'later';

    const cfg = configuration();

    expect(cfg.rabbitmq.prefetch).toBe(10);
    expect(cfg.rabbitmq.reconnectBaseMs).toBe(5_000);
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

describe('isFirebaseConfigured', () => {
  const full = { projectId: 'p', clientEmail: 'e', privateKey: 'k' };

  it('полный набор кредов включает реальный FCM', () => {
    expect(isFirebaseConfigured(full)).toBe(true);
  });

  it.each(['projectId', 'clientEmail', 'privateKey'] as const)(
    'без %s остаётся dev-мок',
    (missing) => {
      expect(isFirebaseConfigured({ ...full, [missing]: '' })).toBe(false);
    },
  );
});
