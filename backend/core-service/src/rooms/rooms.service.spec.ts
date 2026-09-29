import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from './rooms.service';

interface PrismaMockShape {
  floor: { findUnique: jest.Mock };
  room: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  techCard: { findUnique: jest.Mock };
}

function createPrismaMock(): PrismaMockShape {
  return {
    floor: { findUnique: jest.fn() },
    room: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    techCard: { findUnique: jest.fn() },
  };
}

const floorWithPlan = {
  id: 'floor-1',
  objectId: 'obj-1',
  number: 1,
  name: 'Первый этаж',
  planImageUrl: 'http://minio/plan.png',
  planScale: 0.05,
  planWidth: null,
  planHeight: null,
};

/** Этаж с планом, у которого известны реальные размеры изображения (дефект B). */
const floorWithSizedPlan = {
  ...floorWithPlan,
  planWidth: 1200,
  planHeight: 800,
};

const floorWithoutPlan = { ...floorWithPlan, planImageUrl: null };

const roomFixture = {
  id: 'room-1',
  floorId: 'floor-1',
  name: 'Санузел 101',
  areaM2: 12.5,
  floorType: 'sanitary',
  coordsX: 10,
  coordsY: 20,
  coordsWidth: 30,
  coordsHeight: 40,
  zone: 'A',
  techCardId: null,
};

