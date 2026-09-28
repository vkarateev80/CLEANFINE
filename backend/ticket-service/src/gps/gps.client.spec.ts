import { ConfigService } from '@nestjs/config';
import { GpsClient } from './gps.client';

function createConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'gpsService.baseUrl': 'http://localhost:3004',
    'gpsService.timeoutMs': 1000,
    'gpsService.nearbyRadiusM': 500,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('GpsClient (ticket-service)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('возвращает ближних операторов и пробрасывает токен пользователя', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ userId: 'u-1', distanceMeters: 120 }, { id: 'u-2' }]),
    );
    const client = new GpsClient(createConfig());

    const result = await client.findNearbyEmployees(55.75, 37.61, undefined, 'token-abc');

    expect(result).toEqual([
      { userId: 'u-1', distanceMeters: 120 },
      { userId: 'u-2', distanceMeters: null },
    ]);
    // Радиус по умолчанию — 500 м из устава; lat/lng в query.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3004/api/gps/employees/nearby?lat=55.75&lng=37.61&radius=500',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
      }),
    );
  });

  it('без токена не отправляет заголовок Authorization', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ employeeId: 'u-9', distance: 42 }] }));
    const client = new GpsClient(createConfig());

    await expect(client.findNearbyEmployees(1, 2, 300)).resolves.toEqual([
      { userId: 'u-9', distanceMeters: 42 },
    ]);

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toContain('radius=300');
  });

  it('понимает обёртки employees/data и отбрасывает мусорные элементы', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ employees: [{ userId: 'u-1' }] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ userId: 'u-2' }] }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse([null, 'строка', { userId: '' }, { userId: 'u-3' }]),
    );
    const client = new GpsClient(createConfig());

    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([
      { userId: 'u-1', distanceMeters: null },
    ]);
    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([
      { userId: 'u-2', distanceMeters: null },
    ]);
    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([
      { userId: 'u-3', distanceMeters: null },
    ]);
  });

  it('неизвестная форма ответа → пустой список', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    const client = new GpsClient(createConfig());

    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([]);
  });

  it('ошибка gps-service (500) → пустой список, заявка создаётся', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, false, 500));
    const client = new GpsClient(createConfig());

    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([]);
  });

  it('gps-service недоступен → пустой список и warning, исключение не летит', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new GpsClient(createConfig());

    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([]);
  });

  it('невалидный JSON в ответе → пустой список', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new Error('Unexpected token')),
    } as unknown as Response);
    const client = new GpsClient(createConfig());

    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([]);
  });

  it('срезает хвостовой слэш базового URL и использует дефолты без конфига', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const client = new GpsClient(createConfig({ 'gpsService.baseUrl': 'http://gps:3004///' }));

    await client.findNearbyEmployees(1, 2);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://gps:3004/api/gps/employees/nearby?lat=1&lng=2&radius=500',
    );
  });

  it('дефолты применяются, если конфиг пуст', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ userId: 'ignored' }));
    const client = new GpsClient({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    await expect(client.findNearbyEmployees(1, 2)).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toContain('http://localhost:3004/api/gps/employees/nearby');
  });
});
