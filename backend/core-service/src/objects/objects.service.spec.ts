import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectsService } from './objects.service';

/**
 * Контракты домена живут в workspace-пакете @cleaning-ops/shared (собирается в shared/dist),
 * в node_modules его нет, поэтому подменяем модуль виртуальным моком.
 * ВАЖНО: внутри мока повторяем реальную таблицу переходов статусов из shared/types/core.ts,
 * иначе тест проверял бы заглушку, а не бизнес-правило.
 */
jest.mock(
  '@cleaning-ops/shared/types/core',
  () => {
    const OBJECT_ALLOWED_TRANSITIONS: Record<string, string[]> = {
      ACTIVE: ['PAUSED', 'ARCHIVED'],
      PAUSED: ['ACTIVE', 'ARCHIVED'],
      ARCHIVED: [],
    };
    return {
      OBJECT_STATUSES: ['ACTIVE', 'PAUSED', 'ARCHIVED'],
      OBJECT_ALLOWED_TRANSITIONS,
      canTransitionObject: (from: string, to: string): boolean =>
        from === to || (OBJECT_ALLOWED_TRANSITIONS[from] ?? []).includes(to),
    };
  },
  { virtual: true },
);

/** Форма мока Prisma: только те методы, которые реально вызывает сервис. */
interface PrismaMockShape {
  object: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  route: { count: jest.Mock };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaMockShape {
  const prisma: PrismaMockShape = {
    object: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    route: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  // Сервис использует и массив промисов ($transaction([...])), и интерактивную
  // транзакцию; поддерживаем оба варианта одной реализацией.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return prisma;
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

const objectFixture = {
  id: 'obj-1',
  name: 'БЦ «Северный»',
  address: 'г. Москва, ул. Ленинградская, 15',
  lat: 55.7558,
  lng: 37.6173,
  type: 'business-center',
  totalArea: 12500.5,
  floorsCount: 9,
  clientName: 'ООО «Ромашка»',
  clientContact: '+7 495 000-00-00',
  status: 'ACTIVE',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const createDto = {
  name: objectFixture.name,
  address: objectFixture.address,
  lat: objectFixture.lat,
  lng: objectFixture.lng,
  type: objectFixture.type,
  totalArea: objectFixture.totalArea,
  floorsCount: objectFixture.floorsCount,
  clientName: objectFixture.clientName,
  clientContact: objectFixture.clientContact,
};

describe('ObjectsService', () => {
  let service: ObjectsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [ObjectsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ObjectsService);
  });

  describe('create', () => {
    it('по умолчанию создаёт объект в статусе ACTIVE', async () => {
      prisma.object.create.mockResolvedValue(objectFixture);

      await expect(service.create(createDto as never)).resolves.toBe(objectFixture);

      // Статус не передан — сервис обязан подставить ACTIVE, иначе в БД уйдёт undefined
      // и сработает дефолт схемы, который мы здесь фиксируем явно.
      expect(prisma.object.create).toHaveBeenCalledWith({
        data: { ...createDto, status: 'ACTIVE' },
      });
    });

    it('явно переданный статус не перетирает дефолтом', async () => {
      prisma.object.create.mockResolvedValue(objectFixture);

      await service.create({ ...createDto, status: 'PAUSED' } as never);

      expect(prisma.object.create).toHaveBeenCalledWith({
        data: { ...createDto, status: 'PAUSED' },
      });
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.object.findMany.mockResolvedValue([objectFixture]);
      prisma.object.count.mockResolvedValue(1);
    });

    it('без фильтров отдаёт первые 50 записей и общее количество', async () => {
      const result = await service.list({});

      // where содержит только переданные фильтры (оба undefined), без OR-поиска.
      expect(prisma.object.findMany).toHaveBeenCalledWith({
        where: { status: undefined, type: undefined },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
      });
      expect(prisma.object.count).toHaveBeenCalledWith({
        where: { status: undefined, type: undefined },
      });
      expect(result).toEqual({ items: [objectFixture], total: 1 });
    });

    it('применяет skip/take и режет take до 100', async () => {
      // Граница защиты от «выкачай всю базу»: клиент может попросить 500, сервис обязан отдать 100.
      await service.list({ skip: 10, take: 500 });

      expect(prisma.object.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 100 }),
      );
    });

    it('поиск превращается в OR по названию, адресу и заказчику (регистронезависимо)', async () => {
      await service.list({ search: 'север', status: 'ACTIVE', type: 'business-center' });

      expect(prisma.object.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          type: 'business-center',
          OR: [
            { name: { contains: 'север', mode: 'insensitive' } },
            { address: { contains: 'север', mode: 'insensitive' } },
            { clientName: { contains: 'север', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
      });
    });
  });

  describe('getById', () => {
    it('возвращает объект', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);

      await expect(service.getById('obj-1')).resolves.toBe(objectFixture);
      expect(prisma.object.findUnique).toHaveBeenCalledWith({ where: { id: 'obj-1' } });
    });

    it('отсутствующий объект → NotFoundException с текстом для UI', async () => {
      prisma.object.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
      await expect(service.getById('missing')).rejects.toThrow('Объект не найден');
    });
  });