/** Помещение, у которого координаты ещё не проставлены. */
const roomWithoutCoords = {
  ...roomFixture,
  coordsX: null,
  coordsY: null,
  coordsWidth: null,
  coordsHeight: null,
};

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: PrismaMockShape;
  const originalPlanMaxSize = process.env.PLAN_MAX_SIZE;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Размер плана берётся из env (у core нет доступа к метаданным MinIO),
    // поэтому фиксируем его, чтобы тесты не зависели от машины.
    process.env.PLAN_MAX_SIZE = '1000';
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [RoomsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  afterEach(() => {
    if (originalPlanMaxSize === undefined) {
      delete process.env.PLAN_MAX_SIZE;
    } else {
      process.env.PLAN_MAX_SIZE = originalPlanMaxSize;
    }
  });

  describe('create', () => {
    const baseDto = { name: 'Санузел 101', areaM2: 12.5, floorType: 'sanitary' };

    it('создаёт помещение без координат даже у этажа без плана', async () => {
      // Координат нет — проверять их нечего, план не требуется.
      prisma.floor.findUnique.mockResolvedValue(floorWithoutPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', baseDto)).resolves.toBe(roomFixture);

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: {
          floorId: 'floor-1',
          name: 'Санузел 101',
          areaM2: 12.5,
          floorType: 'sanitary',
          coordsX: undefined,
          coordsY: undefined,
          coordsWidth: undefined,
          coordsHeight: undefined,
          zone: undefined,
          techCardId: null,
        },
      });
    });

    it('нет этажа → NotFoundException (помещение не может висеть без этажа)', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.create('missing', baseDto)).rejects.toThrow(NotFoundException);
      await expect(service.create('missing', baseDto)).rejects.toThrow('Этаж не найден');
      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    it('координаты без загруженного плана → BadRequestException', async () => {
      // Без плана координаты бессмысленны: их не к чему привязать, а границы неизвестны.
      prisma.floor.findUnique.mockResolvedValue(floorWithoutPlan);

      await expect(service.create('floor-1', { ...baseDto, coordsX: 10 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('floor-1', { ...baseDto, coordsX: 10 })).rejects.toThrow(
        'Нельзя задать координаты помещения: у этажа не загружен план',
      );
      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    it('координаты внутри плана сохраняются как есть', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await service.create('floor-1', {
        ...baseDto,
        coordsX: 10,
        coordsY: 20,
        coordsWidth: 30,
        coordsHeight: 40,
        zone: 'A',
      });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          coordsX: 10,
          coordsY: 20,
          coordsWidth: 30,
          coordsHeight: 40,
          zone: 'A',
        }),
      });
    });

    it('только coordsX: остальные координаты не заданы и считаются нулём', async () => {
      // Проверяем именно ветку «есть хотя бы одна координата» + подстановку 0 по умолчанию.
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', { ...baseDto, coordsX: 999 })).resolves.toBe(
        roomFixture,
      );
    });

    it('только coordsY: граница проверяется и по высоте', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', { ...baseDto, coordsY: 999 })).resolves.toBe(
        roomFixture,
      );
    });

    it('только coordsWidth: x и y подставляются нулями', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', { ...baseDto, coordsWidth: 1000 })).resolves.toBe(
        roomFixture,
      );
    });

    it('только coordsHeight: x и y подставляются нулями', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', { ...baseDto, coordsHeight: 1000 })).resolves.toBe(
        roomFixture,
      );
    });

    it('coordsX за пределами плана → BadRequestException с размерами плана', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);

      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 2000, coordsY: 5 }),
      ).rejects.toThrow('Координаты (2000, 5) выходят за размеры плана 1000×1000');
    });

    it('coordsY за пределами плана → BadRequestException', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);

      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 5, coordsY: 2000 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 5, coordsY: 2000 }),
      ).rejects.toThrow('Координаты (5, 2000) выходят за размеры плана 1000×1000');
    });

    it('область выходит за ширину плана → BadRequestException с арифметикой', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);

      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 900, coordsWidth: 200 }),
      ).rejects.toThrow('Область выходит за ширину плана: x=900 + width=200 > 1000');
    });

    it('область выходит за высоту плана → BadRequestException с арифметикой', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);

      await expect(
        service.create('floor-1', { ...baseDto, coordsY: 900, coordsHeight: 200 }),
      ).rejects.toThrow('Область выходит за высоту плана: y=900 + height=200 > 1000');
    });

    // ── Дефект B: координаты сверяются с РЕАЛЬНЫМ размером плана, а не PLAN_MAX_SIZE ──

    it('с реальными размерами плана валидация идёт по ним, а не по PLAN_MAX_SIZE', async () => {
      // План 1200×800. X=1100 входит в реальный план (≤1200), но вышло бы за
      // fallback 1000×1000 из beforeEach — значит, используется РЕАЛЬНЫЙ размер.
      prisma.floor.findUnique.mockResolvedValue(floorWithSizedPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 1100, coordsY: 700 }),
      ).resolves.toBe(roomFixture);
    });

    it('реальные размеры: координаты за границей плана → 400 с размером плана', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithSizedPlan);

      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 1300, coordsY: 5 }),
      ).rejects.toThrow('Координаты (1300, 5) выходят за размеры плана 1200×800');
      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 5, coordsY: 900 }),
      ).rejects.toThrow('Координаты (5, 900) выходят за размеры плана 1200×800');
    });

    it('реальные размеры: область выходит за ширину/высоту плана → 400', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithSizedPlan);

      await expect(
        service.create('floor-1', { ...baseDto, coordsX: 1100, coordsWidth: 200 }),
      ).rejects.toThrow('Область выходит за ширину плана: x=1100 + width=200 > 1200');
      await expect(
        service.create('floor-1', { ...baseDto, coordsY: 700, coordsHeight: 200 }),
      ).rejects.toThrow('Область выходит за высоту плана: y=700 + height=200 > 800');
    });

    it('план без размеров (старые данные) → fallback на PLAN_MAX_SIZE', async () => {
      // planWidth/planHeight = null (план привязан до появления размеров):
      // валидация продолжает работать по PLAN_MAX_SIZE, а не ломается.
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);

      await expect(service.create('floor-1', { ...baseDto, coordsX: 2000 })).rejects.toThrow(
        'Координаты (2000, 0) выходят за размеры плана 1000×1000',
      );
    });

    it('без PLAN_MAX_SIZE берёт дефолт 10000×10000', async () => {
      delete process.env.PLAN_MAX_SIZE;
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      // 9000 укладывается в дефолт, но не уложилось бы в 1000 — так мы фиксируем сам дефолт.
      await expect(service.create('floor-1', { ...baseDto, coordsX: 9000 })).resolves.toBe(
        roomFixture,
      );
    });

    it('нечисловой PLAN_MAX_SIZE → дефолт 10000', async () => {
      process.env.PLAN_MAX_SIZE = 'не-число';
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', { ...baseDto, coordsX: 9000 })).resolves.toBe(
        roomFixture,
      );
    });

    it('неположительный PLAN_MAX_SIZE → дефолт 10000', async () => {
      process.env.PLAN_MAX_SIZE = '-500';
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.create.mockResolvedValue(roomFixture);

      await expect(service.create('floor-1', { ...baseDto, coordsX: 9000 })).resolves.toBe(
        roomFixture,
      );
    });

    it('techCardId проверяется на существование и сохраняется', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.techCard.findUnique.mockResolvedValue({ id: 'tc-1', name: 'Влажная уборка' });
      prisma.room.create.mockResolvedValue({ ...roomFixture, techCardId: 'tc-1' });

      await service.create('floor-1', { ...baseDto, techCardId: 'tc-1' });

      expect(prisma.techCard.findUnique).toHaveBeenCalledWith({ where: { id: 'tc-1' } });
      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ techCardId: 'tc-1' }),
      });
    });

    it('несуществующая техкарта → NotFoundException', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(
        service.create('floor-1', { ...baseDto, techCardId: 'missing' }),
      ).rejects.toThrow('Техкарта не найдена');
      expect(prisma.room.create).not.toHaveBeenCalled();
    });
  });

  describe('listByFloor', () => {
    it('отдаёт помещения по алфавиту вместе с техкартой', async () => {
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.findMany.mockResolvedValue([roomFixture]);

      await expect(service.listByFloor('floor-1')).resolves.toEqual([roomFixture]);

      expect(prisma.room.findMany).toHaveBeenCalledWith({
        where: { floorId: 'floor-1' },
        orderBy: { name: 'asc' },
        include: { techCard: { select: { id: true, name: true } } },
      });
    });

    it('нет этажа → NotFoundException, а не пустая экспликация', async () => {
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.listByFloor('missing')).rejects.toThrow('Этаж не найден');
      expect(prisma.room.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('возвращает помещение', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);

      await expect(service.getById('room-1')).resolves.toBe(roomFixture);
      expect(prisma.room.findUnique).toHaveBeenCalledWith({ where: { id: 'room-1' } });
    });

    it('нет помещения → NotFoundException', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toThrow('Помещение не найдено');
    });
  });

  describe('update', () => {
    it('переносит координаты из текущего помещения, если в DTO их нет', async () => {
      // Координаты в DTO не передаются, но проверять всё равно нужно — берём текущие.
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.update.mockResolvedValue({ ...roomFixture, name: 'Санузел 102' });

      await service.update('room-1', { name: 'Санузел 102' });

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: {
          name: 'Санузел 102',
          areaM2: undefined,
          floorType: undefined,
          coordsX: undefined,
          coordsY: undefined,
          coordsWidth: undefined,
          coordsHeight: undefined,
          zone: undefined,
        },
      });
    });

    it('DTO-координаты перекрывают текущие', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.update.mockResolvedValue(roomFixture);

      await service.update('room-1', { coordsX: 100, coordsY: 200 });

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: expect.objectContaining({ coordsX: 100, coordsY: 200 }),
      });
    });

    it('помещение без координат и без координат в DTO проверку не запускает', async () => {
      // Все четыре значения undefined → проверять нечего, даже план не нужен.
      prisma.room.findUnique.mockResolvedValue(roomWithoutCoords);
      prisma.floor.findUnique.mockResolvedValue(floorWithoutPlan);
      prisma.room.update.mockResolvedValue(roomWithoutCoords);

      await expect(service.update('room-1', { name: 'Без координат' })).resolves.toBe(
        roomWithoutCoords,
      );
      expect(prisma.room.update).toHaveBeenCalled();
    });

    it('сдвиг существующей области за пределы плана → BadRequestException', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);

      await expect(service.update('room-1', { coordsX: 990 })).rejects.toThrow(
        'Область выходит за ширину плана: x=990 + width=30 > 1000',
      );
      expect(prisma.room.update).not.toHaveBeenCalled();
    });

    it('техкарта проверяется и подставляется', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.techCard.findUnique.mockResolvedValue({ id: 'tc-2' });
      prisma.room.update.mockResolvedValue({ ...roomFixture, techCardId: 'tc-2' });

      await service.update('room-1', { techCardId: 'tc-2' });

      const data = prisma.room.update.mock.calls[0][0].data;
      expect(data.techCardId).toBe('tc-2');
    });

    it('techCardId: null отвязывает техкарту', async () => {
      prisma.room.findUnique.mockResolvedValue({ ...roomFixture, techCardId: 'tc-1' });
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.update.mockResolvedValue(roomWithoutCoords);

      await service.update('room-1', { techCardId: null });

      const data = prisma.room.update.mock.calls[0][0].data;
      expect(data.techCardId).toBeNull();
      // null — это «отвязать», поэтому проверка существования техкарты не выполняется.
      expect(prisma.techCard.findUnique).not.toHaveBeenCalled();
    });

    it('отсутствие techCardId в DTO не трогает связь вообще', async () => {
      // undefined — «не менять»; если бы поле ушло как undefined, Prisma
      // могла бы обнулить связь при некоторых стратегиях, поэтому ключа быть не должно.
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.room.update.mockResolvedValue(roomFixture);

      await service.update('room-1', { name: 'X' });

      const data = prisma.room.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('techCardId');
      expect(prisma.techCard.findUnique).not.toHaveBeenCalled();
    });

    it('несуществующая техкарта → NotFoundException', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(floorWithPlan);
      prisma.techCard.findUnique.mockResolvedValue(null);

      await expect(service.update('room-1', { techCardId: 'missing' })).rejects.toThrow(
        'Техкарта не найдена',
      );
      expect(prisma.room.update).not.toHaveBeenCalled();
    });

    it('нет помещения → NotFoundException', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        'Помещение не найдено',
      );
    });

    it('этаж помещения пропал → NotFoundException', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.floor.findUnique.mockResolvedValue(null);

      await expect(service.update('room-1', { name: 'X' })).rejects.toThrow('Этаж не найден');
    });
  });

  describe('remove', () => {
    it('удаляет помещение', async () => {
      prisma.room.findUnique.mockResolvedValue(roomFixture);
      prisma.room.delete.mockResolvedValue(roomFixture);

      await expect(service.remove('room-1')).resolves.toBeUndefined();
      expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: 'room-1' } });
    });

    it('нет помещения → NotFoundException без удаления', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.room.delete).not.toHaveBeenCalled();
    });
  });
});
