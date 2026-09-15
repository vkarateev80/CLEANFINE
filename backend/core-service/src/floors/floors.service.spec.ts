import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { FileServiceClient, PlanUploadError } from './file-service.client';
import { FloorsService } from './floors.service';

interface PrismaMockShape {
  object: { findUnique: jest.Mock };
  floor: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
}

function createPrismaMock(): PrismaMockShape {
  return {
    object: { findUnique: jest.fn() },
    floor: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

const floorFixture = {
  id: 'floor-1',
  objectId: 'obj-1',
  number: 1,
  name: 'Первый этаж',
  planImageUrl: null,
  planScale: null,
};

const objectFixture = { id: 'obj-1', name: 'БЦ «Северный»' };

/** План-файл в том виде, в котором его отдаёт multer. */
function multerFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('png-bytes'),
    size: 9,
    originalname: 'plan.png',
    mimetype: 'image/png',
    ...overrides,
  } as unknown as Express.Multer.File;
}

describe('FloorsService', () => {
  let service: FloorsService;
  let prisma: PrismaMockShape;
  const fileService = { uploadPlan: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FloorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FileServiceClient, useValue: fileService },
      ],
    }).compile();
    service = moduleRef.get(FloorsService);
  });

  describe('create', () => {
    it('создаёт этаж, когда объект есть, а номер свободен', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.floor.findUnique.mockResolvedValue(null);
      prisma.floor.create.mockResolvedValue(floorFixture);

      const dto = { number: 1, name: 'Первый этаж', planScale: 0.05 };
      await expect(service.create('obj-1', dto)).resolves.toBe(floorFixture);

      expect(prisma.floor.create).toHaveBeenCalledWith({
        data: { objectId: 'obj-1', number: 1, name: 'Первый этаж', planScale: 0.05 },
      });
    });

    it('несуществующий объект → NotFoundException (этаж не должен «висеть» без объекта)', async () => {
      prisma.object.findUnique.mockResolvedValue(null);

      await expect(service.create('missing', { number: 1, name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create('missing', { number: 1, name: 'X' })).rejects.toThrow(
        'Объект не найден',
      );
      // Уникальность номера даже не проверяется: объекта нет.
      expect(prisma.floor.findUnique).not.toHaveBeenCalled();
      expect(prisma.floor.create).not.toHaveBeenCalled();
    });

    it('занятый номер этажа в том же объекте → ConflictException', async () => {
      // @@unique([objectId, number]) в схеме; сервис проверяет это заранее,
      // чтобы отдать 409, а не 500 от Prisma.
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.floor.findUnique.mockResolvedValue(floorFixture);

      await expect(service.create('obj-1', { number: 1, name: 'Дубль' })).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create('obj-1', { number: 1, name: 'Дубль' })).rejects.toThrow(
        'Этаж с номером 1 уже есть у этого объекта',
      );
      expect(prisma.floor.create).not.toHaveBeenCalled();
    });

    it('проверяет уникальность в разрезе объекта, а не глобально', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.floor.findUnique.mockResolvedValue(null);

      await service.create('obj-1', { number: 3, name: 'Третий' });

      expect(prisma.floor.findUnique).toHaveBeenCalledWith({
        where: { objectId_number: { objectId: 'obj-1', number: 3 } },
      });
    });
  });

  describe('listByObject', () => {
    it('отдаёт этажи по возрастанию номера с количеством помещений и маршрутов', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.floor.findMany.mockResolvedValue([floorFixture]);

      await expect(service.listByObject('obj-1')).resolves.toEqual([floorFixture]);

      expect(prisma.floor.findMany).toHaveBeenCalledWith({
        where: { objectId: 'obj-1' },
        orderBy: { number: 'asc' },
        include: { rooms: { select: { id: true } }, routes: { select: { id: true } } },
      });
    });

    it('несуществующий объект → NotFoundException, а не пустой список', async () => {
      prisma.object.findUnique.mockResolvedValue(null);

      await expect(service.listByObject('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.floor.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getById / getDetail', () => {
    it('getById возвращает этаж', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);

      await expect(service.getById('floor-1')).resolves.toBe(floorFixture);
      expect(prisma.floor.findUnique).toHaveBeenCalledWith({ where: { id: 'floor-1' } });
    });

    it('getById: нет этажа → NotFoundException', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow('Этаж не найден');
    });

    it('getDetail подгружает объект, помещения с техкартами и маршруты с точками', async () => {
      const detail = { ...floorFixture, object: objectFixture, rooms: [], routes: [] };
      prisma.floor.findUnique.mockResolvedValue(detail);

      await expect(service.getDetail('floor-1')).resolves.toBe(detail);

      expect(prisma.floor.findUnique).toHaveBeenCalledWith({
        where: { id: 'floor-1' },
        include: {
          object: { select: { id: true, name: true } },
          rooms: {
            orderBy: { name: 'asc' },
            include: { techCard: { select: { id: true, name: true } } },
          },
          routes: {
            orderBy: { name: 'asc' },
            include: { points: { orderBy: { orderIndex: 'asc' } } },
          },
        },
      });
    });

    it('getDetail: нет этажа → NotFoundException', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('missing')).rejects.toThrow('Этаж не найден');
    });
  });

  describe('update', () => {
    it('без номера не проверяет уникальность и обновляет остальные поля', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      prisma.floor.update.mockResolvedValue({ ...floorFixture, name: 'Переименован' });

      await service.update('floor-1', { name: 'Переименован' });

      // Номер не меняется — лишний запрос к БД на проверку уникальности не нужен.
      expect(prisma.floor.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.floor.update).toHaveBeenCalledWith({
        where: { id: 'floor-1' },
        data: { number: undefined, name: 'Переименован', planScale: undefined },
      });
    });

    it('тот же номер не считается конфликтом', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      prisma.floor.update.mockResolvedValue(floorFixture);

      await expect(service.update('floor-1', { number: 1 })).resolves.toBe(floorFixture);
      expect(prisma.floor.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.floor.update).toHaveBeenCalled();
    });

    it('новый свободный номер проходит проверку уникальности', async () => {
      prisma.floor.findUnique
        .mockResolvedValueOnce(floorFixture) // getById
        .mockResolvedValueOnce(null); // assertNumberFree
      prisma.floor.update.mockResolvedValue({ ...floorFixture, number: 2 });

      await service.update('floor-1', { number: 2 });

      expect(prisma.floor.findUnique).toHaveBeenLastCalledWith({
        where: { objectId_number: { objectId: 'obj-1', number: 2 } },
      });
    });

    it('новый занятый номер → ConflictException', async () => {
      prisma.floor.findUnique
        .mockResolvedValueOnce(floorFixture)
        .mockResolvedValueOnce({ ...floorFixture, id: 'floor-9', number: 2 });

      await expect(service.update('floor-1', { number: 2 })).rejects.toThrow(ConflictException);
      expect(prisma.floor.update).not.toHaveBeenCalled();
    });

    it('нет этажа → NotFoundException', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('удаляет существующий этаж (каскад по схеме сносит помещения и маршруты)', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      prisma.floor.delete.mockResolvedValue(floorFixture);

      await expect(service.remove('floor-1')).resolves.toBeUndefined();
      expect(prisma.floor.delete).toHaveBeenCalledWith({ where: { id: 'floor-1' } });
    });

    it('нет этажа → NotFoundException и никакого delete', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.floor.delete).not.toHaveBeenCalled();
    });
  });

  describe('attachPlan', () => {
    it('привязывает URL плана, масштаб и размеры', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      prisma.floor.update.mockResolvedValue({ ...floorFixture, planImageUrl: 'http://minio/plan.png' });

      const dto = { planImageUrl: 'http://minio/plan.png', planScale: 0.05, planWidth: 1200, planHeight: 800 };
      await service.attachPlan('floor-1', dto);

      expect(prisma.floor.update).toHaveBeenCalledWith({
        where: { id: 'floor-1' },
        data: {
          planImageUrl: 'http://minio/plan.png',
          planScale: 0.05,
          planWidth: 1200,
          planHeight: 800,
        },
      });
    });

    it('нет этажа → NotFoundException (URL нельзя привязать «в никуда»)', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(
        service.attachPlan('missing', { planImageUrl: 'http://minio/plan.png' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.floor.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadPlan', () => {
    it('загружает файл в file-service и сохраняет URL, масштаб и размеры плана', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      fileService.uploadPlan.mockResolvedValue({
        id: 'file-1',
        url: 'http://minio/plan.png',
        originalName: 'plan.png',
        width: 1200,
        height: 800,
      });
      prisma.floor.update.mockResolvedValue({ ...floorFixture, planImageUrl: 'http://minio/plan.png' });

      const file = multerFile();
      await service.uploadPlan('floor-1', file, 'token-abc', 0.05);

      // Токен пользователя пробрасывается как есть — сервисных учёток core не создаёт.
      expect(fileService.uploadPlan).toHaveBeenCalledWith(file, 'token-abc', {
        floorId: 'floor-1',
        planScale: 0.05,
      });
      // Реальные размеры плана сохраняются — по ним валидируются координаты (дефект B).
      expect(prisma.floor.update).toHaveBeenCalledWith({
        where: { id: 'floor-1' },
        data: {
          planImageUrl: 'http://minio/plan.png',
          planScale: 0.05,
          planWidth: 1200,
          planHeight: 800,
        },
      });
    });

    it('без planScale не перетирает масштаб (undefined = «не менять»)', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      fileService.uploadPlan.mockResolvedValue({
        id: 'file-1',
        url: 'http://minio/plan.png',
        originalName: 'plan.png',
        width: 1200,
        height: 800,
      });
      prisma.floor.update.mockResolvedValue(floorFixture);

      await service.uploadPlan('floor-1', multerFile(), 'token-abc');

      expect(prisma.floor.update).toHaveBeenCalledWith({
        where: { id: 'floor-1' },
        data: {
          planImageUrl: 'http://minio/plan.png',
          planScale: undefined,
          planWidth: 1200,
          planHeight: 800,
        },
      });
    });

    it('файл не передан → BadRequestException', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);

      await expect(service.uploadPlan('floor-1', undefined, 'token')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadPlan('floor-1', undefined, 'token')).rejects.toThrow(
        'Файл плана не передан (поле file)',
      );
      expect(fileService.uploadPlan).not.toHaveBeenCalled();
    });

    it('файл без буфера → BadRequestException (защита от «полупустого» multer-объекта)', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);

      const broken = multerFile({ buffer: undefined as unknown as Buffer });
      await expect(service.uploadPlan('floor-1', broken, 'token')).rejects.toThrow(
        'Файл плана не передан (поле file)',
      );
      expect(fileService.uploadPlan).not.toHaveBeenCalled();
    });

    it('пустой файл (size = 0) → BadRequestException', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);

      await expect(service.uploadPlan('floor-1', multerFile({ size: 0 }), 'token')).rejects.toThrow(
        BadRequestException,
      );
      expect(fileService.uploadPlan).not.toHaveBeenCalled();
    });

    it('нет этажа → NotFoundException до обращения к file-service', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.uploadPlan('missing', multerFile(), 'token')).rejects.toThrow(
        NotFoundException,
      );
      expect(fileService.uploadPlan).not.toHaveBeenCalled();
    });

    it('отказ file-service (PlanUploadError) → HttpException с его статусом и текстом', async () => {
      // Ошибка загрузки должна вернуться пользователю со статусом file-service:
      // 400 (валидация файла) остаётся 400, а 401 (истёкший токен) — 401, чтобы
      // клиент смог обновить access-токен (дефект A5).
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      fileService.uploadPlan.mockRejectedValue(
        new PlanUploadError('Недопустимый формат файла', 400),
      );

      const authError = await service
        .uploadPlan('floor-1', multerFile(), 'token')
        .catch((error) => error);
      expect(authError.getStatus()).toBe(400);
      expect(authError.message).toBe('Недопустимый формат файла');

      fileService.uploadPlan.mockRejectedValue(new PlanUploadError('Токен истёк', 401));
      const expired = await service.uploadPlan('floor-1', multerFile(), 'token').catch((error) => error);
      expect(expired.getStatus()).toBe(401);
      expect(expired.message).toBe('Токен истёк');

      expect(prisma.floor.update).not.toHaveBeenCalled();
    });

    it('прочие ошибки (сеть, таймаут) пробрасываются как есть, а не превращаются в 400', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      const networkError = new Error('fetch failed');
      fileService.uploadPlan.mockRejectedValue(networkError);

      await expect(service.uploadPlan('floor-1', multerFile(), 'token')).rejects.toBe(networkError);
    });
  });
});
