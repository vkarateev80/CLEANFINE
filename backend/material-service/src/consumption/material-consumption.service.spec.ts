import { Prisma } from '@prisma/client';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { EventsPublisher } from '../amqp/events.publisher';
import { CoreMaterialsClient } from '../integration/core-materials.client';
import { OperationMaterialsResolver } from '../integration/operation-materials.resolver';
import { MaterialsService } from '../materials/materials.service';
import {
  MaterialConsumptionService,
  SYSTEM_USER_ID,
  consumptionQuantity,
  isUniqueViolation,
} from './material-consumption.service';

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

interface MockOptions {
  /** Количество, которое Prisma вернёт как остаток после списания. */
  stockQuantity?: number;
  /** Остаток, который «прочитает» upsert (для проверки ухода в минус). */
  currentQuantity?: number;
  /** Бросать P2002 на записи ConsumedOperation (повторная доставка). */
  duplicate?: boolean;
  /** Минимальный порог материала. */
  threshold?: number;
  /** Есть ли материал в справочнике (для проверки порога). */
  materialExists?: boolean;
  /** Ошибка при любой записи движения. */
  failMovement?: Error;
}

/** Форма мока Prisma: только методы, которые реально вызывает консьюмер списания. */
interface PrismaMockShape {
  materialMovement: { create: jest.Mock };
  materialStock: { upsert: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock };
  consumedOperation: { create: jest.Mock };
  material: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

function createMocks(options: MockOptions = {}) {
  const prisma: PrismaMockShape = {
    materialMovement: { create: jest.fn() },
    materialStock: {
      upsert: jest.fn().mockResolvedValue({ quantity: options.currentQuantity ?? 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ quantity: options.stockQuantity ?? 0 }),
    },
    consumedOperation: { create: jest.fn() },
    material: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown): unknown =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  prisma.materialMovement.create.mockImplementation(() => {
    if (options.failMovement) {
      return Promise.reject(options.failMovement);
    }
    return Promise.resolve({ id: 'mov-1' });
  });
  prisma.consumedOperation.create.mockImplementation(() =>
    options.duplicate ? Promise.reject(uniqueViolation()) : Promise.resolve({ id: 'cons-1' }),
  );
  prisma.material.findUnique.mockResolvedValue(
    options.materialExists === false
      ? null
      : { id: 'mat-1', name: 'Мыло', minStockThreshold: options.threshold ?? 5 },
  );

  const materials = {
    applyMovementWithinTransaction: jest
      .fn()
      .mockResolvedValue([{ objectId: 'obj-1', quantity: 0 }]),
  } as unknown as MaterialsService;
  const publisher = { publish: jest.fn().mockResolvedValue(true) } as unknown as EventsPublisher;
  const core = {
    getObjectName: jest.fn().mockResolvedValue('БЦ «Северный»'),
  } as unknown as CoreMaterialsClient;
  const resolver = {
    getOperationMaterials: jest
      .fn()
      .mockResolvedValue([{ materialId: 'mat-1', consumptionPerOperation: 2, unit: 'л' }]),
  } as unknown as OperationMaterialsResolver;

  const service = new MaterialConsumptionService(
    prisma as never,
    materials,
    publisher,
    core,
    resolver,
  );

  return { service, prisma, materials, publisher, core, resolver };
}

const EVENT = {
  operationId: 'op-1',
  ticketId: 't-1',
  objectId: 'obj-1',
  completedAt: '2026-01-02T10:00:00.000Z',
};

describe('MaterialConsumptionService (М4.2)', () => {
  it('списывает материалы операции движением OUT и пишет идемпотентность', async () => {
    const { service, prisma, materials, publisher } = createMocks({ stockQuantity: 3 });

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('consumed');
    expect(result.consumed).toEqual([{ materialId: 'mat-1', quantity: 2 }]);
    expect(prisma.materialMovement.create).toHaveBeenCalledWith({
      data: {
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'OUT',
        quantity: 2,
        ticketId: 't-1',
        userId: SYSTEM_USER_ID,
      },
    });
    expect(materials.applyMovementWithinTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ materialId: 'mat-1', objectId: 'obj-1', type: 'OUT', quantity: 2 }),
    );
    expect(prisma.consumedOperation.create).toHaveBeenCalledWith({
      data: {
        operationId: 'op-1',
        materialId: 'mat-1',
        ticketId: 't-1',
        objectId: 'obj-1',
        quantity: 2,
        movementId: 'mov-1',
      },
    });
    // Остаток 3 < порога 5 → material.low.
    expect(publisher.publish).toHaveBeenCalledWith(ROUTING_KEYS.MATERIAL_LOW, {
      materialId: 'mat-1',
      materialName: 'Мыло',
      objectId: 'obj-1',
      objectName: 'БЦ «Северный»',
      quantity: 3,
      threshold: 5,
    });
  });

