import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider, tokenTtlMs } from './service-token.provider';

function createConfig(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'authService.baseUrl') return 'http://localhost:3001';
      if (key === 'authService.email') return 'admin@cleaning-ops.com';
      if (key === 'authService.password') return 'admin123';
      if (key === 'authService.timeoutMs') return 1000;
      return undefined;
    }),
  } as unknown as ConfigService;
}

/** JWT с заданным exp (без подписи — сервис читает только payload). */
function jwt(expSecondsFromNow: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
    'utf8',
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('ServiceTokenProvider (М4.2)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('логинится, кэширует токен и не логинится повторно', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { accessToken: jwt(600) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());

    const first = await provider.getToken();
    const second = await provider.getToken();

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: 'admin@cleaning-ops.com', password: 'admin123' }),
      }),
    );
  });

  it('после invalidate() логинится заново (перелогин при 401)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { accessToken: jwt(600) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());

    await provider.getToken();
    provider.invalidate();
    await provider.getToken(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('параллельные вызовы не устраивают лавину логинов', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { accessToken: jwt(600) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());

    const tokens = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);

    expect(new Set(tokens).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 от auth и отсутствие accessToken → null', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, {})) as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());
    await expect(provider.getToken()).resolves.toBeNull();

    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {})) as unknown as typeof fetch;
    provider.invalidate();
    await expect(provider.getToken(true)).resolves.toBeNull();
  });

  it('недоступный auth-service → null без исключения', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());
    await expect(provider.getToken()).resolves.toBeNull();
  });

  it('токен с истёкшим exp считается протухшим сразу', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { accessToken: jwt(-10) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());

    await provider.getToken();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('непрозрачный токен кэшируется на fallback-TTL', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { accessToken: 'opaque-token' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new ServiceTokenProvider(createConfig());

    expect(await provider.getToken()).toBe('opaque-token');
    expect(await provider.getToken()).toBe('opaque-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('tokenTtlMs', () => {
  it('читает exp из payload и учитывает запас', () => {
    const ttl = tokenTtlMs(jwt(600));
    expect(ttl).toBeGreaterThan(500_000);
    expect(ttl).toBeLessThanOrEqual(600_000);

    expect(tokenTtlMs(jwt(-10))).toBe(0);
    expect(tokenTtlMs('opaque')).toBeNull();
    expect(tokenTtlMs('a.%%%.c')).toBeNull();
    expect(
      tokenTtlMs(`h.${Buffer.from(JSON.stringify({ sub: 'u' }), 'utf8').toString('base64url')}.s`),
    ).toBeNull();
  });
});
