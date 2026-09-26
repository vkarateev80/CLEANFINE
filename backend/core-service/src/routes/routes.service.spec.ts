import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RoutesService, sumEstimatedTime } from './routes.service';

/**
 * Таблицу переходов статусов дублируем из shared/types/core.ts: пакета нет в node_modules,
 * а проверять нужно именно бизнес-правило, а не заглушку.
 */
jest.mock(
  '@cleaning-ops/shared/types/core',
  () => {
    const ROUTE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
      DRAFT: ['ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ARCHIVED', 'DRAFT'],
      ARCHIVED: [],
    };
    return {
      ROUTE_STATUSES: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      ROUTE_ALLOWED_TRANSITIONS,
      canTransitionRoute: (from: string, to: string): boolean =>
        (ROUTE_ALLOWED_TRANSITIONS[from] ?? []).includes(to),
    };
  },
  { virtual: true },
);

interface PrismaMockShape {
  floor: { findUnique: jest.Mock };
  room: { findUnique: jest.Mock };
  route: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  routePoint: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaMockShape {
  const prisma: PrismaMockShape = {
    floor: { findUnique: jest.fn() },
    room: { findUnique: jest.fn() },
    route: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    routePoint: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  // Две формы транзакции: интерактивная (перестановка точек) и списочная
  // (`list` считает items и total одним batch-ем). В тестах tx — тот же мок,
  // поэтому вызовы внутри транзакции проверяются теми же spy-функциями.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

const routeFixture = {
  id: 'route-1',
  floorId: 'floor-1',
  name: 'Утренняя уборка',
  status: 'DRAFT',
};

const floorFixture = { id: 'floor-1', name: 'Первый этаж', number: 1 };

const roomSameFloor = { id: 'room-1', floorId: 'floor-1', name: 'Санузел 101' };
const roomOtherFloor = { id: 'room-2', floorId: 'floor-2', name: 'Санузел 201' };

const pointA = {
  id: 'point-a',
  routeId: 'route-1',
  roomId: 'room-1',
  orderIndex: 0,
  estimatedTimeMin: 5,
  room: {
    id: 'room-1',
    techCardId: 'tc-1',
    techCard: { id: 'tc-1', operations: [{ id: 'op-1' }, { id: 'op-2' }] },
  },
};
const pointB = {
  id: 'point-b',
  routeId: 'route-1',
  roomId: 'room-2',
  orderIndex: 1,
  estimatedTimeMin: 7,
  room: {
    id: 'room-2',
    // Та же техкарта, что у point-a: операции считаются на каждое помещение.
    techCardId: 'tc-1',
    techCard: { id: 'tc-1', operations: [{ id: 'op-1' }, { id: 'op-2' }] },
  },
};

describe('RoutesService', () => {
  let service: RoutesService;
  let prisma: PrismaMockShape;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [RoutesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RoutesService);
  });

  describe('create', () => {
    it('создаёт маршрут на существующем этаже', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      prisma.route.create.mockResolvedValue(routeFixture);

      await expect(service.create('floor-1', { name: 'Утренняя уборка' })).resolves.toBe(
        routeFixture,
      );
      expect(prisma.route.create).toHaveBeenCalledWith({
        data: { floorId: 'floor-1', name: 'Утренняя уборка' },
      });
    });

    it('нет этажа → NotFoundException', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.create('missing', { name: 'Маршрут' })).rejects.toThrow(
        'Этаж не найден',
      );
      expect(prisma.route.create).not.toHaveBeenCalled();
    });
  });

  describe('listByFloor', () => {
    it('отдаёт маршруты этажа с точками и помещениями', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorFixture);
      prisma.route.findMany.mockResolvedValue([routeFixture]);

      await expect(service.listByFloor('floor-1')).resolves.toEqual([routeFixture]);

      expect(prisma.route.findMany).toHaveBeenCalledWith({
        where: { floorId: 'floor-1' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { points: { orderBy: { orderIndex: 'asc' }, include: { room: true } } },
      });
    });

    it('нет этажа → NotFoundException', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.listByFloor('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.route.findMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    /** Строка выборки: Prisma отдаёт вложенные floor и _count — их разворачивает сервис. */
    const listRow = {
      id: 'route-1',
      name: 'Утренняя уборка',
      floorId: 'floor-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      floor: { objectId: 'object-1' },
      _count: { points: 2 },
    };

    /** Ожидаемая форма элемента: без вложенных floor/_count, со скалярами. */
    const listItem = {
      id: 'route-1',
      name: 'Утренняя уборка',
      floorId: 'floor-1',
      objectId: 'object-1',
      pointsCount: 2,
      createdAt: listRow.createdAt,
    };

    const select = {
      id: true,
      name: true,
      floorId: true,
      createdAt: true,
      floor: { select: { objectId: true } },
      _count: { select: { points: true } },
    };

    it('без параметров: без фильтров, пагинация по умолчанию, плоский элемент', async () => {
      prisma.route.findMany.mockResolvedValue([listRow]);
      prisma.route.count.mockResolvedValue(1);

      await expect(service.list({})).resolves.toEqual({ items: [listItem], total: 1 });

      expect(prisma.route.findMany).toHaveBeenCalledWith({
        where: { floorId: undefined },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
        select,
      });
      // total считается по тому же where, что и items: иначе пагинация «поедет».
      expect(prisma.route.count).toHaveBeenCalledWith({ where: { floorId: undefined } });
    });

    it('фильтр по объекту идёт через этаж (прямой связи Route → Object в схеме нет)', async () => {
      prisma.route.findMany.mockResolvedValue([]);
      prisma.route.count.mockResolvedValue(0);

      await expect(service.list({ objectId: 'object-1' })).resolves.toEqual({
        items: [],
        total: 0,
      });

      const where = { floorId: undefined, floor: { objectId: 'object-1' } };
      expect(prisma.route.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(prisma.route.count).toHaveBeenCalledWith({ where });
    });

    it('фильтр по этажу ограничивает выборку одним floorId', async () => {
      prisma.route.findMany.mockResolvedValue([listRow]);
      prisma.route.count.mockResolvedValue(1);

      await service.list({ floorId: 'floor-1' });

      const where = { floorId: 'floor-1' };
      expect(prisma.route.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      // where сравнивается целиком: лишний реляционный фильтр по объекту не добавился.
      expect(prisma.route.count).toHaveBeenCalledWith({ where });
    });

    it('применяет skip/take и режет take до 100', async () => {
      prisma.route.findMany.mockResolvedValue([]);
      prisma.route.count.mockResolvedValue(120);

      await expect(service.list({ skip: 10, take: 500 })).resolves.toEqual({
        items: [],
        total: 120,
      });

      expect(prisma.route.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 100 }),
      );
    });

    it('маленький take не увеличивается до максимума', async () => {
      prisma.route.findMany.mockResolvedValue([]);
      prisma.route.count.mockResolvedValue(0);

      await service.list({ take: 5 });

      expect(prisma.route.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('getDetail', () => {
    it('считает суммарное время и подгружает этаж, точки и помещения', async () => {
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, points: [pointA, pointB] });

      const detail = await service.getDetail('route-1');

      expect(prisma.route.findUnique).toHaveBeenCalledWith({
        where: { id: 'route-1' },
        include: {
          floor: { select: { id: true, objectId: true, name: true, number: true, planImageUrl: true } },
          points: {
            orderBy: { orderIndex: 'asc' },
            include: {
              room: {
                include: {
                  techCard: { select: { id: true, operations: { select: { id: true } } } },
                },
              },
            },
          },
        },
      });
      // Сумма нужна фронту для планирования смены; null-время считается нулём.
      expect(detail.totalEstimatedTimeMin).toBe(12);
      // Одна техкарта на двух помещениях: 2 операции × 2 точки = 4.
      expect(detail.operationsTotal).toBe(4);
    });

    it('маршрут без точек: суммарное время 0 и operationsTotal 0', async () => {
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, points: [] });

      await expect(service.getDetail('route-1')).resolves.toEqual(
        expect.objectContaining({ totalEstimatedTimeMin: 0, operationsTotal: 0 }),
      );
    });

    it('нет маршрута → NotFoundException', async () => {
      prisma.route.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('missing')).rejects.toThrow('Маршрут не найден');
    });
  });

  describe('update', () => {
    it('переименование без статуса не запускает проверку переходов', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.route.update.mockResolvedValue({ ...routeFixture, name: 'Вечерняя уборка' });

      await service.update('route-1', { name: 'Вечерняя уборка' });

      expect(prisma.route.update).toHaveBeenCalledWith({
        where: { id: 'route-1' },
        data: { name: 'Вечерняя уборка', status: undefined },
      });
    });

    it('тот же статус не считается переходом', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.route.update.mockResolvedValue(routeFixture);

      await expect(service.update('route-1', { status: 'DRAFT' })).resolves.toBe(routeFixture);
      expect(prisma.route.update).toHaveBeenCalled();
    });

    it('разрешённый переход DRAFT → ACTIVE проходит', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.route.update.mockResolvedValue({ ...routeFixture, status: 'ACTIVE' });

      await expect(service.update('route-1', { status: 'ACTIVE' })).resolves.toEqual(
        expect.objectContaining({ status: 'ACTIVE' }),
      );
    });

    it('запрещённый переход ARCHIVED → ACTIVE → BadRequestException', async () => {
      // ARCHIVED терминальный: восстановление маршрута не предусмотрено.
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, status: 'ARCHIVED' });

      await expect(service.update('route-1', { status: 'ACTIVE' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('route-1', { status: 'ACTIVE' })).rejects.toThrow(
        'Недопустимый переход статуса маршрута: ARCHIVED → ACTIVE',
      );
      expect(prisma.route.update).not.toHaveBeenCalled();
    });

    it('нет маршрута → NotFoundException', async () => {
      prisma.route.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow('Маршрут не найден');
    });
  });

  describe('remove', () => {
    it('удаляет маршрут (точки уходят каскадом)', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.route.delete.mockResolvedValue(routeFixture);

      await expect(service.remove('route-1')).resolves.toBeUndefined();
      expect(prisma.route.delete).toHaveBeenCalledWith({ where: { id: 'route-1' } });
    });

    it('нет маршрута → NotFoundException без удаления', async () => {
      prisma.route.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.route.delete).not.toHaveBeenCalled();
    });
  });

  describe('addPoint', () => {
    it('добавляет помещение в конец маршрута (orderIndex = последний + 1)', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.room.findUnique.mockResolvedValue(roomSameFloor);
      prisma.routePoint.findFirst.mockResolvedValue(pointB);
      prisma.routePoint.create.mockResolvedValue({ ...pointB, id: 'point-c', orderIndex: 2 });

      await service.addPoint('route-1', { roomId: 'room-1', estimatedTimeMin: 8 });

      expect(prisma.routePoint.findFirst).toHaveBeenCalledWith({
        where: { routeId: 'route-1' },
        orderBy: { orderIndex: 'desc' },
      });
      expect(prisma.routePoint.create).toHaveBeenCalledWith({
        data: {
          routeId: 'route-1',
          roomId: 'room-1',
          orderIndex: 2,
          estimatedTimeMin: 8,
        },
      });
    });

    it('первая точка маршрута получает orderIndex 0', async () => {
      // Нет ни одной точки → (undefined ?? -1) + 1 = 0, иначе нумерация начиналась бы с 1.
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.room.findUnique.mockResolvedValue(roomSameFloor);
      prisma.routePoint.findFirst.mockResolvedValue(null);
      prisma.routePoint.create.mockResolvedValue(pointA);

      await service.addPoint('route-1', { roomId: 'room-1' });

      expect(prisma.routePoint.create).toHaveBeenCalledWith({
        data: {
          routeId: 'route-1',
          roomId: 'room-1',
          orderIndex: 0,
          estimatedTimeMin: undefined,
        },
      });
    });

    it('точка из помещения другого этажа → BadRequestException', async () => {
      // Иначе маршрут этажа уводил бы уборщика на другой этаж.
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.room.findUnique.mockResolvedValue(roomOtherFloor);

      await expect(service.addPoint('route-1', { roomId: 'room-2' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addPoint('route-1', { roomId: 'room-2' })).rejects.toThrow(
        'Помещение принадлежит другому этажу',
      );
      expect(prisma.routePoint.create).not.toHaveBeenCalled();
    });

    it('несуществующее помещение → NotFoundException', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.addPoint('route-1', { roomId: 'missing' })).rejects.toThrow(
        'Помещение не найдено',
      );
    });

    it('нет маршрута → NotFoundException до проверки помещения', async () => {
      prisma.route.findUnique.mockResolvedValue(null);

      await expect(service.addPoint('missing', { roomId: 'room-1' })).rejects.toThrow(
        'Маршрут не найден',
      );
      expect(prisma.room.findUnique).not.toHaveBeenCalled();
    });

    it('точка в архивный маршрут не добавляется → BadRequestException', async () => {
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, status: 'ARCHIVED' });

      await expect(service.addPoint('route-1', { roomId: 'room-1' })).rejects.toThrow(
        'Архивный маршрут нельзя изменить',
      );
      expect(prisma.room.findUnique).not.toHaveBeenCalled();
      expect(prisma.routePoint.create).not.toHaveBeenCalled();
    });
  });

  describe('updatePoint', () => {
    it('обновляет нормативное время точки', async () => {
      prisma.routePoint.findUnique.mockResolvedValue(pointA);
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.update.mockResolvedValue({ ...pointA, estimatedTimeMin: 15 });

      await service.updatePoint('point-a', { estimatedTimeMin: 15 });

      expect(prisma.routePoint.update).toHaveBeenCalledWith({
        where: { id: 'point-a' },
        data: { estimatedTimeMin: 15 },
      });
    });

    it('нет точки → NotFoundException', async () => {
      prisma.routePoint.findUnique.mockResolvedValue(null);

      await expect(service.updatePoint('missing', { estimatedTimeMin: 15 })).rejects.toThrow(
        'Точка маршрута не найдена',
      );
      expect(prisma.routePoint.update).not.toHaveBeenCalled();
    });

    it('точка архивного маршрута неизменяема → BadRequestException', async () => {
      prisma.routePoint.findUnique.mockResolvedValue(pointA);
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, status: 'ARCHIVED' });

      await expect(service.updatePoint('point-a', { estimatedTimeMin: 15 })).rejects.toThrow(
        'Архивный маршрут нельзя изменить',
      );
      expect(prisma.routePoint.update).not.toHaveBeenCalled();
    });
  });

  describe('removePoint', () => {
    it('удаляет точку и пересобирает нумерацию без «дыр» через смещение', async () => {
      // Смещение ORDER_OFFSET обязательно: без него промежуточное состояние
      // нарушило бы @@unique([routeId, orderIndex]).
      prisma.routePoint.findUnique.mockResolvedValue(pointA);
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.delete.mockResolvedValue(pointA);
      prisma.routePoint.findMany.mockResolvedValue([
        { id: 'point-b', routeId: 'route-1', orderIndex: 1 },
        { id: 'point-c', routeId: 'route-1', orderIndex: 2 },
      ]);
      prisma.routePoint.update.mockResolvedValue({});

      await service.removePoint('point-a');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.routePoint.delete).toHaveBeenCalledWith({ where: { id: 'point-a' } });
      // Первый проход — в «безопасную зону», второй — плотная нумерация 0..n-1.
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'point-b' },
        data: { orderIndex: 100_000 },
      });
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'point-c' },
        data: { orderIndex: 100_001 },
      });
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'point-b' },
        data: { orderIndex: 0 },
      });
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'point-c' },
        data: { orderIndex: 1 },
      });
    });

    it('удаление последней точки не трогает остальные', async () => {
      prisma.routePoint.findUnique.mockResolvedValue(pointA);
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.delete.mockResolvedValue(pointA);
      prisma.routePoint.findMany.mockResolvedValue([]);

      await service.removePoint('point-a');

      expect(prisma.routePoint.update).not.toHaveBeenCalled();
    });

    it('нет точки → NotFoundException', async () => {
      prisma.routePoint.findUnique.mockResolvedValue(null);

      await expect(service.removePoint('missing')).rejects.toThrow('Точка маршрута не найдена');
      expect(prisma.routePoint.delete).not.toHaveBeenCalled();
    });

    it('точка архивного маршрута не удаляется → BadRequestException', async () => {
      prisma.routePoint.findUnique.mockResolvedValue(pointA);
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, status: 'ARCHIVED' });

      await expect(service.removePoint('point-a')).rejects.toThrow(
        'Архивный маршрут нельзя изменить',
      );
      expect(prisma.routePoint.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorderPoints', () => {
    it('переставляет точки и возвращает их в новом порядке', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.findMany
        .mockResolvedValueOnce([pointA, pointB])
        .mockResolvedValueOnce([{ ...pointB, orderIndex: 0 }, { ...pointA, orderIndex: 1 }]);
      prisma.routePoint.update.mockResolvedValue({});

      const result = await service.reorderPoints('route-1', { pointIds: ['point-b', 'point-a'] });

      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'point-b' },
        data: { orderIndex: 100_000 },
      });
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'point-a' },
        data: { orderIndex: 100_001 },
      });
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'point-b' },
        data: { orderIndex: 0 },
      });
      expect(prisma.routePoint.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'point-a' },
        data: { orderIndex: 1 },
      });
      // Финальный список читается с include room — он уходит прямо в ответ API.
      expect(prisma.routePoint.findMany).toHaveBeenLastCalledWith({
        where: { routeId: 'route-1' },
        orderBy: { orderIndex: 'asc' },
        include: { room: true },
      });
      expect(result.points).toHaveLength(2);
    });

    it('чужая точка в списке → BadRequestException с именем маршрута', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.findMany.mockResolvedValue([pointA, pointB]);

      await expect(
        service.reorderPoints('route-1', { pointIds: ['point-a', 'point-x'] }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reorderPoints('route-1', { pointIds: ['point-a', 'point-x'] }),
      ).rejects.toThrow('Точки не принадлежат маршруту Утренняя уборка: point-x');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('неполный список → BadRequestException (потеря точек недопустима)', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.findMany.mockResolvedValue([pointA, pointB]);

      await expect(service.reorderPoints('route-1', { pointIds: ['point-a'] })).rejects.toThrow(
        'Передан неполный список точек: в маршруте 2, передано 1',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('дубликат id в списке → BadRequestException', async () => {
      // Дубликат не проходит @ArrayUnique на уровне DTO, но сервис обязан
      // защищаться сам: количество может совпадать, а точка повторяться.
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.findMany.mockResolvedValueOnce([pointA, pointB]);

      await expect(
        service.reorderPoints('route-1', { pointIds: ['point-a', 'point-a'] }),
      ).rejects.toThrow('pointIds содержит дубликаты');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reorder архивного маршрута → BadRequestException', async () => {
      prisma.route.findUnique.mockResolvedValue({ ...routeFixture, status: 'ARCHIVED' });

      await expect(
        service.reorderPoints('route-1', { pointIds: ['point-b', 'point-a'] }),
      ).rejects.toThrow('Архивный маршрут нельзя изменить');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('нет маршрута → NotFoundException', async () => {
      prisma.route.findUnique.mockResolvedValue(null);

      await expect(
        service.reorderPoints('missing', { pointIds: ['point-a'] }),
      ).rejects.toThrow('Маршрут не найден');
    });

    it('маршрут без точек и пустой список: транзакция проходит вхолостую', async () => {
      prisma.route.findUnique.mockResolvedValue(routeFixture);
      prisma.routePoint.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await expect(service.reorderPoints('route-1', { pointIds: [] })).resolves.toEqual({
        points: [],
      });
      expect(prisma.routePoint.update).not.toHaveBeenCalled();
    });
  });

  describe('sumEstimatedTime', () => {
    it('суммирует время, считая null нулём', () => {
      expect(
        sumEstimatedTime([{ estimatedTimeMin: 5 }, { estimatedTimeMin: null }, { estimatedTimeMin: 10 }]),
      ).toBe(15);
    });

    it('пустой список даёт 0, а не NaN', () => {
      expect(sumEstimatedTime([])).toBe(0);
    });
  });
});
