import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TechCardsService } from './tech-cards.service';

interface PrismaMockShape {
  techCard: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  techOperation: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  techOperationMaterial: { deleteMany: jest.Mock; createMany: jest.Mock };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaMockShape {
  const prisma: PrismaMockShape = {
    techCard: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    techOperation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    techOperationMaterial: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // Сервис использует и $transaction([...]), и интерактивную транзакцию.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return prisma;
}

const cardFixture = {
  id: 'tc-1',
  name: 'Влажная уборка санузла',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const operationFixture = {
  id: 'op-1',
  techCardId: 'tc-1',
  name: 'Нанести чистящее средство',
  orderIndex: 0,
  description: null,
  equipment: null,
  estimatedTimeMin: 10,
  requiresPhoto: false,
  requiresQr: false,
};

const operationB = { ...operationFixture, id: 'op-2', name: 'Протереть', orderIndex: 1 };
const operationC = { ...operationFixture, id: 'op-3', name: 'Смыть', orderIndex: 2 };

describe('TechCardsService', () => {
  let service: TechCardsService;
  let prisma: PrismaMockShape;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [TechCardsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TechCardsService);
  });

  describe('create', () => {
    it('создаёт техкарту с именем из DTO', async () => {
      prisma.techCard.create.mockResolvedValue(cardFixture);

      await expect(service.create({ name: 'Влажная уборка санузла' })).resolves.toBe(cardFixture);
      expect(prisma.techCard.create).toHaveBeenCalledWith({
        data: { name: 'Влажная уборка санузла' },
      });
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.techCard.findMany.mockResolvedValue([cardFixture]);
      prisma.techCard.count.mockResolvedValue(1);
    });

    it('без поиска отдаёт первые 50 записей с количеством операций и помещений', async () => {
      const result = await service.list({});

      expect(prisma.techCard.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
        include: { _count: { select: { operations: true, rooms: true } } },
      });
      expect(prisma.techCard.count).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual({ items: [cardFixture], total: 1 });
    });

    it('применяет skip и режет take до 100', async () => {
      await service.list({ skip: 20, take: 1000 });

      expect(prisma.techCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 100 }),
      );
    });

    it('поиск фильтрует по имени без учёта регистра', async () => {
      await service.list({ search: 'УБОРКА' });

      expect(prisma.techCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: 'УБОРКА', mode: 'insensitive' } },
        }),
      );
      expect(prisma.techCard.count).toHaveBeenCalledWith({
        where: { name: { contains: 'УБОРКА', mode: 'insensitive' } },
      });
    });
  });

  describe('getDetail', () => {
    it('возвращает карточку с операциями, материалами и помещениями + суммарное время', async () => {
      prisma.techCard.findUnique.mockResolvedValue({
        ...cardFixture,
        operations: [
          { ...operationFixture, materials: [], estimatedTimeMin: 10 },
          { ...operationB, materials: [], estimatedTimeMin: 5 },
        ],
        rooms: [],
      });

      const detail = await service.getDetail('tc-1');

      expect(prisma.techCard.findUnique).toHaveBeenCalledWith({
        where: { id: 'tc-1' },
        include: {
          operations: { orderBy: { orderIndex: 'asc' }, include: { materials: true } },
          rooms: {
            select: {
              id: true,
              name: true,
              floor: { select: { id: true, name: true, objectId: true } },
            },
          },
        },
      });
      // Сумма времени операций — то, ради чего карточка вообще нужна планировщику смен.
      expect(detail.totalEstimatedTimeMin).toBe(15);
    });

    it('карточка без операций: суммарное время 0', async () => {
      prisma.techCard.findUnique.mockResolvedValue({
        ...cardFixture,
        operations: [],
        rooms: [],
      });

      await expect(service.getDetail('tc-1')).resolves.toEqual(
        expect.objectContaining({ totalEstimatedTimeMin: 0 }),
      );
    });

    it('нет техкарты → NotFoundException', async () => {
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('missing')).rejects.toThrow('Техкарта не найдена');
    });
  });

  describe('update', () => {
    it('переименовывает существующую техкарту', async () => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techCard.update.mockResolvedValue({ ...cardFixture, name: 'Новое имя' });

      await service.update('tc-1', { name: 'Новое имя' });

      expect(prisma.techCard.update).toHaveBeenCalledWith({
        where: { id: 'tc-1' },
        data: { name: 'Новое имя' },
      });
    });

    it('нет техкарты → NotFoundException', async () => {
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Техкарта не найдена',
      );
      expect(prisma.techCard.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('удаляет техкарту (помещения сохраняются из-за onDelete: SetNull)', async () => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techCard.delete.mockResolvedValue(cardFixture);

      await expect(service.remove('tc-1')).resolves.toBeUndefined();
      expect(prisma.techCard.delete).toHaveBeenCalledWith({ where: { id: 'tc-1' } });
    });

    it('нет техкарты → NotFoundException', async () => {
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.techCard.delete).not.toHaveBeenCalled();
    });
  });

  describe('addOperation', () => {
    const baseDto = { name: 'Нанести чистящее средство', estimatedTimeMin: 10 };

    beforeEach(() => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techOperation.create.mockResolvedValue(operationFixture);
    });

    it('без orderIndex ставит операцию в конец', async () => {
      prisma.techOperation.findFirst.mockResolvedValue(operationC);

      await service.addOperation('tc-1', baseDto);

      expect(prisma.techOperation.findFirst).toHaveBeenCalledWith({
        where: { techCardId: 'tc-1' },
        orderBy: { orderIndex: 'desc' },
      });
      // Сдвиг существующих операций не нужен: вставляем в конец.
      expect(prisma.techOperation.findMany).not.toHaveBeenCalled();
      expect(prisma.techOperation.create).toHaveBeenCalledWith({
        data: {
          techCardId: 'tc-1',
          name: 'Нанести чистящее средство',
          orderIndex: 3,
          description: undefined,
          equipment: undefined,
          estimatedTimeMin: 10,
          requiresPhoto: false,
          requiresQr: false,
        },
        include: { materials: true },
      });
    });

    it('первая операция карточки получает orderIndex 0', async () => {
      prisma.techOperation.findFirst.mockResolvedValue(null);

      await service.addOperation('tc-1', baseDto);

      expect(prisma.techOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ orderIndex: 0 }) }),
      );
    });

    it('явный orderIndex сдвигает операции, начиная с этой позиции', async () => {
      // Вставка в середину: сначала освобождаем место (ORDER_OFFSET защищает от @@unique),
      // затем пишем окончательные индексы.
      prisma.techOperation.findMany.mockResolvedValue([operationC, operationB]);
      prisma.techOperation.update.mockResolvedValue({});

      await service.addOperation('tc-1', { ...baseDto, orderIndex: 1 });

      expect(prisma.techOperation.findMany).toHaveBeenCalledWith({
        where: { techCardId: 'tc-1', orderIndex: { gte: 1 } },
        orderBy: { orderIndex: 'desc' },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'op-3' },
        data: { orderIndex: 100_000 + 2 + 1 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'op-2' },
        data: { orderIndex: 100_000 + 1 + 1 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'op-3' },
        data: { orderIndex: 3 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'op-2' },
        data: { orderIndex: 2 },
      });
      expect(prisma.techOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ orderIndex: 1 }) }),
      );
    });

    it('явный orderIndex = 0 тоже запускает сдвиг', async () => {
      prisma.techOperation.findMany.mockResolvedValue([]);

      await service.addOperation('tc-1', { ...baseDto, orderIndex: 0 });

      expect(prisma.techOperation.findMany).toHaveBeenCalledWith({
        where: { techCardId: 'tc-1', orderIndex: { gte: 0 } },
        orderBy: { orderIndex: 'desc' },
      });
      // nextOrderIndex не вызывается, если позиция задана явно.
      expect(prisma.techOperation.findFirst).not.toHaveBeenCalled();
    });

    it('пробрасывает equipment, requiresPhoto, requiresQr', async () => {
      prisma.techOperation.findFirst.mockResolvedValue(null);

      await service.addOperation('tc-1', {
        ...baseDto,
        equipment: { items: ['швабра'] },
        requiresPhoto: true,
        requiresQr: true,
      });

      expect(prisma.techOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            equipment: { items: ['швабра'] },
            requiresPhoto: true,
            requiresQr: true,
          }),
        }),
      );
    });

    it('materials создаются вложенно вместе с операцией', async () => {
      prisma.techOperation.findFirst.mockResolvedValue(null);

      await service.addOperation('tc-1', {
        ...baseDto,
        materials: [{ materialId: 'm-1', consumptionPerOperation: 0.05, unit: 'л' }],
      });

      expect(prisma.techOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            materials: {
              create: [{ materialId: 'm-1', consumptionPerOperation: 0.05, unit: 'л' }],
            },
          }),
        }),
      );
    });

    it('пустой массив materials не добавляет вложенное создание', async () => {
      // Пустой create уронил бы Prisma; пустой список означает «материалов нет».
      prisma.techOperation.findFirst.mockResolvedValue(null);

      await service.addOperation('tc-1', { ...baseDto, materials: [] });

      const data = prisma.techOperation.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('materials');
    });

    it('нет техкарты → NotFoundException, операция не создаётся', async () => {
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(service.addOperation('missing', baseDto)).rejects.toThrow(
        'Техкарта не найдена',
      );
      expect(prisma.techOperation.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOperation', () => {
    beforeEach(() => {
      prisma.techOperation.findUnique.mockResolvedValue(operationFixture);
      prisma.techOperation.update.mockResolvedValue(operationFixture);
    });

    it('обновляет поля операции без смены порядка', async () => {
      await service.updateOperation('op-1', { name: 'Новое имя', estimatedTimeMin: 12 });

      // Порядок не менялся — перестановка соседей не запускается.
      expect(prisma.techOperation.findMany).not.toHaveBeenCalled();
      expect(prisma.techOperation.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: {
          name: 'Новое имя',
          description: undefined,
          equipment: undefined,
          estimatedTimeMin: 12,
          requiresPhoto: undefined,
          requiresQr: undefined,
        },
      });
    });

    it('тот же orderIndex не считается сменой порядка', async () => {
      await service.updateOperation('op-1', { orderIndex: 0 });

      expect(prisma.techOperation.findMany).not.toHaveBeenCalled();
      expect(prisma.techOperation.update).toHaveBeenCalledTimes(1);
    });

    it('equipment: null сбрасывает оборудование (дефект A7)', async () => {
      // Раньше `dto.equipment ?? undefined` съедал null → «не менять».
      // Теперь null → Prisma.DbNull (JSON null в колонке).
      await service.updateOperation('op-1', { equipment: null });

      expect(prisma.techOperation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ equipment: Prisma.DbNull }),
        }),
      );
    });

    it('equipment: объект записывается в updateOperation', async () => {
      await service.updateOperation('op-1', { equipment: { items: ['швабра'], ppe: ['перчатки'] } });

      expect(prisma.techOperation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            equipment: { items: ['швабра'], ppe: ['перчатки'] },
          }),
        }),
      );
    });

    it('смена orderIndex запускает перестановку с плотной нумерацией', async () => {
      prisma.techOperation.findMany.mockResolvedValue([
        operationFixture,
        operationB,
        operationC,
      ]);

      await service.updateOperation('op-1', { orderIndex: 2 });

      // moveOperation вынимает операцию из списка и вставляет в новую позицию.
      expect(prisma.techOperation.findMany).toHaveBeenCalledWith({
        where: { techCardId: 'tc-1' },
        orderBy: { orderIndex: 'asc' },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'op-2' },
        data: { orderIndex: 100_000 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'op-3' },
        data: { orderIndex: 100_001 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'op-1' },
        data: { orderIndex: 100_002 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'op-2' },
        data: { orderIndex: 0 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(5, {
        where: { id: 'op-3' },
        data: { orderIndex: 1 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(6, {
        where: { id: 'op-1' },
        data: { orderIndex: 2 },
      });
    });

    it('orderIndex больше длины списка прижимается к концу', async () => {
      // Защита от «уехавшего» индекса: splice с индексом > length не вставил бы элемент.
      prisma.techOperation.findMany.mockResolvedValue([operationFixture, operationB]);

      await service.updateOperation('op-1', { orderIndex: 99 });

      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'op-1' },
        data: { orderIndex: 100_001 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'op-1' },
        data: { orderIndex: 1 },
      });
    });

    it('materials заменяют список целиком: deleteMany + createMany', async () => {
      await service.updateOperation('op-1', {
        materials: [
          { materialId: 'm-1', consumptionPerOperation: 0.05, unit: 'л' },
          { materialId: 'm-2', consumptionPerOperation: 2, unit: 'шт' },
        ],
      });

      expect(prisma.techOperationMaterial.deleteMany).toHaveBeenCalledWith({
        where: { operationId: 'op-1' },
      });
      expect(prisma.techOperationMaterial.createMany).toHaveBeenCalledWith({
        data: [
          { operationId: 'op-1', materialId: 'm-1', consumptionPerOperation: 0.05, unit: 'л' },
          { operationId: 'op-1', materialId: 'm-2', consumptionPerOperation: 2, unit: 'шт' },
        ],
      });
    });

    it('пустой materials очищает список и не зовёт createMany', async () => {
      await service.updateOperation('op-1', { materials: [] });

      expect(prisma.techOperationMaterial.deleteMany).toHaveBeenCalled();
      expect(prisma.techOperationMaterial.createMany).not.toHaveBeenCalled();
    });

    it('materials не передан — существующие материалы не трогаем', async () => {
      await service.updateOperation('op-1', { name: 'X' });

      expect(prisma.techOperationMaterial.deleteMany).not.toHaveBeenCalled();
      expect(prisma.techOperationMaterial.createMany).not.toHaveBeenCalled();
    });

    it('возвращает операцию с материалами из финального чтения', async () => {
      const updated = { ...operationFixture, materials: [{ id: 'mat-1' }] };
      prisma.techOperation.findUnique
        .mockResolvedValueOnce(operationFixture) // getOperation
        .mockResolvedValueOnce(updated); // финальное чтение

      await expect(service.updateOperation('op-1', { name: 'X' })).resolves.toBe(updated);
      expect(prisma.techOperation.findUnique).toHaveBeenLastCalledWith({
        where: { id: 'op-1' },
        include: { materials: true },
      });
    });

    it('нет операции → NotFoundException', async () => {
      prisma.techOperation.findUnique.mockResolvedValue(null);

      await expect(service.updateOperation('missing', { name: 'X' })).rejects.toThrow(
        'Операция не найдена',
      );
      expect(prisma.techOperation.update).not.toHaveBeenCalled();
    });
  });

  describe('removeOperation', () => {
    it('удаляет операцию и пересобирает порядок оставшихся', async () => {
      prisma.techOperation.findUnique.mockResolvedValue(operationFixture);
      prisma.techOperation.delete.mockResolvedValue(operationFixture);
      prisma.techOperation.findMany.mockResolvedValue([operationB, operationC]);
      prisma.techOperation.update.mockResolvedValue({});

      await service.removeOperation('op-1');

      expect(prisma.techOperation.delete).toHaveBeenCalledWith({ where: { id: 'op-1' } });
      expect(prisma.techOperation.findMany).toHaveBeenCalledWith({
        where: { techCardId: 'tc-1' },
        orderBy: { orderIndex: 'asc' },
      });
      // Первый проход уводит индексы за пределы диапазона, второй — плотно 0..n-1.
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'op-2' },
        data: { orderIndex: 100_000 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'op-3' },
        data: { orderIndex: 100_001 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'op-2' },
        data: { orderIndex: 0 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'op-3' },
        data: { orderIndex: 1 },
      });
    });

    it('удаление последней операции ничего не перенумеровывает', async () => {
      prisma.techOperation.findUnique.mockResolvedValue(operationFixture);
      prisma.techOperation.findMany.mockResolvedValue([]);

      await service.removeOperation('op-1');

      expect(prisma.techOperation.update).not.toHaveBeenCalled();
    });

    it('нет операции → NotFoundException без удаления', async () => {
      prisma.techOperation.findUnique.mockResolvedValue(null);

      await expect(service.removeOperation('missing')).rejects.toThrow('Операция не найдена');
      expect(prisma.techOperation.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorderOperations', () => {
    it('переставляет операции и возвращает их с материалами', async () => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techOperation.findMany
        .mockResolvedValueOnce([operationFixture, operationB])
        .mockResolvedValueOnce([
          { ...operationB, orderIndex: 0, materials: [] },
          { ...operationFixture, orderIndex: 1, materials: [] },
        ]);
      prisma.techOperation.update.mockResolvedValue({});

      const result = await service.reorderOperations('tc-1', {
        operationIds: ['op-2', 'op-1'],
      });

      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'op-2' },
        data: { orderIndex: 100_000 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'op-1' },
        data: { orderIndex: 100_001 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'op-2' },
        data: { orderIndex: 0 },
      });
      expect(prisma.techOperation.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'op-1' },
        data: { orderIndex: 1 },
      });
      expect(prisma.techOperation.findMany).toHaveBeenLastCalledWith({
        where: { techCardId: 'tc-1' },
        orderBy: { orderIndex: 'asc' },
        include: { materials: true },
      });
      expect(result).toHaveLength(2);
    });

    it('чужая операция → BadRequestException со списком чужих id', async () => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techOperation.findMany.mockResolvedValue([operationFixture, operationB]);

      await expect(
        service.reorderOperations('tc-1', { operationIds: ['op-1', 'op-x'] }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reorderOperations('tc-1', { operationIds: ['op-1', 'op-x'] }),
      ).rejects.toThrow('Операции не принадлежат техкарте: op-x');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('неполный список → BadRequestException', async () => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techOperation.findMany.mockResolvedValue([operationFixture, operationB]);

      await expect(
        service.reorderOperations('tc-1', { operationIds: ['op-1'] }),
      ).rejects.toThrow('Передан неполный список операций: в техкарте 2, передано 1');
    });

    it('дубликат id → BadRequestException (сервис защищается и без @ArrayUnique)', async () => {
      // @ArrayUnique режет дубликат на уровне DTO, но сервис обязан защищаться сам.
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techOperation.findMany.mockResolvedValue([operationFixture, operationB]);

      await expect(
        service.reorderOperations('tc-1', { operationIds: ['op-1', 'op-1'] }),
      ).rejects.toThrow('operationIds содержит дубликаты');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('нет техкарты → NotFoundException', async () => {
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(
        service.reorderOperations('missing', { operationIds: ['op-1'] }),
      ).rejects.toThrow('Техкарта не найдена');
    });

    it('карточка без операций и пустой список: транзакция вхолостую', async () => {
      prisma.techCard.findUnique.mockResolvedValue(cardFixture);
      prisma.techOperation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await expect(service.reorderOperations('tc-1', { operationIds: [] })).resolves.toEqual([]);
      expect(prisma.techOperation.update).not.toHaveBeenCalled();
    });
  });
});
