import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/guards/roles.guard';
import { EventsPublisher } from '../events/events.publisher';
import { PrismaService } from '../prisma/prisma.service';
import { GeofenceService } from './geofence.service';
import { GpsService } from './gps.service';

const operator: AuthUser = {
  id: 'd8369dde-68c5-4f8b-ab72-55cd39497607',
  email: 'operator@cleaning-ops.com',
  role: 'OPERATOR',
  fullName: 'Иван Петров',
};

const objectId = '3f1a5f9e-9a1e-4c6d-9a1e-000000000001';
const geofenceRef = { id: 'gf-1', objectId, name: 'БЦ «Северный»' };

type Mock = jest.Mock;

function build(config: Record<string, unknown> = {}) {
  const $queryRaw: Mock = jest.fn();
  const $executeRaw: Mock = jest.fn().mockResolvedValue(1);
  const prisma = { $queryRaw, $executeRaw } as unknown as PrismaService;

  const geofences = {
    findContainingBefore: jest.fn().mockResolvedValue([]),
    findContainingGeofences: jest.fn().mockResolvedValue([]),
  };
  const events = { publishGeofenceExit: jest.fn().mockResolvedValue(true) };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;

  const service = new GpsService(
    prisma,
    geofences as unknown as GeofenceService,
    events as unknown as EventsPublisher,
    configService,
  );

  return { service, $queryRaw, $executeRaw, geofences, events };
}

/** Вложенные Sql-фрагменты (Prisma.join / Prisma.sql) разворачиваются рекурсивно. */
function renderValue(value: unknown): string {
  const candidate = value as { strings?: unknown; values?: unknown } | null;
  if (
    candidate &&
    typeof candidate === 'object' &&
    Array.isArray(candidate.strings) &&
    Array.isArray(candidate.values)
  ) {
    const strings = candidate.strings as string[];
    const values = candidate.values as unknown[];
    return strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? renderValue(values[index]) : ''),
      '',
    );
  }
  return typeof value === 'string' ? value : '$';
}

/** Полный SQL вызова $queryRaw/$executeRaw, включая вложенные фрагменты. */
function sqlArgument(mock: Mock, index = 0): string {
  const call = mock.mock.calls[index];
  const strings = call[0] as string[];
  const values = call.slice(1);
  return strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? renderValue(values[i]) : ''),
    '',
  );
}

/** Плоский список параметров вызова (без вложенных Sql-обёрток). */
function flattenValues(values: unknown[]): unknown[] {
  return values.flatMap((value) => {
    const candidate = value as { strings?: unknown; values?: unknown } | null;
    if (
      candidate &&
      typeof candidate === 'object' &&
      Array.isArray(candidate.strings) &&
      Array.isArray(candidate.values)
    ) {
      return flattenValues(candidate.values as unknown[]);
    }
    return [value];
  });
}

function valuesArgument(mock: Mock, index = 0): unknown[] {
  return flattenValues(mock.mock.calls[index].slice(1));
}

