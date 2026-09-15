import configuration, { DEFAULT_PORT, positiveInt } from './configuration';

describe('configuration (chat-service)', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('порт по умолчанию — 3009 (CHAT_SERVICE_PORT)', () => {
    delete process.env.CHAT_SERVICE_PORT;
    delete process.env.PORT;
    const config = configuration() as { port: number };
    expect(config.port).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(3009);
  });

  it('берёт порт из CHAT_SERVICE_PORT, а PORT — как общий фолбэк', () => {
    process.env.CHAT_SERVICE_PORT = '4009';
    expect((configuration() as { port: number }).port).toBe(4009);

    delete process.env.CHAT_SERVICE_PORT;
    process.env.PORT = '5009';
    expect((configuration() as { port: number }).port).toBe(5009);
  });

  it('использует общий секрет JWT_ACCESS_SECRET', () => {
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    const config = configuration() as { jwt: { accessSecret: string } };
    expect(config.jwt.accessSecret).toBe('shared-secret');
  });

  it('подставляет значения по умолчанию для внутренних сервисов', () => {
    delete process.env.TICKET_SERVICE_URL;
    delete process.env.CORE_SERVICE_URL;
    delete process.env.NOTIFICATION_SERVICE_URL;
    delete process.env.SERVICE_AUTH_PASSWORD;

    const config = configuration() as {
      ticketService: { baseUrl: string };
      coreService: { baseUrl: string };
      notificationService: { baseUrl: string; enabled: boolean };
      authService: { password: string };
    };

    expect(config.ticketService.baseUrl).toBe('http://localhost:3005');
    expect(config.coreService.baseUrl).toBe('http://localhost:3003');
    expect(config.notificationService.baseUrl).toBe('http://localhost:3006');
    expect(config.notificationService.enabled).toBe(true);
    expect(config.authService.password).toBe('admin123');
  });

  it('убирает хвостовые слэши в базовых URL', () => {
    process.env.CORE_SERVICE_URL = 'http://core:3003///';
    const config = configuration() as { coreService: { baseUrl: string } };
    expect(config.coreService.baseUrl).toBe('http://core:3003');
  });

  it('пустое значение переменной не перекрывает значение по умолчанию', () => {
    process.env.CORE_SERVICE_URL = '   ';
    const config = configuration() as { coreService: { baseUrl: string } };
    expect(config.coreService.baseUrl).toBe('http://localhost:3003');
  });

  it('выключает push через CHAT_PUSH_ENABLED=false', () => {
    process.env.CHAT_PUSH_ENABLED = 'false';
    const config = configuration() as { notificationService: { enabled: boolean } };
    expect(config.notificationService.enabled).toBe(false);
  });

  it('positiveInt отбрасывает некорректные значения', () => {
    expect(positiveInt('12', 5)).toBe(12);
    expect(positiveInt('0', 5)).toBe(5);
    expect(positiveInt('-3', 5)).toBe(5);
    expect(positiveInt('abc', 5)).toBe(5);
    expect(positiveInt(undefined, 5)).toBe(5);
  });
});
