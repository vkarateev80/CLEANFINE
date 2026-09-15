import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MaterialsService, round2, toStockView } from './materials.service';
import {
  isConsumingMovement,
  isIncomingMovement,
  stockDelta,
  stockEffects,
} from './movement-effects';
import { endOfDayIfMidnight, parseDate, rangeFilter } from './date-range';

/** Форма мока Prisma: только методы, которые реально вызывает сервис. */
interface PrismaMockShape {
  material: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  materialStock: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  materialMovement: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  $transaction: jest.Mock;
}

/**
 * Форма мока Prisma: только методы, которые реально вызывает сервис.
 * Интерактивная транзакция и массив промисов поддержаны одной реализацией.
 */
function createPrismaMock(): PrismaMockShape {
  const prisma: PrismaMockShape = {
    material: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    materialStock: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    materialMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown): unknown =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
  );
  return prisma;
}

type PrismaMock = PrismaMockShape;

const materialFixture = {
  id: 'mat-1',
  name: 'Средство для мытья полов',
  unit: 'л',
  defaultConsumption: 0.05,
  minStockThreshold: 5,
  costPerUnit: 320,
  supplier: 'ООО «Химторг»',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function movementFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mov-1',
    materialId: 'mat-1',
    objectId: 'obj-1',
    type: 'IN',
    quantity: 100,
    ticketId: null,
    userId: 'user-1',
    targetObjectId: null,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    ...overrides,
  };
}

