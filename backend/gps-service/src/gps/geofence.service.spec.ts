import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeofenceService } from './geofence.service';

type QueryRawMock = jest.Mock;

function build() {
  const $queryRaw: QueryRawMock = jest.fn();
  const prisma = { $queryRaw } as unknown as PrismaService;
  return { service: new GeofenceService(prisma), $queryRaw };
}

const objectId = '3f1a5f9e-9a1e-4c6d-9a1e-000000000001';
const geofenceId = '7c9f1b2a-1111-4222-8333-444455556666';

const polygon = [
  [
    [37.6173, 55.7558],
    [37.6193, 55.7558],
    [37.6193, 55.7578],
    [37.6173, 55.7578],
    [37.6173, 55.7558],
  ],
];

/** Возвращает SQL-текст первого вызова $queryRaw (tagged template). */
function sqlOf(mock: QueryRawMock, callIndex = 0): string {
  const strings = mock.mock.calls[callIndex][0] as TemplateStringsArray;
  return Array.from(strings).join('?');
}

describe('GeofenceService (gps-service)', () => {
  describe('create', () => {
    it('пишет GeoJSON-полигон в geometry(Polygon, 4326) и возвращает геозону', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([
        {
          id: geofenceId,
          object_id: objectId,
          name: 'БЦ «Северный»',
          radius_meters: 100,
          boundary: JSON.stringify({ type: 'Polygon', coordinates: polygon }),
        },
      ]);

      const created = await service.create({
        objectId,
        name: 'БЦ «Северный»',
        radiusMeters: 100,
        boundary: { type: 'Polygon', coordinates: polygon },
      });

      expect(created).toEqual({
        id: geofenceId,
        objectId,
        name: 'БЦ «Северный»',
        radiusMeters: 100,
        boundary: { type: 'Polygon', coordinates: polygon },
      });
      expect(sqlOf($queryRaw)).toContain('ST_GeomFromGeoJSON');
      expect($queryRaw.mock.calls[0].slice(1)).toEqual([
        objectId,
        'БЦ «Северный»',
        JSON.stringify({ type: 'Polygon', coordinates: polygon }),
        100,
      ]);
    });

    it('подставляет null для необязательных полей и принимает boundary-объект из pg', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([
        {
          id: geofenceId,
          object_id: objectId,
          name: null,
          radius_meters: null,
          boundary: { type: 'Polygon', coordinates: polygon },
        },
      ]);

      const created = await service.create({
        objectId,
        boundary: { type: 'Polygon', coordinates: polygon },
      });

      expect(created.name).toBeNull();
      expect(created.radiusMeters).toBeNull();
      expect($queryRaw.mock.calls[0].slice(1)).toEqual([
        objectId,
        null,
        JSON.stringify({ type: 'Polygon', coordinates: polygon }),
        null,
      ]);
    });

    it('битый GeoJSON в ответе БД не роняет маппинг (boundary=null)', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([
        { id: geofenceId, object_id: objectId, name: null, radius_meters: null, boundary: '{oops' },
      ]);

      await expect(
        service.create({ objectId, boundary: { type: 'Polygon', coordinates: polygon } }),
      ).resolves.toMatchObject({ boundary: null });
    });

    it('пустой RETURNING → BadRequestException', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([]);

      await expect(
        service.create({ objectId, boundary: { type: 'Polygon', coordinates: polygon } }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('возвращает все геозоны с GeoJSON-границами (без фильтра)', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([
        {
          id: geofenceId,
          object_id: objectId,
          name: 'БЦ «Северный»',
          radius_meters: 100,
          boundary: { type: 'Polygon', coordinates: polygon },
        },
      ]);

      const result = await service.list();

      expect(result).toEqual([
        {
          id: geofenceId,
          objectId,
          name: 'БЦ «Северный»',
          radiusMeters: 100,
          boundary: { type: 'Polygon', coordinates: polygon },
        },
      ]);
      const sql = sqlOf($queryRaw);
      expect(sql).toContain('ST_AsGeoJSON');
      expect(sql).not.toContain('WHERE object_id');
      // Без фильтра параметров в запросе нет.
      expect($queryRaw.mock.calls[0].slice(1)).toEqual([]);
    });

    it('с objectId фильтрует по объекту', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([]);

      await expect(service.list(objectId)).resolves.toEqual([]);

      expect(sqlOf($queryRaw)).toContain('WHERE object_id');
      expect($queryRaw.mock.calls[0].slice(1)).toEqual([objectId]);
    });
  });

  describe('check (SQL устава п.3)', () => {
    it('возвращает ближайшую геозону и признак вхождения', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([
        {
          id: geofenceId,
          object_id: objectId,
          name: 'БЦ «Северный»',
          radius_meters: 100,
          distance_meters: 0,
          is_inside: true,
        },
      ]);

      const result = await service.check('user-1', 55.7558, 37.6173);

      expect(result.inside).toBe(true);
      expect(result.distanceMeters).toBe(0);
      expect(result.geofence).toEqual({
        id: geofenceId,
        objectId,
        name: 'БЦ «Северный»',
        radiusMeters: 100,
      });
      expect(result.userId).toBe('user-1');
      expect(typeof result.checkedAt).toBe('string');
      const sql = sqlOf($queryRaw);
      expect(sql).toContain('ST_Distance');
      expect(sql).toContain('ST_Contains');
      expect(sql).toContain('ST_DWithin');
      // Радиус поиска по умолчанию — 1000 м из устава (lng/lat повторяются в
      // ST_Distance, ST_Contains и ST_DWithin).
      expect($queryRaw.mock.calls[0].slice(1)).toEqual([
        37.6173, 55.7558, 37.6173, 55.7558, 37.6173, 55.7558, 1000,
      ]);
    });

    it('точка вне всех геозон → inside=false и geofence=null', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([]);

      const result = await service.check('user-1', 55.0, 37.0);

      expect(result.inside).toBe(false);
      expect(result.distanceMeters).toBeNull();
      expect(result.geofence).toBeNull();
    });

    it('строка numeric из pg приводится к числу, а мусор — к null', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValueOnce([
        {
          id: geofenceId,
          object_id: objectId,
          name: null,
          radius_meters: '250',
          distance_meters: '12.5',
          is_inside: false,
        },
      ]);
      const first = await service.check('user-1', 55.0, 37.0);
      expect(first.distanceMeters).toBe(12.5);
      expect(first.geofence?.radiusMeters).toBe(250);

      $queryRaw.mockResolvedValueOnce([
        {
          id: geofenceId,
          object_id: objectId,
          name: null,
          radius_meters: null,
          distance_meters: 'not-a-number',
          is_inside: null,
        },
      ]);
      const second = await service.check('user-1', 55.0, 37.0);
      expect(second.distanceMeters).toBeNull();
      expect(second.inside).toBe(false);
    });

    it('позволяет переопределить радиус поиска', async () => {
      const { service, $queryRaw } = build();
      $queryRaw.mockResolvedValue([]);

      await service.check('user-1', 55.0, 37.0, 50);

      expect($queryRaw.mock.calls[0].slice(1)).toEqual([37, 55, 37, 55, 37, 55, 50]);
    });
  });

  it('findContainingGeofences возвращает ссылки на геозоны, содержащие точку', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([
      { id: geofenceId, object_id: objectId, name: 'БЦ «Северный»' },
      { id: 'other', object_id: objectId, name: null },
    ]);

    const refs = await service.findContainingGeofences(55.7558, 37.6173);

    expect(refs).toEqual([
      { id: geofenceId, objectId, name: 'БЦ «Северный»' },
      { id: 'other', objectId, name: null },
    ]);
    expect(sqlOf($queryRaw)).toContain('ST_Contains');
  });

  it('findContainingBefore ищет геозоны по последней точке до начала окна', async () => {
    const { service, $queryRaw } = build();
    $queryRaw.mockResolvedValue([{ id: geofenceId, object_id: objectId, name: null }]);
    const before = new Date('2026-09-15T10:00:00.000Z');

    const refs = await service.findContainingBefore('user-1', before);

    expect(refs).toEqual([{ id: geofenceId, objectId, name: null }]);
    expect($queryRaw.mock.calls[0].slice(1)).toEqual(['user-1', before]);
    expect(sqlOf($queryRaw)).toContain('ORDER BY timestamp DESC');
  });
});
