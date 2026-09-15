import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceUnavailableException } from '../common/external-service.exception';
import { GpsClient } from './gps.client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function build(values: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    'gpsService.baseUrl': 'http://localhost:3004',
    'gpsService.timeoutMs': 5_000,
    ...values,
  };
  const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
  return new GpsClient(config);
}

describe('GpsClient', () => {
  const originalFetch = global.fetch;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    errorSpy.mockRestore();
  });

  it('разбирает ответ «внутри зоны» и пробрасывает токен пользователя', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, {
        inside: true,
        distanceMeters: 12.5,
        geofence: { id: 'gf-1', objectId: 'obj-1', name: 'Офис', radiusMeters: 100 },
      }),
    );

    const result = await client.checkGeofence('user-1', 55.75, 37.61, 'user-token');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3004/api/gps/geofences/user-1/check?lat=55.75&lng=37.61',
      { headers: { Accept: 'application/json', Authorization: 'Bearer user-token' }, signal: expect.anything() },
    );
    expect(result).toEqual({
      inside: true,
      distanceMeters: 12.5,
      geofence: { id: 'gf-1', objectId: 'obj-1', name: 'Офис', radiusMeters: 100 },
    });
  });

  it('работает без токена и без геозоны в ответе', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { inside: false }));

    const result = await client.checkGeofence('user-1', 1, 2);

    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), {
      headers: { Accept: 'application/json' },
      signal: expect.anything(),
    });
    expect(result).toEqual({ inside: false, distanceMeters: null, geofence: null });
  });

  it('срезает хвостовой слэш в baseUrl', async () => {
    const client = build({ 'gpsService.baseUrl': 'http://gps:3004/' });
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { inside: true }));

    await client.checkGeofence('user-1', 1, 2);

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('http://gps:3004/api/gps');
  });

  it('недоступен → 502, а не 500', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(client.checkGeofence('user-1', 1, 2)).rejects.toMatchObject({
      status: 502,
      message: 'Не удалось подтвердить геозону: сервис геозон недоступен, check-in не выполнен',
    });
  });

  it('ошибка сервиса → 502', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(500, {}));

    await expect(client.checkGeofence('user-1', 1, 2)).rejects.toBeInstanceOf(
      ExternalServiceUnavailableException,
    );
  });

  it('ответ без inside → 502 (геозона не подтверждена)', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { distanceMeters: 1 }));

    await expect(client.checkGeofence('user-1', 1, 2)).rejects.toBeInstanceOf(
      ExternalServiceUnavailableException,
    );
  });

  it('не-JSON ответ → 502', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new Error('not json')),
    } as unknown as Response);

    await expect(client.checkGeofence('user-1', 1, 2)).rejects.toBeInstanceOf(
      ExternalServiceUnavailableException,
    );
  });

  it('игнорирует нечисловой distanceMeters и битую геозону', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { inside: true, distanceMeters: 'близко', geofence: { id: 1 } }),
    );

    const result = await client.checkGeofence('user-1', 1, 2);

    expect(result).toEqual({ inside: true, distanceMeters: null, geofence: null });
  });

  it('экранирует userId в URL', async () => {
    const client = build();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { inside: true }));

    await client.checkGeofence('user/../1', 1, 2);

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/api/gps/geofences/user%2F..%2F1/check',
    );
  });
});
