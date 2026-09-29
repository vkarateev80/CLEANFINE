import { BadRequestException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { FloorItemController, FloorsController } from './floors.controller';
import { FloorsService } from './floors.service';

const floorsMock = {
  create: jest.fn(),
  listByObject: jest.fn(),
  getById: jest.fn(),
  getDetail: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  attachPlan: jest.fn(),
  uploadPlan: jest.fn(),
};

function multerFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('png'),
    size: 3,
    originalname: 'plan.png',
    mimetype: 'image/png',
  } as unknown as Express.Multer.File;
}

describe('FloorsController (вложен в объект)', () => {
  let controller: FloorsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [FloorsController],
      providers: [{ provide: FloorsService, useValue: floorsMock }],
    }).compile();
    controller = moduleRef.get(FloorsController);
  });

  it('create передаёт objectId из пути и тело запроса', async () => {
    const dto = { number: 1, name: 'Первый' } as never;
    floorsMock.create.mockResolvedValue('floor');

    await expect(controller.create('obj-1', dto)).resolves.toBe('floor');
    expect(floorsMock.create).toHaveBeenCalledWith('obj-1', dto);
  });

  it('list проксирует objectId', async () => {
    floorsMock.listByObject.mockResolvedValue([]);

    await expect(controller.list('obj-1')).resolves.toEqual([]);
    expect(floorsMock.listByObject).toHaveBeenCalledWith('obj-1');
  });
});

describe('FloorItemController (операции над этажом)', () => {
  let controller: FloorItemController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [FloorItemController],
      providers: [{ provide: FloorsService, useValue: floorsMock }],
    }).compile();
    controller = moduleRef.get(FloorItemController);
  });

  it('getById проксирует id', async () => {
    floorsMock.getById.mockResolvedValue('floor');

    await expect(controller.getById('floor-1')).resolves.toBe('floor');
    expect(floorsMock.getById).toHaveBeenCalledWith('floor-1');
  });

  it('getDetail проксирует id', async () => {
    floorsMock.getDetail.mockResolvedValue({ id: 'floor-1' });

    await expect(controller.getDetail('floor-1')).resolves.toEqual({ id: 'floor-1' });
    expect(floorsMock.getDetail).toHaveBeenCalledWith('floor-1');
  });

  it('update передаёт id и тело', async () => {
    const dto = { name: 'Второй' } as never;
    floorsMock.update.mockResolvedValue('updated');

    await expect(controller.update('floor-1', dto)).resolves.toBe('updated');
    expect(floorsMock.update).toHaveBeenCalledWith('floor-1', dto);
  });

  it('remove не возвращает тело (204 ставит декоратор)', async () => {
    floorsMock.remove.mockResolvedValue(undefined);

    await expect(controller.remove('floor-1')).resolves.toBeUndefined();
    expect(floorsMock.remove).toHaveBeenCalledWith('floor-1');
  });

  it('attachPlan проксирует id и DTO привязки', async () => {
    const dto = { planImageUrl: 'http://minio/plan.png', planScale: 0.05 } as never;
    floorsMock.attachPlan.mockResolvedValue('floor');

    await expect(controller.attachPlan('floor-1', dto)).resolves.toBe('floor');
    expect(floorsMock.attachPlan).toHaveBeenCalledWith('floor-1', dto);
  });

  describe('uploadPlan', () => {
    it('передаёт файл и проброшенный access-токен, а planScale приводит к числу', async () => {
      floorsMock.uploadPlan.mockResolvedValue('floor');
      const file = multerFile();

      await expect(controller.uploadPlan('floor-1', file, 'token-abc', '0.05')).resolves.toBe(
        'floor',
      );

      // Токен берётся из заголовка запроса (@AccessToken), а не из тела: файл уходит
      // в file-service от имени пользователя.
      expect(floorsMock.uploadPlan).toHaveBeenCalledWith('floor-1', file, 'token-abc', 0.05);
    });

    it('пустая строка planScale → undefined (масштаб не задан)', async () => {
      floorsMock.uploadPlan.mockResolvedValue('floor');

      await controller.uploadPlan('floor-1', multerFile(), 'token', '');

      expect(floorsMock.uploadPlan).toHaveBeenCalledWith(
        'floor-1',
        expect.anything(),
        'token',
        undefined,
      );
    });

    it('отсутствующий planScale (multipart без поля) → undefined', async () => {
      floorsMock.uploadPlan.mockResolvedValue('floor');

      await controller.uploadPlan('floor-1', multerFile(), 'token', undefined);

      expect(floorsMock.uploadPlan).toHaveBeenCalledWith(
        'floor-1',
        expect.anything(),
        'token',
        undefined,
      );
    });

    it('нечисловой planScale → BadRequestException, а не тихий undefined', async () => {
      // Молчаливый undefined скрывал опечатку пользователя (дефект A6): масштаб не
      // менялся, и это выглядело как успех. Теперь мусор — явная 400.
      floorsMock.uploadPlan.mockResolvedValue('floor');

      await expect(controller.uploadPlan('floor-1', multerFile(), 'token', 'abc')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadPlan('floor-1', multerFile(), 'token', 'abc')).rejects.toThrow(
        'planScale',
      );
      expect(floorsMock.uploadPlan).not.toHaveBeenCalled();
    });

    it('неположительный planScale → BadRequestException (масштаб 0 невозможен)', async () => {
      floorsMock.uploadPlan.mockResolvedValue('floor');

      await expect(controller.uploadPlan('floor-1', multerFile(), 'token', '0')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadPlan('floor-1', multerFile(), 'token', '-5')).rejects.toThrow(
        BadRequestException,
      );
      expect(floorsMock.uploadPlan).not.toHaveBeenCalled();
    });
  });

  it('роуты, RBAC и лимиты объявлены по контракту', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FloorsController)).toBe(
      'api/objects/:objectId/floors',
    );
    expect(Reflect.getMetadata(PATH_METADATA, FloorItemController)).toBe('api/floors');

    expect(Reflect.getMetadata(METHOD_METADATA, controller.uploadPlan)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.remove)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(ROLES_KEY, controller.uploadPlan)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.attachPlan)).toEqual(['ADMIN', 'SUPERVISOR']);
    expect(Reflect.getMetadata(ROLES_KEY, controller.remove)).toEqual(['ADMIN']);
    // Просмотр этажа открыт любому аутентифицированному пользователю.
    expect(Reflect.getMetadata(ROLES_KEY, controller.getDetail)).toBeUndefined();
  });
});
