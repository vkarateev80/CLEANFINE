import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuthServiceClient } from './auth-service.client';
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
  ownerClientId: null as string | null,
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
  let authClient: { assertClientAccount: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    authClient = { assertClientAccount: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ObjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthServiceClient, useValue: authClient },
      ],
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

    it('без ownerClientId: валидация НЕ вызывается, ключа в data нет', async () => {
      // Ключевая проверка «поля нет»: приложение не должно ни ходить в auth-service,
      // ни записывать ownerClientId (иначе колонка получила бы undefined/мусор).
      prisma.object.create.mockResolvedValue(objectFixture);

      await service.create(createDto as never);

      expect(authClient.assertClientAccount).not.toHaveBeenCalled();
      const data = prisma.object.create.mock.calls[0][0].data as Record<string, unknown>;
      expect('ownerClientId' in data).toBe(false);
    });

    it('create с ownerClientId=null трактует как «привязки нет» без валидации', async () => {
      prisma.object.create.mockResolvedValue(objectFixture);

      await service.create({ ...createDto, ownerClientId: null } as never);

      expect(authClient.assertClientAccount).not.toHaveBeenCalled();
      const data = prisma.object.create.mock.calls[0][0].data as Record<string, unknown>;
      expect('ownerClientId' in data).toBe(false);
    });

    it('create с непустым ownerClientId валидирует аккаунт и записывает его', async () => {
      prisma.object.create.mockResolvedValue({ ...objectFixture, ownerClientId: 'client-1' });

      await service.create({ ...createDto, ownerClientId: 'client-1' } as never);

      expect(authClient.assertClientAccount).toHaveBeenCalledWith('client-1');
      expect(prisma.object.create).toHaveBeenCalledWith({
        data: { ...createDto, status: 'ACTIVE', ownerClientId: 'client-1' },
      });
    });

    it('create: отказ валидации (400) не создаёт объект', async () => {
      authClient.assertClientAccount.mockRejectedValue(
        new BadRequestException('Аккаунт заказчика не найден'),
      );

      await expect(
        service.create({ ...createDto, ownerClientId: 'ghost' } as never),
      ).rejects.toThrow('Аккаунт заказчика не найден');
      expect(prisma.object.create).not.toHaveBeenCalled();
    });

    it('create: недоступность auth (503) не создаёт объект (fail-closed)', async () => {
      authClient.assertClientAccount.mockRejectedValue(
        new ServiceUnavailableException('Не удалось проверить аккаунт заказчика'),
      );

      await expect(
        service.create({ ...createDto, ownerClientId: 'client-1' } as never),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.object.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.object.findMany.mockResolvedValue([objectFixture]);
      prisma.object.count.mockResolvedValue(1);
    });

    it('без фильтров отдаёт первые 50 записей и общее количество', async () => {
      const result = await service.list({});

      // where содержит только переданные фильтры (все undefined), без OR-поиска.
      expect(prisma.object.findMany).toHaveBeenCalledWith({
        where: { status: undefined, type: undefined, ownerClientId: undefined },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
      });
      expect(prisma.object.count).toHaveBeenCalledWith({
        where: { status: undefined, type: undefined, ownerClientId: undefined },
      });
      expect(result).toEqual({ items: [objectFixture], total: 1 });
    });

    it('фильтр ownerClientId уходит в where (портал ищет свой объект по id)', async () => {
      await service.list({ ownerClientId: 'client-1' });

      expect(prisma.object.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ownerClientId: 'client-1' }) }),
      );
      expect(prisma.object.count).toHaveBeenCalledWith({
        where: { status: undefined, type: undefined, ownerClientId: 'client-1' },
      });
    });

    it('ownerClientId комбинируется с status/type/search через AND', async () => {
      await service.list({
        ownerClientId: 'client-1',
        status: 'ACTIVE',
        type: 'business-center',
        search: 'север',
      });

      expect(prisma.object.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          type: 'business-center',
          ownerClientId: 'client-1',
          OR: [
            { name: { contains: 'север', mode: 'insensitive' } },
            { address: { contains: 'север', mode: 'insensitive' } },
            { clientName: { contains: 'север', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
      });
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
          ownerClientId: undefined,
          OR: [
            { name: { contains: 'север', mode: 'insensitive' } },
            { address: { contains: 'север', mode: 'insensitive' } },
            { clientName: { contains: 'север', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

    // САМЫЙ ВАЖНЫЙ ТЕСТ ПРОЕКТА: «поля нет» ≠ «null».
    // Если сюда попадёт ownerClientId, обычное редактирование названия будет
    // СНИМАТЬ привязку объекта к аккаунту заказчика.
    it('без поля ownerClientId: привязка НЕ затирается (ключа нет в data)', async () => {
      prisma.object.findUnique.mockResolvedValue({ ...objectFixture, ownerClientId: 'client-1' });
      prisma.object.update.mockResolvedValue({ ...objectFixture, ownerClientId: 'client-1' });

      await service.update('obj-1', { name: 'Новое имя' });

      const data = prisma.object.update.mock.calls[0][0].data as Record<string, unknown>;
      expect('ownerClientId' in data).toBe(false);
      expect(authClient.assertClientAccount).not.toHaveBeenCalled();
    });

    it('пустой DTO тоже не трогает привязку', async () => {
      prisma.object.findUnique.mockResolvedValue({ ...objectFixture, ownerClientId: 'client-1' });
      prisma.object.update.mockResolvedValue(objectFixture);

      await service.update('obj-1', {});

      const data = prisma.object.update.mock.calls[0][0].data as Record<string, unknown>;
      expect('ownerClientId' in data).toBe(false);
      expect(authClient.assertClientAccount).not.toHaveBeenCalled();
    });

    it('ownerClientId=null снимает привязку без обращения к auth-service', async () => {
      prisma.object.findUnique.mockResolvedValue({ ...objectFixture, ownerClientId: 'client-1' });
      prisma.object.update.mockResolvedValue({ ...objectFixture, ownerClientId: null });

      await service.update('obj-1', { ownerClientId: null });

      expect(authClient.assertClientAccount).not.toHaveBeenCalled();
      const data = prisma.object.update.mock.calls[0][0].data as Record<string, unknown>;
      expect('ownerClientId' in data).toBe(true);
      expect(data.ownerClientId).toBeNull();
    });

    it('ownerClientId="" нормализуется в null (снять привязку)', async () => {
      // Пустая строка не должна попасть в базу как «ссылка-пустышка».
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.object.update.mockResolvedValue(objectFixture);

      await service.update('obj-1', { ownerClientId: '' });

      expect(authClient.assertClientAccount).not.toHaveBeenCalled();
      const data = prisma.object.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.ownerClientId).toBeNull();
    });

    it('ownerClientId=строка: сначала валидация, потом запись', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      prisma.object.update.mockResolvedValue({ ...objectFixture, ownerClientId: 'client-2' });

      await service.update('obj-1', { ownerClientId: 'client-2' });

      expect(authClient.assertClientAccount).toHaveBeenCalledWith('client-2');
      const data = prisma.object.update.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.ownerClientId).toBe('client-2');
      // Валидация обязана быть ДО записи: сначала assertClientAccount, затем update.
      expect(authClient.assertClientAccount.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.object.update.mock.invocationCallOrder[0],
      );
    });

    it('400 от auth-service (аккаунт не найден) → объект НЕ обновляется', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      authClient.assertClientAccount.mockRejectedValue(
        new BadRequestException('Аккаунт заказчика не найден'),
      );

      await expect(service.update('obj-1', { ownerClientId: 'ghost' })).rejects.toThrow(
        'Аккаунт заказчика не найден',
      );
      expect(prisma.object.update).not.toHaveBeenCalled();
    });

    it('503 от auth-service (недоступен) → объект НЕ обновляется (fail-closed)', async () => {
      prisma.object.findUnique.mockResolvedValue(objectFixture);
      authClient.assertClientAccount.mockRejectedValue(
        new ServiceUnavailableException('Не удалось проверить аккаунт заказчика'),
      );

      await expect(service.update('obj-1', { ownerClientId: 'client-1' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.object.update).not.toHaveBeenCalled();
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