describe('GpsService — trackBatch (М3.1)', () => {
  it('вставляет batch одним INSERT и возвращает число принятых точек', async () => {
    const { service, $executeRaw } = build();
    $executeRaw.mockResolvedValue(3);

    const result = await service.trackBatch(
      {
        tracks: [
          { lat: 55.7558, lng: 37.6173 },
          { lat: 55.7559, lng: 37.6174, accuracy: 5, speed: 1.5, battery: 80 },
          { lat: 55.756, lng: 37.6175, timestamp: '2026-09-15T10:00:00.000Z' },
        ],
      },
      operator,
    );

    expect(result.accepted).toBe(3);
    expect(result.userId).toBe(operator.id);
    expect(result.geofenceExits).toEqual([]);
    expect($executeRaw).toHaveBeenCalledTimes(1);
    const sql = sqlArgument($executeRaw);
    expect(sql).toContain('INSERT INTO gps_tracks');
    expect(sql).toContain('ST_MakePoint');
    // batch ушёл одним запросом: 3 точки → 3 набора параметров по 7 значений.
    expect(valuesArgument($executeRaw)).toHaveLength(21);
  });

  it('сортирует точки по времени и проверяет геозоны по последней точке', async () => {
    const { service, geofences, $executeRaw } = build();

    await service.trackBatch(
      {
        tracks: [
          { lat: 10, lng: 20, timestamp: '2026-09-15T10:00:00.000Z' },
          { lat: 30, lng: 40, timestamp: '2026-09-15T12:00:00.000Z' },
        ],
      },
      operator,
    );

    const [beforeUserId, beforeDate] = geofences.findContainingBefore.mock.calls[0];
    expect(beforeUserId).toBe(operator.id);
    // Начало окна — самая ранняя точка batch.
    expect((beforeDate as Date).toISOString()).toBe('2026-09-15T10:00:00.000Z');
    expect(geofences.findContainingGeofences).toHaveBeenCalledWith(30, 40);
    // Первая точка в параметрах — самая ранняя (10/20).
    const values = valuesArgument($executeRaw);
    expect(values[1]).toBe(20);
    expect(values[2]).toBe(10);
  });

  it('без timestamp использует время приёма и заполняет пустые поля null', async () => {
    const { service, $executeRaw } = build();

    const before = Date.now();
    await service.trackBatch({ tracks: [{ lat: 55.7, lng: 37.6 }] }, operator);
    const after = Date.now();

    const values = valuesArgument($executeRaw);
    expect(values[3]).toBeNull();
    expect(values[4]).toBeNull();
    expect(values[5]).toBeNull();
    const timestamp = values[6] as Date;
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it('эмитит geofence.exit, когда сотрудник вышел из геозоны', async () => {
    const { service, geofences, events } = build();
    geofences.findContainingBefore.mockResolvedValue([geofenceRef]);
    geofences.findContainingGeofences.mockResolvedValue([]);

    const result = await service.trackBatch(
      {
        employeeName: 'Иван Петров',
        tracks: [{ lat: 55.0, lng: 37.0, timestamp: '2026-09-15T10:00:00.000Z' }],
      },
      operator,
    );

    expect(result.geofenceExits).toEqual([
      { geofenceId: 'gf-1', objectId, name: 'БЦ «Северный»', published: true },
    ]);
    expect(events.publishGeofenceExit).toHaveBeenCalledWith({
      userId: operator.id,
      employeeName: 'Иван Петров',
      objectId,
      timestamp: '2026-09-15T10:00:00.000Z',
    });
  });

  it('не эмитит событие, если сотрудник остался внутри геозоны', async () => {
    const { service, geofences, events } = build();
    geofences.findContainingBefore.mockResolvedValue([geofenceRef]);
    geofences.findContainingGeofences.mockResolvedValue([geofenceRef]);

    const result = await service.trackBatch({ tracks: [{ lat: 55.7, lng: 37.6 }] }, operator);

    expect(result.geofenceExits).toEqual([]);
    expect(events.publishGeofenceExit).not.toHaveBeenCalled();
  });

  it('не эмитит событие для первой точки сотрудника вне геозон', async () => {
    const { service, geofences, events } = build();
    geofences.findContainingBefore.mockResolvedValue([]);
    geofences.findContainingGeofences.mockResolvedValue([]);

    const result = await service.trackBatch({ tracks: [{ lat: 55.7, lng: 37.6 }] }, operator);

    expect(result.geofenceExits).toEqual([]);
    expect(events.publishGeofenceExit).not.toHaveBeenCalled();
  });

  it('выход из нескольких геозон даёт несколько событий', async () => {
    const { service, geofences, events } = build();
    geofences.findContainingBefore.mockResolvedValue([
      geofenceRef,
      { id: 'gf-2', objectId: 'other-object', name: null },
    ]);
    geofences.findContainingGeofences.mockResolvedValue([]);

    const result = await service.trackBatch({ tracks: [{ lat: 55.7, lng: 37.6 }] }, operator);

    expect(result.geofenceExits).toHaveLength(2);
    expect(events.publishGeofenceExit).toHaveBeenCalledTimes(2);
  });

  it('недоступность RabbitMQ отражается в published=false, но точка принята', async () => {
    const { service, geofences, events } = build();
    geofences.findContainingBefore.mockResolvedValue([geofenceRef]);
    events.publishGeofenceExit.mockResolvedValue(false);

    const result = await service.trackBatch({ tracks: [{ lat: 55.7, lng: 37.6 }] }, operator);

    expect(result.geofenceExits[0]).toMatchObject({ published: false });
    expect(result.accepted).toBe(1);
  });

  it('имя сотрудника берётся из токена: fullName, иначе email', async () => {
    const { service } = build();

    await expect(
      service.trackBatch({ tracks: [{ lat: 1, lng: 2 }], employeeName: 'Из тела' }, operator),
    ).resolves.toMatchObject({ employeeName: 'Из тела' });

    await expect(service.trackBatch({ tracks: [{ lat: 1, lng: 2 }] }, operator)).resolves.toMatchObject(
      { employeeName: 'Иван Петров' },
    );

    await expect(
      service.trackBatch({ tracks: [{ lat: 1, lng: 2 }] }, { ...operator, fullName: '' }),
    ).resolves.toMatchObject({ employeeName: operator.email });
  });

  it('пустой batch → BadRequestException', async () => {
    const { service, $executeRaw } = build();

    await expect(service.trackBatch({ tracks: [] }, operator)).rejects.toThrow(BadRequestException);
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it('batch больше лимита из конфига → BadRequestException', async () => {
    const { service, $executeRaw } = build({ 'gps.maxBatchSize': 2 });

    await expect(
      service.trackBatch({ tracks: [{ lat: 1, lng: 2 }, { lat: 1, lng: 2 }, { lat: 1, lng: 2 }] }, operator),
    ).rejects.toThrow('За один запрос не более 2 точек');
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it('OPERATOR не может записать треки за другого сотрудника', async () => {
    const { service, $executeRaw } = build();

    await expect(
      service.trackBatch(
        { userId: 'a1111111-1111-4111-8111-111111111111', tracks: [{ lat: 1, lng: 2 }] },
        operator,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it('ADMIN может записать треки за другого сотрудника', async () => {
    const { service, $executeRaw } = build();
    const admin: AuthUser = { ...operator, role: 'ADMIN' };
    const otherUserId = 'a1111111-1111-4111-8111-111111111111';

    const result = await service.trackBatch(
      { userId: otherUserId, tracks: [{ lat: 1, lng: 2 }] },
      admin,
    );

    expect(result.userId).toBe(otherUserId);
    expect(valuesArgument($executeRaw)[0]).toBe(otherUserId);
  });
});

describe('GpsService — history (М3.2)', () => {
  const row = {
    id: 'track-1',
    user_id: operator.id,
    lat: 55.7558,
    lng: 37.6173,
    accuracy: '5.00',
    speed: '1.50',
    battery_level: 80,
    timestamp: new Date('2026-09-15T10:00:00.000Z'),
  };

  it('возвращает историю с фильтром только по пользователю', async () => {
    const { service, $queryRaw } = build({ 'gps.historyLimit': 500 });
    $queryRaw.mockResolvedValue([row]);

    const result = await service.history({ userId: operator.id });

    expect(result).toMatchObject({
      userId: operator.id,
      from: null,
      to: null,
      count: 1,
    });
    expect(result.tracks[0]).toEqual({
      id: 'track-1',
      userId: operator.id,
      lat: 55.7558,
      lng: 37.6173,
      accuracy: 5,
      speed: 1.5,
      batteryLevel: 80,
      timestamp: '2026-09-15T10:00:00.000Z',
    });
    const sql = sqlArgument($queryRaw);
    expect(sql).toContain('ST_Y(location)');
    expect(sql).toContain('ST_X(location)');
    expect(sql).not.toContain('>=');
    expect(valuesArgument($queryRaw)).toEqual([operator.id, 500]);
  });

  it('применяет фильтр по времени, когда заданы from/to', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([]);
    const from = '2026-09-15T00:00:00.000Z';
    const to = '2026-09-15T23:59:59.000Z';

    const result = await service.history({ userId: operator.id, from, to, limit: 10 });

    expect(result).toMatchObject({ from, to, count: 0, tracks: [] });
    const sql = sqlArgument($queryRaw);
    expect(sql).toContain('timestamp >=');
    expect(sql).toContain('timestamp <=');
    const values = valuesArgument($queryRaw);
    expect(values[0]).toBe(operator.id);
    expect((values[1] as Date).toISOString()).toBe(from);
    expect((values[2] as Date).toISOString()).toBe(to);
    // limit из query приоритетнее конфига.
    expect(values[3]).toBe(10);
  });

  it('пустые координаты и битые числа приводятся к 0/null', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([
      { ...row, lat: null, lng: null, accuracy: 'n/a', speed: null, battery_level: null },
    ]);

    const [{ lat, lng, accuracy, speed, batteryLevel }] = (
      await service.history({ userId: operator.id })
    ).tracks;

    expect([lat, lng, accuracy, speed, batteryLevel]).toEqual([0, 0, null, null, null]);
  });

  it('строка с timestamp из pg (не Date) превращается в ISO', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([{ ...row, timestamp: '2026-09-15T11:00:00.000Z' }]);

    const result = await service.history({ userId: operator.id });

    expect(result.tracks[0].timestamp).toBe('2026-09-15T11:00:00.000Z');
  });
});

describe('GpsService — findNearbyEmployees (М3.2)', () => {
  const row = {
    user_id: operator.id,
    lat: 55.756,
    lng: 37.618,
    accuracy: '4.00',
    speed: null,
    battery_level: 55,
    timestamp: new Date('2026-09-15T10:00:00.000Z'),
    distance_meters: '123.45',
  };

  it('возвращает последнюю точку каждого сотрудника в радиусе за 5 минут', async () => {
    const { service, $queryRaw } = build({ 'gps.nearbyMaxAgeMinutes': 5 });
    $queryRaw.mockResolvedValue([row]);

    const result = await service.findNearbyEmployees(55.7558, 37.6173, 500);

    expect(result).toMatchObject({ lat: 55.7558, lng: 37.6173, radiusMeters: 500, maxAgeMinutes: 5, count: 1 });
    expect(result.employees[0]).toEqual({
      userId: operator.id,
      lat: 55.756,
      lng: 37.618,
      accuracy: 4,
      speed: null,
      batteryLevel: 55,
      timestamp: '2026-09-15T10:00:00.000Z',
      distanceMeters: 123.45,
    });
    const sql = sqlArgument($queryRaw);
    expect(sql).toContain('DISTINCT ON (gps.user_id)');
    expect(sql).toContain('ST_DWithin');
    expect(sql).toContain('make_interval');
    // lng/lat повторяются в ST_Distance и ST_DWithin, затем радиус и окно свежести.
    expect(valuesArgument($queryRaw)).toEqual([37.6173, 55.7558, 37.6173, 55.7558, 500, 5]);
  });

  it('использует окно свежести из конфига и радиус по умолчанию', async () => {
    const { service, $queryRaw } = build({ 'gps.nearbyMaxAgeMinutes': 15 });
    $queryRaw.mockResolvedValue([]);

    const result = await service.findNearbyEmployees(55.0, 37.0);

    expect(result).toMatchObject({ radiusMeters: 500, maxAgeMinutes: 15, count: 0, employees: [] });
    expect(valuesArgument($queryRaw)).toEqual([37, 55, 37, 55, 500, 15]);
  });

  it('падает в дефолт 5 минут, если конфиг пуст', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([]);

    await expect(service.findNearbyEmployees(55.0, 37.0)).resolves.toMatchObject({
      maxAgeMinutes: 5,
    });
  });

  it('битые координаты точки приводятся к 0, distance — к null', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([{ ...row, lat: null, lng: 'n/a', distance_meters: 'n/a' }]);

    const [employee] = (await service.findNearbyEmployees(55.0, 37.0)).employees;

    expect(employee.lat).toBe(0);
    expect(employee.lng).toBe(0);
    expect(employee.distanceMeters).toBeNull();
  });
});
