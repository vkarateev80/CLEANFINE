import { ServiceTokenProvider, tokenTtlMs } from './service-token.provider';
import type { ConfigService } from '@nestjs/config';

/** Токен с заданным exp (секунды от now). */
function jwtWithExp(secondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'svc', exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

function configMock(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'authService.baseUrl': 'http://localhost:3001',
    'authService.email': 'admin@cleaning-ops.com',
    'authService.password': 'admin123',
    'authService.timeoutMs': 1_000,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('ServiceTokenProvider (chat-service)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('логинится в auth-service и кэширует токен', async () => {
    const token = jwtWithExp(600);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: token }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ServiceTokenProvider(configMock());

    await expect(provider.getToken()).resolves.toBe(token);
    await expect(provider.getToken()).resolves.toBe(token);
    // Второй вызов берёт токен из кэша — логина больше нет.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/auth/login');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: 'admin@cleaning-ops.com',
      password: 'admin123',
    });
  });

  it('возвращает null, если auth-service ответил ошибкой', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(new ServiceTokenProvider(configMock()).getToken()).resolves.toBeNull();
  });

  it('возвращает null, если в ответе нет accessToken', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tokenType: 'Bearer' }),
    }) as unknown as typeof fetch;

    await expect(new ServiceTokenProvider(configMock()).getToken()).resolves.toBeNull();
  });

  it('переживает недоступность auth-service', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(new ServiceTokenProvider(configMock()).getToken()).resolves.toBeNull();
  });

  it('непрозрачный токен (без exp) работает по fallback-TTL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'opaque-token' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ServiceTokenProvider(configMock());
    await expect(provider.getToken()).resolves.toBe('opaque-token');
    // Кэш действует: повторный вызов не логинится снова.
    await expect(provider.getToken()).resolves.toBe('opaque-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('invalidate() заставляет перелогиниться', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: jwtWithExp(600) }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ServiceTokenProvider(configMock());
    await provider.getToken();
    provider.invalidate();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('force=true игнорирует кэш', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: jwtWithExp(600) }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ServiceTokenProvider(configMock());
    await provider.getToken();
    await provider.getToken(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('параллельные вызовы выполняют один логин', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: jwtWithExp(600) }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ServiceTokenProvider(configMock());
    await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('tokenTtlMs', () => {
  it('считает срок жизни из exp с запасом', () => {
    const ttl = tokenTtlMs(jwtWithExp(600));
    expect(ttl).toBeGreaterThan(500_000);
    expect(ttl).toBeLessThanOrEqual(600_000);
  });

  it('возвращает null для непрозрачного токена и мусора', () => {
    expect(tokenTtlMs('opaque-token')).toBeNull();
    expect(tokenTtlMs('a.!!!not-base64-json!!!')).toBeNull();
  });

  it('возвращает null, если exp отсутствует, и 0 для истёкшего токена', () => {
    const noExp = `a.${Buffer.from(JSON.stringify({ sub: 'svc' })).toString('base64url')}.c`;
    expect(tokenTtlMs(noExp)).toBeNull();
    expect(tokenTtlMs(jwtWithExp(-60))).toBe(0);
  });
});
