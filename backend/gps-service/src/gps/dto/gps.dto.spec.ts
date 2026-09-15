import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateGeofenceDto,
  GeofenceCheckQueryDto,
  NearbyEmployeesQueryDto,
  TrackBatchDto,
  TrackHistoryQueryDto,
} from './gps.dto';

async function errorsOf<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  return validate(plainToInstance(cls, plain));
}

const polygon = [
  [
    [37.6173, 55.7558],
    [37.6193, 55.7558],
    [37.6193, 55.7578],
    [37.6173, 55.7558],
  ],
];

const objectId = '3f1a5f9e-9a1e-4c6d-9a1e-000000000001';
const userId = 'd8369dde-68c5-4f8b-ab72-55cd39497607';

describe('TrackBatchDto', () => {
  it('принимает корректный batch и приводит строковые числа к number', async () => {
    const dto = plainToInstance(TrackBatchDto, {
      tracks: [{ lat: '55.7558', lng: '37.6173', accuracy: '5', battery: '80' }],
    });

    expect(typeof dto.tracks[0].lat).toBe('number');

    const errors = await errorsOf(TrackBatchDto, {
      tracks: [{ lat: '55.7558', lng: '37.6173', accuracy: '5', battery: 80 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('отклоняет широту вне диапазона', async () => {
    const errors = await errorsOf(TrackBatchDto, { tracks: [{ lat: 91, lng: 37.6173 }] });

    expect(JSON.stringify(errors)).toContain('lat должен быть широтой');
  });

  it('отклоняет заряд батареи вне 0..100', async () => {
    const errors = await errorsOf(TrackBatchDto, {
      tracks: [{ lat: 55.7558, lng: 37.6173, battery: 101 }],
    });

    expect(JSON.stringify(errors)).toContain('battery');
  });

  it('отклоняет пустой и слишком большой batch', async () => {
    expect(await errorsOf(TrackBatchDto, { tracks: [] })).not.toHaveLength(0);

    const tooMany = {
      tracks: Array.from({ length: 1001 }, () => ({ lat: 55.7558, lng: 37.6173 })),
    };
    const errors = await errorsOf(TrackBatchDto, tooMany);
    expect(JSON.stringify(errors)).toContain('не более 1000 точек');
  });

  it('отклоняет чужой формат userId и требует employeeName строкой', async () => {
    const errors = await errorsOf(TrackBatchDto, {
      userId: 'not-a-uuid',
      employeeName: 42,
      tracks: [{ lat: 55.7558, lng: 37.6173 }],
    });

    expect(JSON.stringify(errors)).toContain('userId должен быть UUID');
    expect(JSON.stringify(errors)).toContain('employeeName');
  });

  it('отклоняет timestamp не в формате ISO 8601', async () => {
    const errors = await errorsOf(TrackBatchDto, {
      tracks: [{ lat: 55.7558, lng: 37.6173, timestamp: '15.09.2026 10:00' }],
    });

    expect(JSON.stringify(errors)).toContain('ISO 8601');
  });
});

describe('CreateGeofenceDto', () => {
  it('принимает корректную геозону', async () => {
    const errors = await errorsOf(CreateGeofenceDto, {
      objectId,
      name: 'БЦ «Северный»',
      radiusMeters: 100,
      boundary: { type: 'Polygon', coordinates: polygon },
    });

    expect(errors).toHaveLength(0);
  });

  it('требует objectId-UUID и тип Polygon', async () => {
    const errors = await errorsOf(CreateGeofenceDto, {
      objectId: 'object-1',
      boundary: { type: 'Circle', coordinates: polygon },
    });
    const flat = JSON.stringify(errors);

    expect(flat).toContain('objectId должен быть UUID');
    expect(flat).toContain("boundary.type должен быть 'Polygon'");
  });

  it('отклоняет кольцо короче 4 точек и нечисловые координаты', async () => {
    const short = await errorsOf(CreateGeofenceDto, {
      objectId,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [37.6173, 55.7558],
            [37.6193, 55.7558],
            [37.6173, 55.7558],
          ],
        ],
      },
    });
    expect(JSON.stringify(short)).toContain('GeoJSON-полигоном');

    const nonNumeric = await errorsOf(CreateGeofenceDto, {
      objectId,
      boundary: { type: 'Polygon', coordinates: [[['a', 55.7558], [1, 2], [3, 4], [5, 6]]] },
    });
    expect(JSON.stringify(nonNumeric)).toContain('GeoJSON-полигоном');
  });

  it('отклоняет координаты вне допустимых диапазонов и пустой список колец', async () => {
    const outside = await errorsOf(CreateGeofenceDto, {
      objectId,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [200, 91],
            [37.6193, 55.7558],
            [37.6193, 55.7578],
            [37.6173, 55.7558],
          ],
        ],
      },
    });
    expect(JSON.stringify(outside)).toContain('GeoJSON-полигоном');

    const empty = await errorsOf(CreateGeofenceDto, {
      objectId,
      boundary: { type: 'Polygon', coordinates: [] },
    });
    expect(JSON.stringify(empty)).toContain('GeoJSON-полигоном');
  });

  it('отклоняет радиус вне диапазона', async () => {
    const errors = await errorsOf(CreateGeofenceDto, {
      objectId,
      radiusMeters: 0,
      boundary: { type: 'Polygon', coordinates: polygon },
    });

    expect(JSON.stringify(errors)).toContain('radiusMeters');
  });
});

describe('query-DTO', () => {
  it('CoordinatesQueryDto приводит строковые координаты к number', async () => {
    const dto = plainToInstance(GeofenceCheckQueryDto, { lat: '55.7558', lng: '37.6173' });

    expect(dto).toMatchObject({ lat: 55.7558, lng: 37.6173 });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('NearbyEmployeesQueryDto подставляет радиус 500 м по умолчанию', async () => {
    const dto = plainToInstance(NearbyEmployeesQueryDto, { lat: 55.7558, lng: 37.6173 });

    expect(dto.radius).toBe(500);
  });

  it('TrackHistoryQueryDto требует userId и ограничивает период', async () => {
    const ok = await errorsOf(TrackHistoryQueryDto, {
      userId,
      from: '2026-09-15T00:00:00.000Z',
      to: '2026-09-15T23:59:59.000Z',
      limit: 100,
    });
    expect(ok).toHaveLength(0);

    const bad = await errorsOf(TrackHistoryQueryDto, { userId: 'x', from: 'вчера', limit: 0 });
    const flat = JSON.stringify(bad);
    expect(flat).toContain('userId должен быть UUID');
    expect(flat).toContain('from должен быть датой ISO 8601');
    expect(flat).toContain('limit');
  });
});
