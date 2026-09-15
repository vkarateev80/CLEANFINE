import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { FloorRoutesController, RoutePointsController, RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

/** Справочник статусов маршрута приходит из workspace-пакета, которого нет в node_modules. */
jest.mock(
  '@cleaning-ops/shared/types/core',
  () => ({
    ROUTE_STATUSES: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    canTransitionRoute: () => true,
  }),
  { virtual: true },
);

const routesMock = {
  create: jest.fn(),
  listByFloor: jest.fn(),
  getDetail: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addPoint: jest.fn(),
  reorderPoints: jest.fn(),
  updatePoint: jest.fn(),
  removePoint: jest.fn(),
};

describe('FloorRoutesController (маршруты этажа)', () => {
  let controller: FloorRoutesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [FloorRoutesController],
      providers: [{ provide: RoutesService, useValue: routesMock }],
    }).compile();
    controller = moduleRef.get(FloorRoutesController);
  });

  it('create передаёт floorId и тело', async () => {
    const dto = { name: 'Утренняя уборка' } as never;
    routesMock.create.mockResolvedValue('route');

    await expect(controller.create('floor-1', dto)).resolves.toBe('route');
    expect(routesMock.create).toHaveBeenCalledWith('floor-1', dto);
  });

  it('list отдаёт маршруты этажа', async () => {
    routesMock.listByFloor.mockResolvedValue([]);

    await expect(controller.list('floor-1')).resolves.toEqual([]);
    expect(routesMock.listByFloor).toHaveBeenCalledWith('floor-1');
  });
});

describe('RoutesController (операции над маршрутом)', () => {
  let controller: RoutesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [RoutesController],
      providers: [{ provide: RoutesService, useValue: routesMock }],
    }).compile();
    controller = moduleRef.get(RoutesController);
  });

  it('getById отдаёт детализацию (с суммарным временем) через getDetail', async () => {
    routesMock.getDetail.mockResolvedValue({ id: 'route-1', totalEstimatedTimeMin: 12 });

    await expect(controller.getById('route-1')).resolves.toEqual(
      expect.objectContaining({ totalEstimatedTimeMin: 12 }),
    );
    expect(routesMock.getDetail).toHaveBeenCalledWith('route-1');
  });

  it('update передаёт id и тело', async () => {
    const dto = { status: 'ACTIVE' } as never;
    routesMock.update.mockResolvedValue('updated');

    await expect(controller.update('route-1', dto)).resolves.toBe('updated');
    expect(routesMock.update).toHaveBeenCalledWith('route-1', dto);
  });

  it('remove не возвращает тело (204 ставит декоратор)', async () => {
    routesMock.remove.mockResolvedValue(undefined);

    await expect(controller.remove('route-1')).resolves.toBeUndefined();
    expect(routesMock.remove).toHaveBeenCalledWith('route-1');
  });

  it('addPoint передаёт id маршрута и DTO точки', async () => {
    const dto = { roomId: 'room-1', estimatedTimeMin: 8 } as never;
    routesMock.addPoint.mockResolvedValue('point');

    await expect(controller.addPoint('route-1', dto)).resolves.toBe('point');
    expect(routesMock.addPoint).toHaveBeenCalledWith('route-1', dto);
  });

  it('reorder передаёт id маршрута и полный список pointIds', async () => {
    const dto = { pointIds: ['point-b', 'point-a'] } as never;
    routesMock.reorderPoints.mockResolvedValue({ points: [] });

    await expect(controller.reorder('route-1', dto)).resolves.toEqual({ points: [] });
    expect(routesMock.reorderPoints).toHaveBeenCalledWith('route-1', dto);
  });

  it('роуты и RBAC соответствуют контракту', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RoutesController)).toBe('api/routes');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.reorder)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.addPoint)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(ROLES_KEY, controller.reorder)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.getById)).toBeUndefined();
  });
});

describe('RoutePointsController (точки маршрута)', () => {
  let controller: RoutePointsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [RoutePointsController],
      providers: [{ provide: RoutesService, useValue: routesMock }],
    }).compile();
    controller = moduleRef.get(RoutePointsController);
  });

  it('update передаёт id точки и новое время', async () => {
    const dto = { estimatedTimeMin: 15 } as never;
    routesMock.updatePoint.mockResolvedValue('point');

    await expect(controller.update('point-a', dto)).resolves.toBe('point');
    expect(routesMock.updatePoint).toHaveBeenCalledWith('point-a', dto);
  });

  it('remove удаляет точку и пересобирает нумерацию (проверяем вызов сервиса)', async () => {
    routesMock.removePoint.mockResolvedValue(undefined);

    await expect(controller.remove('point-a')).resolves.toBeUndefined();
    expect(routesMock.removePoint).toHaveBeenCalledWith('point-a');
  });

  it('роуты и RBAC: точки правят ADMIN и SUPERVISOR', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RoutePointsController)).toBe('api/route-points');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.update)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.remove)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(ROLES_KEY, controller.update)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN', 'SUPERVISOR']);
  });
});