  it('повторная доставка не списывает дважды (P2002) и не публикует порог', async () => {
    const { service, prisma, publisher } = createMocks({ duplicate: true, stockQuantity: 1 });

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('duplicate');
    expect(result.consumed).toEqual([]);
    expect(result.duplicates).toEqual(['mat-1']);
    // Транзакция откатывается вместе с движением — второго списания нет.
    expect(prisma.materialMovement.create).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('остаток выше порога — material.low не публикуется', async () => {
    const { service, publisher } = createMocks({ stockQuantity: 50 });
    await service.handleOperationCompleted(EVENT);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('недоступность core (название объекта) не мешает событию', async () => {
    const { service, core, publisher } = createMocks({ stockQuantity: 1 });
    (core.getObjectName as jest.Mock).mockResolvedValue(null);

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('consumed');
    expect(publisher.publish).toHaveBeenCalledWith(
      ROUTING_KEYS.MATERIAL_LOW,
      expect.objectContaining({ objectName: 'obj-1' }),
    );
  });

  it('если материалы операции не определены (null) — пропуск без списания', async () => {
    const { service, resolver, prisma } = createMocks();
    (resolver.getOperationMaterials as jest.Mock).mockResolvedValue(null);

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('skipped');
    expect(prisma.materialMovement.create).not.toHaveBeenCalled();
  });

  it('операция без материалов — пропуск без списания', async () => {
    const { service, resolver, prisma } = createMocks();
    (resolver.getOperationMaterials as jest.Mock).mockResolvedValue([]);

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('skipped');
    expect(prisma.materialMovement.create).not.toHaveBeenCalled();
  });

  it('нулевой расход в техкарте не списывает материал', async () => {
    const { service, resolver, prisma, publisher } = createMocks();
    (resolver.getOperationMaterials as jest.Mock).mockResolvedValue([
      { materialId: 'mat-zero', consumptionPerOperation: 0, unit: 'л' },
    ]);

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('skipped');
    expect(result.failed).toEqual([{ materialId: 'mat-zero', reason: 'нулевой расход' }]);
    expect(prisma.materialMovement.create).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('недостаток остатка — материал в failed, остальные списываются (partial)', async () => {
    const { service, resolver, prisma } = createMocks();
    (resolver.getOperationMaterials as jest.Mock).mockResolvedValue([
      { materialId: 'mat-1', consumptionPerOperation: 2, unit: 'л' },
      { materialId: 'mat-2', consumptionPerOperation: 1, unit: 'шт' },
    ]);
    prisma.materialMovement.create
      .mockResolvedValueOnce({ id: 'mov-1' })
      .mockRejectedValueOnce(
        new Error('Недостаточно материала на объекте obj-1: остаток 0, запрошено 1'),
      );

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('partial');
    expect(result.consumed).toEqual([{ materialId: 'mat-1', quantity: 2 }]);
    expect(result.failed[0]).toMatchObject({ materialId: 'mat-2' });
  });

  it('ошибка выше уровня материалов — статус failed, исключение не пробрасывается', async () => {
    const { service, resolver } = createMocks();
    (resolver.getOperationMaterials as jest.Mock).mockRejectedValue(new Error('boom'));

    const result = await service.handleOperationCompleted(EVENT);

    expect(result.status).toBe('failed');
  });

  it('если материал исчез из справочника, порог не проверяется', async () => {
    const { service, publisher } = createMocks({ materialExists: false, stockQuantity: 0 });
    await service.handleOperationCompleted(EVENT);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});

describe('потребление: вспомогательные правила', () => {
  it('consumptionQuantity принимает только положительное конечное число', () => {
    expect(consumptionQuantity({ consumptionPerOperation: 2.5 })).toBe(2.5);
    expect(consumptionQuantity({ consumptionPerOperation: 0 })).toBeNull();
    expect(consumptionQuantity({ consumptionPerOperation: -1 })).toBeNull();
    expect(consumptionQuantity({ consumptionPerOperation: Number.NaN })).toBeNull();
    expect(consumptionQuantity({ consumptionPerOperation: '2' as unknown as number })).toBeNull();
  });

  it('isUniqueViolation распознаёт только P2002 Prisma', () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
    expect(
      isUniqueViolation(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      ),
    ).toBe(false);
  });
});
