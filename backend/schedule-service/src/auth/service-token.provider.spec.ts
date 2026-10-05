import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from './service-token.provider';

/** JWT с нужным exp: подпись не проверяется, важен только payload. */
function jwtWithExp(expSecondsFromNow: number): string {
  const payload = { sub: 'service', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function build(values: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    'authService.baseUrl': 'http://localhost:3001',
    'authService.timeoutMs': 5_000,
    'authService.email': 'admin',
    'authService.password': 'admin123',
    ...values,
  };
  const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
  return { provider: new ServiceTokenProvider(config), config };
}

describe('ServiceTokenProvider', () => {
  const originalFetch = global.fetch;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('логинится и возвращает токен', async () => {
    const { provider } = build();
    const token = jwtWithExp(900);
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(201, { accessToken: token }));

    await expect(provider.getAccessToken()).resolves.toBe(token);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin123' }),
      signal: expect.anything(),
    });
  });

  it('кэширует токен между вызовами', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, { accessToken: jwtWithExp(900) }),
    );

    await provider.getAccessToken();
    await provider.getAccessToken();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('параллельные вызовы не устраивают шторм логинов', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, { accessToken: jwtWithExp(900) }),
    );

    await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('перелогинивается после invalidate (401 от сервиса)', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(201, { accessToken: jwtWithExp(900) }))
      .mockResolvedValueOnce(jsonResponse(201, { accessToken: jwtWithExp(900) }));

    await provider.getAccessToken();
    provider.invalidate();
    await provider.getAccessToken();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('перелогинивается, когда истёк короткий токен', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, { accessToken: jwtWithExp(32) }),
    );

    await provider.getAccessToken();
    // TTL = exp - now - 30 с ≈ 2 с, поэтому ждём чуть больше.
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    await provider.getAccessToken();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('мусорный токен не ломает логику (консервативный TTL)', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, { accessToken: 'no-dots-here' }),
    );

    await expect(provider.getAccessToken()).resolves.toBe('no-dots-here');
    await provider.getAccessToken();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('невалидный base64 в payload не роняет провайдер', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(201, { accessToken: 'header.!!!not-base64!!!.signature' }),
    );

    await expect(provider.getAccessToken()).resolves.toBe('header.!!!not-base64!!!.signature');
  });

  it('логинится заново, если TTL истёк (exp в прошлом, ожидание)', async () => {
    jest.useFakeTimers();
    try {
      const { provider } = build();
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(201, { accessToken: jwtWithExp(40) }),
      );

      await provider.getAccessToken();
      // TTL = exp - now - 30 с ≈ 10 с.
      jest.advanceTimersByTime(11_000);
      await provider.getAccessToken();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('без SERVICE_AUTH_* бросает 503 и не ходит в сеть', async () => {
    const { provider } = build({ 'authService.email': '', 'authService.password': '' });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('недоступный auth-service → 503', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(provider.getAccessToken()).rejects.toMatchObject({
      status: 503,
      message: 'Сервис авторизации недоступен',
    });
  });

  it('401 от auth-service → 503', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}));

    await expect(provider.getAccessToken()).rejects.toMatchObject({
      message: 'Не удалось получить служебный токен',
    });
  });

  it('ответ без accessToken → 503', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(201, { refreshToken: 'x' }));

    await expect(provider.getAccessToken()).rejects.toMatchObject({
      message: 'Не удалось получить служебный токен',
    });
  });

  it('не-JSON ответ → 503', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 201,
      json: jest.fn().mockRejectedValue(new Error('not json')),
    } as unknown as Response);

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('после ошибки логина следующая попытка снова идёт в auth', async () => {
    const { provider } = build();
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(jsonResponse(201, { accessToken: jwtWithExp(900) }));

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(provider.getAccessToken()).resolves.toEqual(expect.any(String));
  });
});