  describe('getDetail', () => {
    it('загружает этажи с помещениями и маршрутами одной выборкой', async () => {
      const detail = { ...objectFixture, floors: [] };
      prisma.object.findUnique.mockResolvedValue(detail);

      await expect(service.getDetail('obj-1')).resolves.toBe(detail);

      // Проверяем именно форму include: карточка объекта в админке строится из этого дерева,
      // и потеря любого вложенного include — регресс без падения других тестов.
      expect(prisma.object.findUnique).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        include: {
          floors: {
            orderBy: { number: 'asc' },
            include: {
              rooms: { orderBy: { name: 'asc' } },
              routes: { orderBy: { name: 'asc' }, include: { points: true } },
            },
          },
        },
      });
    });

    it('отсутствующий объект → NotFoundException', async () => {
      prisma.object.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('обновляет поля и пробрасывает статус в Prisma', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.object.update.mockResolvedValue({ ...objectFixture, name: 'Новое имя' });

      await service.update('obj-1', { name: 'Новое имя' });

      expect(prisma.object.update).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        data: {
          name: 'Новое имя',
          address: undefined,
          lat: undefined,
          lng: undefined,
          type: undefined,
          totalArea: undefined,
          floorsCount: undefined,
          clientName: undefined,
          clientContact: undefined,
          status: undefined,
        },
      });
    });

    it('тот же статус не считается переходом и не проверяется', async () => {
      // ACTIVE → ACTIVE: правило переходов не должно блокировать «холостую» запись.
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.object.update.mockResolvedValue(objectFixture);

      await expect(service.update('obj-1', { status: 'ACTIVE' })).resolves.toBe(objectFixture);
      expect(prisma.object.update).toHaveBeenCalled();
    });

    it('разрешённый переход ACTIVE → ARCHIVED проходит', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.object.update.mockResolvedValue({ ...objectFixture, status: 'ARCHIVED' });

      await expect(service.update('obj-1', { status: 'ARCHIVED' })).resolves.toEqual(
        expect.objectContaining({ status: 'ARCHIVED' }),
      );
    });

    it('запрещённый переход ARCHIVED → ACTIVE → BadRequestException', async () => {
      // ARCHIVED терминальный: вернуть объект в работу «одним PATCH» нельзя.
      prisma.object.findUnique.mockResolvedValue({ ...objectFixture, status: 'ARCHIVED' });

      await expect(service.update('obj-1', { status: 'ACTIVE' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('obj-1', { status: 'ACTIVE' })).rejects.toThrow(
        'Недопустимый переход статуса объекта: ARCHIVED → ACTIVE',
      );
      // Побочный эффект: при запрещённом переходе запись в БД не выполняется вообще.
      expect(prisma.object.update).not.toHaveBeenCalled();
    });

    it('отсутствующий объект → NotFoundException, а не молчаливое создание', async () => {
      prisma.object.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(NotFoundException);
      expect(prisma.object.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('удаляет объект, если активных маршрутов нет', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.route.count.mockResolvedValue(0);
      prisma.object.delete.mockResolvedValue(objectFixture);

      await expect(service.remove('obj-1')).resolves.toBeUndefined();

      expect(prisma.route.count).toHaveBeenCalledWith({
        where: { floor: { objectId: 'obj-1' }, status: 'ACTIVE' },
      });
      expect(prisma.object.delete).toHaveBeenCalledWith({ where: { id: 'obj-1' } });
    });

    it('запрещает удаление объекта с активными маршрутами и сообщает их число', async () => {
      // Каскад снёс бы маршруты вместе с объектом, поэтому сервис требует
      // сначала снять их с эксплуатации (архивировать).
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.route.count.mockResolvedValue(3);

      await expect(service.remove('obj-1')).rejects.toThrow(BadRequestException);
      await expect(service.remove('obj-1')).rejects.toThrow(
        'Нельзя удалить объект: у него 3 активных маршрутов. Переведите их в архив',
      );
      expect(prisma.object.delete).not.toHaveBeenCalled();
    });

    it('отсутствующий объект → NotFoundException до проверки маршрутов', async () => {
      prisma.object.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.route.count).not.toHaveBeenCalled();
      expect(prisma.object.delete).not.toHaveBeenCalled();
    });
  });
});
