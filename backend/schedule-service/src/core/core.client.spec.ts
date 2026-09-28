import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '../auth/service-token.provider';
import { CoreClient } from './core.client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function build(values: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    'coreService.baseUrl': 'http://localhost:3003',
    'coreService.timeoutMs': 5_000,
    ...values,
  };
  const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
  const tokens = {
    getAccessToken: jest.fn().mockResolvedValue('service-token'),
  } as unknown as jest.Mocked<ServiceTokenProvider>;
  return { client: new CoreClient(config, tokens), tokens };
}

describe('CoreClient', () => {
  const originalFetch = global.fetch;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy.mockRestore();
  });

  it('читает name из плоского ответа служебным токеном', async () => {
    const { client, tokens } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { id: 'obj-1', name: 'БЦ Ромашка' }),
    );

    await expect(client.getObjectName('obj-1')).resolves.toBe('БЦ Ромашка');
    expect(tokens.getAccessToken).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3003/api/objects/obj-1', {
      headers: { Accept: 'application/json', Authorization: 'Bearer service-token' },
      signal: expect.anything(),
    });
  });

  it('getRouteName читает имя маршрута из GET /api/routes/:id', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { id: 'r-1', name: 'Этаж 1' }));

    await expect(client.getRouteName('r-1')).resolves.toBe('Этаж 1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3003/api/routes/r-1',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('пустой routeId не ходит в сеть', async () => {
    const { client } = build();
    await expect(client.getRouteName('')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('читает name из вложенного объекта и предпочитает переданный токен', async () => {
    const { client, tokens } = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { object: { id: 'obj-1', name: 'Склад' } }),
    );

    await expect(client.getObjectName('obj-1', 'user-token')).resolves.toBe('Склад');
    expect(tokens.getAccessToken).not.toHaveBeenCalled();
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer user-token',
    });
  });

  it('недоступный служебный токен → null, запрос в core не уходит', async () => {
    const { client, tokens } = build();
    tokens.getAccessToken.mockRejectedValue(new Error('auth недоступен'));

    await expect(client.getObjectName('obj-1')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('пустой objectId не ходит в сеть', async () => {
    const { client } = build();
    await expect(client.getObjectName('')).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ошибка сервиса и недоступность → null (имя не критично)', async () => {
    const { client } = build();

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(404, {}));
    await expect(client.getObjectName('obj-1')).resolves.toBeNull();

    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.getObjectName('obj-1')).resolves.toBeNull();
  });

  it('ответ без имени → null', async () => {
    const { client } = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { id: 'obj-1' }));
    await expect(client.getObjectName('obj-1')).resolves.toBeNull();

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { name: '' }));
    await expect(client.getObjectName('obj-1')).resolves.toBeNull();

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, 'строка'));
    await expect(client.getObjectName('obj-1')).resolves.toBeNull();
  });

  it('срезает хвостовой слэш в baseUrl', async () => {
    const { client } = build({ 'coreService.baseUrl': 'http://core:3003/' });
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { name: 'X' }));

    await client.getObjectName('obj-1');

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://core:3003/api/objects/obj-1');
  });
});
