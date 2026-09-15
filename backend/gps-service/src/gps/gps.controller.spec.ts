import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import { GeofenceService } from './geofence.service';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';

const user: AuthUser = {
  id: 'd8369dde-68c5-4f8b-ab72-55cd39497607',
  email: 'operator@cleaning-ops.com',
  role: 'OPERATOR',
  fullName: 'Иван',
};

function build() {
  const gps = {
    trackBatch: jest.fn().mockResolvedValue({ accepted: 1 }),
    findNearbyEmployees: jest.fn().mockResolvedValue({ count: 0 }),
    history: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const geofences = {
    check: jest.fn().mockResolvedValue({ inside: true }),
    create: jest.fn().mockResolvedValue({ id: 'gf-1' }),
    list: jest.fn().mockResolvedValue([{ id: 'gf-1' }]),
  };
  const controller = new GpsController(
    gps as unknown as GpsService,
    geofences as unknown as GeofenceService,
  );
  return { controller, gps, geofences };
}

describe('GpsController (gps-service)', () => {
  it('смонтирован под /api/gps', () => {
    expect(Reflect.getMetadata(PATH_METADATA, GpsController)).toBe('api/gps');
  });

  it('POST /track принимает batch и пользователя из токена', async () => {
    const { controller, gps } = build();
    const dto = { tracks: [{ lat: 55.7558, lng: 37.6173 }] };

    await controller.track(dto, user);

    expect(gps.trackBatch).toHaveBeenCalledWith(dto, user);
  });

  it('GET /geofences/:userId/check проверяет вхождение', async () => {
    const { controller, geofences } = build();

    await controller.check(user.id, { lat: 55.7558, lng: 37.6173 });

    expect(geofences.check).toHaveBeenCalledWith(user.id, 55.7558, 37.6173);
  });

  it('GET /geofences отдаёт список с фильтром по объекту', async () => {
    const { controller, geofences } = build();
    const objectId = '3f1a5f9e-9a1e-4c6d-9a1e-000000000001';

    const result = await controller.listGeofences({ objectId });

    expect(geofences.list).toHaveBeenCalledWith(objectId);
    expect(result).toEqual({ count: 1, geofences: [{ id: 'gf-1' }] });
  });

  it('GET /geofences без фильтра передаёт undefined', async () => {
    const { controller, geofences } = build();

    await controller.listGeofences({});

    expect(geofences.list).toHaveBeenCalledWith(undefined);
  });

  it('GET /employees/nearby ищет ближних сотрудников', async () => {
    const { controller, gps } = build();

    await controller.nearby({ lat: 55.7558, lng: 37.6173, radius: 500 });

    expect(gps.findNearbyEmployees).toHaveBeenCalledWith(55.7558, 37.6173, 500);
  });

  it('GET /tracks отдаёт историю перемещений', async () => {
    const { controller, gps } = build();
    const query = { userId: user.id, from: '2026-09-15T00:00:00.000Z' };

    await controller.tracks(query);

    expect(gps.history).toHaveBeenCalledWith(query);
  });

  it('POST /geofences создаёт геозону', async () => {
    const { controller, geofences } = build();
    const dto = {
      objectId: '3f1a5f9e-9a1e-4c6d-9a1e-000000000001',
      boundary: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [37.6173, 55.7558],
            [37.6193, 55.7558],
            [37.6193, 55.7578],
            [37.6173, 55.7558],
          ],
        ],
      },
    };

    await controller.createGeofence(dto);

    expect(geofences.create).toHaveBeenCalledWith(dto);
  });

  it('RBAC: создание геозон только ADMIN/SUPERVISOR', () => {
    expect(Reflect.getMetadata(ROLES_KEY, GpsController.prototype.createGeofence)).toEqual([
      'ADMIN',
      'SUPERVISOR',
    ]);
  });

  it('RBAC: чтение доступно любому аутентифицированному (без @Roles)', () => {
    for (const method of ['track', 'check', 'nearby', 'tracks'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, GpsController.prototype[method])).toBeUndefined();
    }
  });
});
