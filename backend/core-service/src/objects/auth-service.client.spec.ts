import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthServiceClient } from './auth-service.client';

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

/** Ответ логина: сервисный токен. */
function loginResponse(): Response {
  return jsonResponse(201, { accessToken: jwtWithExp(900), refreshToken: 'refresh' });
}

/** Полный SafeUser, как его отдаёт auth-service: клиент обязан взять только 3 поля. */
function safeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'client-1',
    email: 'client@example.com',
    phone: '+7 495 000-00-00',
    fullName: 'ООО «Ромашка»',
    role: 'CLIENT',
    avatarUrl: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function build(values: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    'authService.baseUrl': 'http://auth:3001',
    'authService.timeoutMs': 5_000,
    'authService.email': 'admin@cleaning-ops.com',
    'authService.password': 'admin123',
    ...values,
  };
  const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
  return new AuthServiceClient(config);
}

describe('AuthServiceClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  describe('успешная проверка', () => {
    it('логинится служебной учёткой и проверяет аккаунт по id', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser()));

      await expect(build().assertClientAccount('client-1')).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://auth:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: 'admin@cleaning-ops.com', password: 'admin123' }),
        signal: expect.anything(),
      });
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://auth:3001/api/users/client-1',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('кэширует служебный токен: второй вызов не логинится снова', async () => {
      // Без кэша каждое сохранение объекта ело бы лимит логина 5/мин/IP.
      const client = build();
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ id: 'client-1' })))
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ id: 'client-2' })));

      await client.assertClientAccount('client-1');
      await client.assertClientAccount('client-2');

      const loginCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/login'));
      expect(loginCalls).toHaveLength(1);
    });

    it('параллельные проверки не устраивают шторм логинов', async () => {
      const client = build();
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValue(jsonResponse(200, safeUser()));

      await Promise.all([
        client.assertClientAccount('client-1'),
        client.assertClientAccount('client-1'),
        client.assertClientAccount('client-1'),
      ]);

      const loginCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/login'));
      expect(loginCalls).toHaveLength(1);
    });

    it('экранирует id в URL', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ id: 'a/b c' })));

      await build().assertClientAccount('a/b c');

      expect(fetchMock.mock.calls[1][0]).toBe('http://auth:3001/api/users/a%2Fb%20c');
    });

    it('таймаут вызова берётся из AUTH_SERVICE_TIMEOUT_MS (дефолт 5 с)', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser()));

      await build({ 'authService.timeoutMs': 1_234 }).assertClientAccount('client-1');

      expect(timeoutSpy).toHaveBeenCalledWith(1_234);
      timeoutSpy.mockRestore();
    });

    it('таймаут применяется и к GET /api/users/:id, а не только к логину', async () => {
      // Если ограничить только логин, зависший GET подвесит сохранение объекта
      // (ADR-05: недоступность auth не должна держать запись дольше таймаута).
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser()));

      const client = build({ 'authService.baseUrl': 'http://auth:3001' });
      await client.assertClientAccount('client-1');

      // Один таймаут на логин и один на GET.
      expect(timeoutSpy).toHaveBeenCalledTimes(2);
      const [, usersCall] = fetchMock.mock.calls;
      expect(usersCall[0]).toBe('http://auth:3001/api/users/client-1');
      expect(usersCall[1].signal).toBeInstanceOf(AbortSignal);
      timeoutSpy.mockRestore();
    });

    it('истёкший токен не переиспользуется: берётся новый (кэш по exp)', async () => {
      // Токен с коротким TTL: после его истечения следующий вызов обязан
      // залогиниться заново, иначе каждый второй запрос ловил бы 401.
      // Время подменяем через fake timers — тест не должен зависеть от скорости машины.
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      try {
        const shortLived = jwtWithExp(60);

        const client = build();
        fetchMock
          .mockResolvedValueOnce(jsonResponse(201, { accessToken: shortLived }))
          .mockResolvedValueOnce(jsonResponse(200, safeUser()))
          .mockResolvedValueOnce(loginResponse())
          .mockResolvedValueOnce(jsonResponse(200, safeUser()));

        await client.assertClientAccount('client-1');

        // Прошли TTL + skew (60 + 30 с) — токен в кэше считается протухшим.
        jest.setSystemTime(Date.now() + 120_000);
        await client.assertClientAccount('client-1');

        const loginCalls = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/login'),
        );
        expect(loginCalls).toHaveLength(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('служебный токен не утекает в ответы и не логируется', async () => {
      // NFR-01: наружу отдаём только результат проверки; сам токен — внутренняя деталь.
      const client = build();
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser()));

      await expect(client.assertClientAccount('client-1')).resolves.toBeUndefined();

      const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls]
        .flat()
        .map((value) => String(value))
        .join(' ');
      expect(logged).not.toContain('mock-token');
    });
  });

  describe('таблица поведения §6', () => {
    it('SERVICE_AUTH_* не заданы → 503, в сеть не ходим', async () => {
      const client = build({ 'authService.email': '', 'authService.password': '' });

      // Один вызов — одна проверка: мок fetch не рассчитан на повторные сценарии,
      // поэтому ошибку ловим и сверяем её тип и текст отдельно.
      const error = await client.assertClientAccount('client-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).message).toBe(
        'Служебная учётная запись не настроена (SERVICE_AUTH_EMAIL/SERVICE_AUTH_PASSWORD)',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('сеть недоступна (auth-service лежит) → 503', async () => {
      fetchMock.mockRejectedValue(new Error('fetch failed'));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        'Не удалось проверить аккаунт заказчика',
      );
    });

    it('таймаут вызова → 503', async () => {
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      fetchMock.mockRejectedValue(timeoutError);

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('5xx от auth-service → 503', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        'Не удалось проверить аккаунт заказчика',
      );
    });

    it('ошибка логина (401 на /api/auth/login) → 503', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Неверный пароль' }));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('ответ логина без accessToken → 503', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { refreshToken: 'x' }));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('404 → 400 «Аккаунт заказчика не найден»', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(404, { message: 'Пользователь не найден' }));

      const error = await build()
        .assertClientAccount('ghost')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe('Аккаунт заказчика не найден');
    });

    it('200 с ролью ADMIN → 400 «Аккаунт не является клиентом»', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ role: 'ADMIN' })));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        'Аккаунт не является клиентом',
      );
    });

    it('200 с ролью SUPERVISOR → 400 «Аккаунт не является клиентом»', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ role: 'SUPERVISOR' })));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(BadRequestException);
    });

    it('200 с isActive=false → 400 «Аккаунт клиента деактивирован»', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ isActive: false })));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        'Аккаунт клиента деактивирован',
      );
    });

    it('401 → токен сбрасывается, один повтор; успешный повтор пропускает запись', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(401, { message: 'jwt expired' }))
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser()));

      await expect(build().assertClientAccount('client-1')).resolves.toBeUndefined();

      const loginCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/login'));
      expect(loginCalls).toHaveLength(2);
    });

    it('401 дважды подряд → 503 (без бесконечного цикла)', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(401, {}))
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(401, {}));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      // ровно 2 логина и 2 GET — попыток не больше двух
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('403 (служебная учётка потеряла ADMIN) → 503 с записью в лог', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(403, { message: 'Forbidden' }))
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(403, { message: 'Forbidden' }));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('auth-service отклонил служебный токен (403)'),
      );
    });

    it('200 без id/role → 503 (ответ не той формы)', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, { role: 'CLIENT', isActive: true }));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('200 с чужим id в ответе → 503 (проверяем именно запрошенный аккаунт)', async () => {
      fetchMock
        .mockResolvedValueOnce(loginResponse())
        .mockResolvedValueOnce(jsonResponse(200, safeUser({ id: 'someone-else' })));

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('не-JSON ответ → 503, а не падение', async () => {
      fetchMock.mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
      } as unknown as Response);

      await expect(build().assertClientAccount('client-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('NFR-01: читаем только id/role/isActive', () => {
    it('ФИО, email и телефон не попадают ни в лог, ни в ошибки', async () => {
      const client = build();
      fetchMock.mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce(
        jsonResponse(
          200,
          safeUser({
            role: 'ADMIN',
            fullName: 'Секретное ФИО',
            email: 'secret@example.com',
            phone: '+7 999 111-22-33',
          }),
        ),
      );

      await expect(client.assertClientAccount('client-1')).rejects.toThrow(
        'Аккаунт не является клиентом',
      );

      const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls]
        .flat()
        .map((value) => String(value))
        .join(' ');
      expect(logged).not.toContain('Секретное ФИО');
      expect(logged).not.toContain('secret@example.com');
      expect(logged).not.toContain('+7 999 111-22-33');
    });
  });
});
