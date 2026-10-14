import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RoomItemController, RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

const roomsMock = {
  create: jest.fn(),
  listByFloor: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('RoomsController (помещения этажа)', () => {
  let controller: RoomsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: roomsMock }],
    }).compile();
    controller = moduleRef.get(RoomsController);
  });

  it('create передаёт floorId из пути и тело запроса', async () => {
    const dto = { name: 'Санузел 101', areaM2: 12.5, floorType: 'sanitary' } as never;
    roomsMock.create.mockResolvedValue('room');

    await expect(controller.create('floor-1', dto)).resolves.toBe('room');
    expect(roomsMock.create).toHaveBeenCalledWith('floor-1', dto);
  });

  it('list отдаёт экспликацию этажа', async () => {
    roomsMock.listByFloor.mockResolvedValue([]);

    await expect(controller.list('floor-1')).resolves.toEqual([]);
    expect(roomsMock.listByFloor).toHaveBeenCalledWith('floor-1');
  });
});

describe('RoomItemController (операции над помещением)', () => {
  let controller: RoomItemController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomItemController],
      providers: [{ provide: RoomsService, useValue: roomsMock }],
    }).compile();
    controller = moduleRef.get(RoomItemController);
  });

  it('getById проксирует id', async () => {
    roomsMock.getById.mockResolvedValue('room');

    await expect(controller.getById('room-1')).resolves.toBe('room');
    expect(roomsMock.getById).toHaveBeenCalledWith('room-1');
  });

  it('update передаёт id и тело', async () => {
    const dto = { coordsX: 100 } as never;
    roomsMock.update.mockResolvedValue('updated');

    await expect(controller.update('room-1', dto)).resolves.toBe('updated');
    expect(roomsMock.update).toHaveBeenCalledWith('room-1', dto);
  });

  it('remove ничего не возвращает: 204 ставит декоратор', async () => {
    roomsMock.remove.mockResolvedValue(undefined);

    await expect(controller.remove('room-1')).resolves.toBeUndefined();
    expect(roomsMock.remove).toHaveBeenCalledWith('room-1');
  });

  it('роуты и RBAC соответствуют контракту', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RoomsController)).toBe('api/floors/:floorId/rooms');
    expect(Reflect.getMetadata(PATH_METADATA, RoomItemController)).toBe('api/rooms');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.update)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.remove)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(ROLES_KEY, controller.update)).toEqual(['ADMIN', 'SUPERVISOR', 'MANAGER']);
    // Удаление помещения — только администратор.
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.getById)).toBeUndefined();
  });
});