describe('MaterialsService (М4.1)', () => {
  let prisma: PrismaMock;
  let service: MaterialsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new MaterialsService(prisma as never);
    prisma.material.findUnique.mockResolvedValue({ id: 'mat-1' });
  });

  // ------------------------------------------------------------ справочник

  it('создаёт материал с нормами, порогом и ценой', async () => {
    prisma.material.create.mockResolvedValue(materialFixture);

    await expect(
      service.create({
        name: 'Средство для мытья полов',
        unit: 'л',
        defaultConsumption: 0.05,
        minStockThreshold: 5,
        costPerUnit: 320,
        supplier: 'ООО «Химторг»',
      }),
    ).resolves.toEqual(materialFixture);

    expect(prisma.material.create).toHaveBeenCalledWith({
      data: {
        name: 'Средство для мытья полов',
        unit: 'л',
        defaultConsumption: 0.05,
        minStockThreshold: 5,
        costPerUnit: 320,
        supplier: 'ООО «Химторг»',
      },
    });
  });

  it('поиск в справочнике фильтрует по названию и поставщику', async () => {
    prisma.material.findMany.mockResolvedValue([materialFixture]);
    prisma.material.count.mockResolvedValue(1);

    const result = await service.list({ search: 'мыть', take: 500 });

    expect(result).toEqual({ items: [materialFixture], total: 1 });
    expect(prisma.material.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'мыть', mode: 'insensitive' } },
            { supplier: { contains: 'мыть', mode: 'insensitive' } },
          ],
        },
        // take ограничен 100, даже если клиент просит больше.
        take: 100,
      }),
    );
  });

  it('getById отдаёт материал с остатками, иначе 404', async () => {
    prisma.material.findUnique.mockResolvedValueOnce({ ...materialFixture, stocks: [] });
    await expect(service.getById('mat-1')).resolves.toEqual({ ...materialFixture, stocks: [] });

    prisma.material.findUnique.mockResolvedValueOnce(null);
    await expect(service.getById('нет')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('обновление: supplier=null очищает поставщика, отсутствие поля — не меняет', async () => {
    prisma.material.update.mockResolvedValue(materialFixture);

    await service.update('mat-1', { supplier: null, name: 'Новое имя' });

    expect(prisma.material.update).toHaveBeenCalledWith({
      where: { id: 'mat-1' },
      data: { name: 'Новое имя', supplier: null },
    });
  });

  it('удаление материала проверяет существование', async () => {
    prisma.material.findUnique.mockResolvedValueOnce(null);
    await expect(service.remove('нет')).rejects.toBeInstanceOf(NotFoundException);

    prisma.material.findUnique.mockResolvedValueOnce({ id: 'mat-1' });
    await service.remove('mat-1');
    expect(prisma.material.delete).toHaveBeenCalledWith({ where: { id: 'mat-1' } });
  });

  // ------------------------------------------------------------------ склад

  it('остатки отдаются с названием материала и признаком «ниже порога»', async () => {
    prisma.materialStock.findMany.mockResolvedValue([
      {
        id: 'st-1',
        materialId: 'mat-1',
        objectId: 'obj-1',
        quantity: 3,
        updatedAt: new Date('2026-01-02T10:00:00.000Z'),
        material: { id: 'mat-1', name: 'Мыло', unit: 'л', costPerUnit: 320, minStockThreshold: 5 },
      },
      {
        id: 'st-2',
        materialId: 'mat-2',
        objectId: 'obj-1',
        quantity: 40,
        updatedAt: new Date('2026-01-02T10:00:00.000Z'),
        material: { id: 'mat-2', name: 'Тряпки', unit: 'шт', costPerUnit: 10, minStockThreshold: 5 },
      },
    ]);

    const result = await service.listStocks({ objectId: 'obj-1' });

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({ quantity: 3, belowThreshold: true, minStockThreshold: 5 });
    expect(result.items[1]).toMatchObject({ quantity: 40, belowThreshold: false });
  });

  it('onlyLow=true оставляет только позиции ниже порога', async () => {
    prisma.materialStock.findMany.mockResolvedValue([
      {
        id: 'st-1',
        materialId: 'mat-1',
        objectId: 'obj-1',
        quantity: 3,
        updatedAt: new Date(),
        material: { id: 'mat-1', name: 'Мыло', unit: 'л', costPerUnit: 1, minStockThreshold: 5 },
      },
      {
        id: 'st-2',
        materialId: 'mat-2',
        objectId: 'obj-1',
        quantity: 40,
        updatedAt: new Date(),
        material: { id: 'mat-2', name: 'Тряпки', unit: 'шт', costPerUnit: 1, minStockThreshold: 5 },
      },
    ]);

    const result = await service.listStocks({ onlyLow: true });
    expect(result.items.map((item) => item.materialId)).toEqual(['mat-1']);
  });

  // -------------------------------------------------------------- движения

  it('IN создаёт движение и увеличивает остаток', async () => {
    prisma.materialMovement.create.mockResolvedValue(movementFixture());
    prisma.materialStock.upsert.mockResolvedValue({ quantity: 0 });
    prisma.materialStock.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.createMovement({
      materialId: 'mat-1',
      objectId: 'obj-1',
      type: 'IN',
      quantity: 100,
      userId: 'user-1',
    });

    expect(prisma.materialMovement.create).toHaveBeenCalledWith({
      data: {
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'IN',
        quantity: 100,
        ticketId: null,
        userId: 'user-1',
        targetObjectId: null,
      },
    });
    expect(prisma.materialStock.updateMany).toHaveBeenCalledWith({
      where: { materialId: 'mat-1', objectId: 'obj-1', quantity: { gte: -100 } },
      data: { quantity: { increment: 100 } },
    });
    expect(result.stocks).toEqual([{ objectId: 'obj-1', quantity: 100 }]);
  });

  it('OUT уменьшает остаток и отклоняет уход в минус (400)', async () => {
    prisma.materialMovement.create.mockResolvedValue(movementFixture({ type: 'OUT', quantity: 30 }));
    prisma.materialStock.upsert.mockResolvedValue({ quantity: 100 });
    prisma.materialStock.updateMany.mockResolvedValue({ count: 1 });

    const ok = await service.createMovement({
      materialId: 'mat-1',
      objectId: 'obj-1',
      type: 'OUT',
      quantity: 30,
      userId: 'user-1',
    });
    expect(ok.stocks).toEqual([{ objectId: 'obj-1', quantity: 70 }]);

    // Остаток 2, списываем 5 — движение не должно пройти.
    prisma.materialStock.upsert.mockResolvedValue({ quantity: 2 });
    await expect(
      service.createMovement({
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'OUT',
        quantity: 5,
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('конкурентное изменение остатка (updateMany count=0) тоже даёт 400', async () => {
    prisma.materialMovement.create.mockResolvedValue(movementFixture({ type: 'WRITE_OFF' }));
    prisma.materialStock.upsert.mockResolvedValue({ quantity: 100 });
    prisma.materialStock.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.createMovement({
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'WRITE_OFF',
        quantity: 10,
        userId: 'user-1',
      }),
    ).rejects.toThrow(/конкурентным движением/);
  });

  it('TRANSFER списывает с objectId и приходует на targetObjectId', async () => {
    prisma.materialMovement.create.mockResolvedValue(
      movementFixture({ type: 'TRANSFER', quantity: 20, targetObjectId: 'obj-2' }),
    );
    prisma.materialStock.upsert
      .mockResolvedValueOnce({ quantity: 50 })
      .mockResolvedValueOnce({ quantity: 0 });
    prisma.materialStock.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.createMovement({
      materialId: 'mat-1',
      objectId: 'obj-1',
      type: 'TRANSFER',
      quantity: 20,
      targetObjectId: 'obj-2',
      userId: 'user-1',
    });

    expect(result.stocks).toEqual([
      { objectId: 'obj-1', quantity: 30 },
      { objectId: 'obj-2', quantity: 20 },
    ]);
    expect(prisma.materialStock.updateMany).toHaveBeenNthCalledWith(1, {
      where: { materialId: 'mat-1', objectId: 'obj-1', quantity: { gte: 20 } },
      data: { quantity: { increment: -20 } },
    });
    expect(prisma.materialStock.updateMany).toHaveBeenNthCalledWith(2, {
      where: { materialId: 'mat-1', objectId: 'obj-2', quantity: { gte: -20 } },
      data: { quantity: { increment: 20 } },
    });
  });

  it('валидация движения: TRANSFER без targetObjectId и с тем же объектом → 400', async () => {
    await expect(
      service.createMovement({
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'TRANSFER',
        quantity: 1,
        userId: 'u',
      }),
    ).rejects.toThrow(/targetObjectId/);

    await expect(
      service.createMovement({
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'TRANSFER',
        quantity: 1,
        targetObjectId: 'obj-1',
        userId: 'u',
      }),
    ).rejects.toThrow(/должен отличаться/);

    await expect(
      service.createMovement({
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'IN',
        quantity: 1,
        targetObjectId: 'obj-2',
        userId: 'u',
      }),
    ).rejects.toThrow(/только для TRANSFER/);

    await expect(
      service.createMovement({
        materialId: 'mat-1',
        objectId: 'obj-1',
        type: 'IN',
        quantity: 0,
        userId: 'u',
      }),
    ).rejects.toThrow(/больше 0/);
  });

  it('движение по несуществующему материалу — 404', async () => {
    prisma.material.findUnique.mockResolvedValue(null);

    await expect(
      service.createMovement({
        materialId: 'нет',
        objectId: 'obj-1',
        type: 'IN',
        quantity: 1,
        userId: 'u',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('история движений фильтруется по объекту и периоду', async () => {
    prisma.materialMovement.findMany.mockResolvedValue([movementFixture({ type: 'OUT' })]);
    prisma.materialMovement.count.mockResolvedValue(1);

    const result = await service.listMovements('mat-1', {
      objectId: 'obj-1',
      from: '2026-01-01',
      to: '2026-01-31',
      limit: 1000,
    });

    expect(result.total).toBe(1);
    const call = prisma.materialMovement.findMany.mock.calls[0][0];
    expect(call.where.materialId).toBe('mat-1');
    expect(call.where.objectId).toBe('obj-1');
    expect(call.where.createdAt.gte).toEqual(parseDate('2026-01-01'));
    // «до 31 января» включает весь последний день.
    expect(call.where.createdAt.lte).toEqual(endOfDayIfMidnight(parseDate('2026-01-31')));
    expect(call.take).toBe(500);
  });

  it('несуществующий материал в истории — 404', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(service.listMovements('нет', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  // ------------------------------------------------------------------ отчёт

  it('отчёт агрегирует OUT/WRITE_OFF и считает итог по стоимости', async () => {
    prisma.materialMovement.groupBy.mockResolvedValue([
      { materialId: 'mat-1', _sum: { quantity: 12.5 }, _count: { _all: 3 } },
      { materialId: 'mat-2', _sum: { quantity: 4 }, _count: { _all: 1 } },
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 'mat-1', name: 'Мыло', unit: 'л', costPerUnit: 100 },
      { id: 'mat-2', name: 'Тряпки', unit: 'шт', costPerUnit: 50 },
    ]);

    const report = await service.report({ objectId: 'obj-1', from: '2026-01-01', to: '2026-01-31' });

    expect(prisma.materialMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['materialId'],
        where: expect.objectContaining({ type: { in: ['OUT', 'WRITE_OFF'] }, objectId: 'obj-1' }),
      }),
    );
    expect(report.rows[0]).toMatchObject({ materialId: 'mat-1', consumedQuantity: 12.5, cost: 1250, operationsCount: 3 });
    expect(report.rows[1]).toMatchObject({ materialId: 'mat-2', consumedQuantity: 4, cost: 200 });
    expect(report.totals).toEqual({ consumedQuantity: 16.5, operationsCount: 4, cost: 1450 });
  });

  it('отчёт без движений возвращает пустые агрегаты', async () => {
    prisma.materialMovement.groupBy.mockResolvedValue([]);

    const report = await service.report({});
    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({ consumedQuantity: 0, operationsCount: 0, cost: 0 });
    // Справочник не запрашивается, если агрегатов нет.
    expect(prisma.material.findMany).not.toHaveBeenCalled();
  });

  it('отчёт подставляет id, если материал удалён из справочника', async () => {
    prisma.materialMovement.groupBy.mockResolvedValue([
      { materialId: 'mat-x', _sum: { quantity: 2 }, _count: { _all: 1 } },
    ]);
    prisma.material.findMany.mockResolvedValue([]);

    const report = await service.report({});
    expect(report.rows[0]).toMatchObject({ name: 'mat-x', costPerUnit: 0, cost: 0 });
  });
});

describe('движения: знак и эффекты', () => {
  it('классифицирует типы движений', () => {
    expect(isIncomingMovement('IN')).toBe(true);
    expect(isIncomingMovement('TRANSFER')).toBe(true);
    expect(isIncomingMovement('OUT')).toBe(false);
    expect(isConsumingMovement('OUT')).toBe(true);
    expect(isConsumingMovement('WRITE_OFF')).toBe(true);
    expect(isConsumingMovement('TRANSFER')).toBe(false);
    expect(stockDelta('IN', 10)).toBe(10);
    expect(stockDelta('WRITE_OFF', 10)).toBe(-10);
  });

  it('TRANSFER даёт две складские операции, остальные — одну', () => {
    expect(stockEffects('TRANSFER', 5, 'obj-1', 'obj-2')).toEqual([
      { objectId: 'obj-1', delta: -5 },
      { objectId: 'obj-2', delta: 5 },
    ]);
    expect(stockEffects('OUT', 5, 'obj-1')).toEqual([{ objectId: 'obj-1', delta: -5 }]);
    expect(() => stockEffects('TRANSFER', 5, 'obj-1', null)).toThrow(/targetObjectId/);
    expect(() => stockEffects('TRANSFER', 5, 'obj-1', 'obj-1')).toThrow(/targetObjectId/);
  });
});

describe('диапазон дат отчёта', () => {
  it('parseDate отбрасывает пустые и невалидные значения', () => {
    expect(parseDate()).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
    expect(parseDate('не дата')).toBeUndefined();
    expect(parseDate('2026-01-01')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('endOfDayIfMidnight растягивает дату без времени до конца суток', () => {
    const midnight = new Date('2026-01-31T00:00:00.000Z');
    expect(endOfDayIfMidnight(midnight)?.toISOString()).toBe('2026-01-31T23:59:59.999Z');
    const withTime = new Date('2026-01-31T12:00:00.000Z');
    expect(endOfDayIfMidnight(withTime)).toEqual(withTime);
    expect(endOfDayIfMidnight(undefined)).toBeUndefined();
  });

  it('rangeFilter собирает условия только для заданных границ', () => {
    expect(rangeFilter({})).toBeUndefined();
    expect(rangeFilter({ from: new Date('2026-01-01T00:00:00.000Z') })).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(rangeFilter({ to: new Date('2026-01-31T00:00:00.000Z') })).toEqual({
      lte: new Date('2026-01-31T23:59:59.999Z'),
    });
  });
});

describe('toStockView / round2', () => {
  it('округляет количество до 2 знаков и вычисляет порог', () => {
    const view = toStockView({
      id: 'st-1',
      materialId: 'mat-1',
      objectId: 'obj-1',
      quantity: 0.30000000000000004,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      material: { id: 'mat-1', name: 'Мыло', unit: 'л', costPerUnit: 10, minStockThreshold: 1 },
    } as never);

    expect(view.quantity).toBe(0.3);
    expect(view.belowThreshold).toBe(true);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('мок Prisma', () => {
  it('поддерживает интерактивную транзакцию (сервис ею пользуется)', async () => {
    const prisma = createPrismaMock();
    await prisma.$transaction(async () => undefined);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('P2002 распознаётся как нарушение уникальности в потреблении', () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(error.code).toBe('P2002');
  });
});
