import { ReportsService } from './reports.service';
import type { ReportsRepository } from './reports.repository';

/**
 * Тесты read-слоя отчётов material-service (М7.1).
 *
 * Проверяется арифметика, которую нельзя проверить SQL-ом: VIEW отдаёт количество и
 * цену, а стоимость, суммы, ряд по дням и сортировку собирает сервис.
 *
 * Мок — репозиторий: SQL-представления проверяются на живом стенде (e2e
 * `e2e/api/reports.api.spec.ts`), здесь важно, что при разных формах строк read-модели
 * (число/строка из `$queryRaw`, `date` как Date или строка) ответ остаётся корректным.
 */

interface RepositoryMock {
  consumption: jest.Mock;
  consumptionDaily: jest.Mock;
  consumptionTotals: jest.Mock;
  lowStockMaterials: jest.Mock;
}

function createRepositoryMock(): RepositoryMock {
  return {
    consumption: jest.fn().mockResolvedValue([]),
    consumptionDaily: jest.fn().mockResolvedValue([]),
    consumptionTotals: jest.fn().mockResolvedValue([]),
    lowStockMaterials: jest.fn().mockResolvedValue([]),
  };
}

function dailyRow(overrides: Record<string, unknown> = {}) {
  return {
    day: new Date('2026-03-02T00:00:00.000Z'),
    object_id: 'obj-1',
    material_id: 'mat-1',
    material_name: 'Мыло',
    unit: 'л',
    cost_per_unit: 100,
    consumed_quantity: 2.5,
    operations: 2,
    ...overrides,
  };
}

describe('ReportsService (М7.1, CQRS-read)', () => {
  let repository: RepositoryMock;
  let service: ReportsService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ReportsService(repository as unknown as ReportsRepository);
  });

  // ---------------------------------------------------------------- расход

  it('собирает разрез «объект + материал», ряд по дням и итоги за период', async () => {
    repository.consumptionDaily.mockResolvedValue([
      dailyRow({
        day: new Date('2026-03-02T00:00:00.000Z'),
        consumed_quantity: 2.5,
        operations: 2,
      }),
      dailyRow({
        day: new Date('2026-03-02T00:00:00.000Z'),
        material_id: 'mat-2',
        material_name: 'Тряпки',
        unit: 'шт',
        cost_per_unit: 50,
        consumed_quantity: 4,
        operations: 1,
      }),
      dailyRow({ day: new Date('2026-03-03T00:00:00.000Z'), consumed_quantity: 1, operations: 1 }),
      dailyRow({
        day: new Date('2026-03-03T00:00:00.000Z'),
        object_id: 'obj-2',
        material_id: 'mat-2',
        material_name: 'Тряпки',
        unit: 'шт',
        cost_per_unit: 50,
        consumed_quantity: 2,
        operations: 1,
      }),
    ]);

    const report = await service.consumption({
      objectId: 'obj-1',
      from: '2026-03-01',
      to: '2026-03-31',
    });

    // Разрез «объект + материал»: одинаковый материал на двух объектах — две строки.
    expect(report.rows).toHaveLength(3);
    expect(report.rows.map((row) => `${row.objectId}/${row.materialId}`)).toEqual([
      'obj-1/mat-1',
      'obj-1/mat-2',
      'obj-2/mat-2',
    ]);
    expect(report.rows[0]).toMatchObject({
      materialId: 'mat-1',
      consumedQuantity: 3.5,
      cost: 350,
      operationsCount: 3,
    });
    // mat-2: 4 шт на obj-1 (200 ₽) дороже, чем 2 шт на obj-2 (100 ₽) — тот же материал, разные объекты.
    expect(report.rows[1]).toMatchObject({
      objectId: 'obj-1',
      name: 'Тряпки',
      consumedQuantity: 4,
      cost: 200,
      operationsCount: 1,
    });
    expect(report.rows[2]).toMatchObject({
      objectId: 'obj-2',
      name: 'Тряпки',
      consumedQuantity: 2,
      cost: 100,
    });

    // Ряд по дням схлопывает материалы и объекты внутри дня.
    expect(report.series).toEqual([
      { day: '2026-03-02', consumedQuantity: 6.5, cost: 450, operationsCount: 3 },
      { day: '2026-03-03', consumedQuantity: 3, cost: 200, operationsCount: 2 },
    ]);

    expect(report.totals).toEqual({ consumedQuantity: 9.5, operationsCount: 5, cost: 650 });
    expect(report.from).toBe('2026-03-01');
    expect(report.to).toBe('2026-03-31');
  });

  it('передаёт период и объект в SQL как даты, а не как строки', async () => {
    await service.consumption({ objectId: 'obj-9', from: '2026-03-01', to: '2026-03-31' });

    const filter = repository.consumptionDaily.mock.calls[0][0];
    expect(filter.objectId).toBe('obj-9');
    expect(filter.from).toBeInstanceOf(Date);
    expect(filter.to).toBeInstanceOf(Date);
  });

  it('нечисловой период игнорируется, а не превращается в Invalid Date', async () => {
    await service.consumption({ from: 'не-дата', to: '' });

    const filter = repository.consumptionDaily.mock.calls[0][0];
    expect(filter.from).toBeUndefined();
    expect(filter.to).toBeUndefined();
  });

  it('пустая read-модель даёт пустой отчёт без ошибок', async () => {
    const report = await service.consumption({});

    expect(report.rows).toEqual([]);
    expect(report.series).toEqual([]);
    expect(report.totals).toEqual({ consumedQuantity: 0, operationsCount: 0, cost: 0 });
  });

  it('приводит строковые агрегаты Postgres к числам', async () => {
    // `$queryRaw` отдаёт SUM(float8) числом, но для numeric/строковых колонок — строкой.
    repository.consumptionDaily.mockResolvedValue([
      dailyRow({ consumed_quantity: '2.5', cost_per_unit: '100', operations: '2' }),
    ]);

    const report = await service.consumption({});

    expect(report.rows[0]).toMatchObject({ consumedQuantity: 2.5, cost: 250, operationsCount: 2 });
    expect(report.series[0]).toMatchObject({ day: '2026-03-02', consumedQuantity: 2.5, cost: 250 });
  });

  it('день из read-модели понимает и Date, и строку', async () => {
    repository.consumptionDaily.mockResolvedValue([dailyRow({ day: '2026-03-02' })]);

    const report = await service.consumption({});

    expect(report.series[0].day).toBe('2026-03-02');
  });

  // ------------------------------------------------- контракт М4.3 (report)

  it('разрез по материалам для GET /api/materials/report схлопывает объекты', async () => {
    repository.consumptionDaily.mockResolvedValue([
      dailyRow({ object_id: 'obj-1', consumed_quantity: 2.5, operations: 2 }),
      dailyRow({ object_id: 'obj-2', consumed_quantity: 1, operations: 1 }),
    ]);

    const report = await service.consumptionByMaterial({ objectId: undefined });

    // Одна строка на материал, суммы по объектам сложены — форма ответа М4.3 не изменилась.
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      materialId: 'mat-1',
      consumedQuantity: 3.5,
      operationsCount: 3,
      cost: 350,
    });
    expect(report.totals).toEqual({ consumedQuantity: 3.5, operationsCount: 3, cost: 350 });
    expect(report.objectId).toBeNull();
    expect(report).not.toHaveProperty('series');
    // Контракт М4.3 не знает про объект в строке — лишнее поле было бы регрессом.
    expect(Object.keys(report.rows[0]).sort()).toEqual([
      'consumedQuantity',
      'cost',
      'costPerUnit',
      'materialId',
      'name',
      'operationsCount',
      'unit',
    ]);
  });

  it('разрез по материалам сортирует по стоимости, затем по названию', async () => {
    repository.consumptionDaily.mockResolvedValue([
      dailyRow({
        material_id: 'mat-a',
        material_name: 'Бета',
        consumed_quantity: 1,
        cost_per_unit: 100,
        operations: 1,
      }),
      dailyRow({
        material_id: 'mat-b',
        material_name: 'Альфа',
        consumed_quantity: 1,
        cost_per_unit: 100,
        operations: 1,
      }),
      dailyRow({
        material_id: 'mat-c',
        material_name: 'Гамма',
        consumed_quantity: 1,
        cost_per_unit: 500,
        operations: 1,
      }),
    ]);

    const report = await service.consumptionByMaterial({});

    expect(report.rows.map((row) => row.name)).toEqual(['Гамма', 'Альфа', 'Бета']);
  });

  // -------------------------------------------------------------- разрез/итоги

  it('разрез по объекту (без периода) считает стоимость по цене read-модели', async () => {
    repository.consumption.mockResolvedValue([
      {
        object_id: 'obj-1',
        material_id: 'mat-1',
        material_name: 'Мыло',
        unit: 'л',
        cost_per_unit: 100,
        consumed_quantity: 3,
        operations: 2,
        first_movement_at: new Date('2026-03-01T00:00:00.000Z'),
        last_movement_at: new Date('2026-03-05T00:00:00.000Z'),
      },
    ]);

    const report = await service.byObject({ objectId: 'obj-1' });

    expect(report.rows[0]).toMatchObject({ objectId: 'obj-1', cost: 300, operationsCount: 2 });
    expect(report.totals).toEqual({ consumedQuantity: 3, operationsCount: 2, cost: 300 });
    expect(repository.consumption).toHaveBeenCalledWith({ objectId: 'obj-1' });
  });

  // ------------------------------------------------------------------- KPI

  it('KPI доски действий: расход за 30 дней, объекты, топ-5 и позиции ниже порога', async () => {
    const day = new Date('2026-03-02T00:00:00.000Z');
    repository.consumptionDaily.mockResolvedValue([
      dailyRow({
        day,
        material_id: 'mat-1',
        material_name: 'Мыло',
        cost_per_unit: 100,
        consumed_quantity: 2,
        operations: 1,
      }),
      dailyRow({
        day,
        material_id: 'mat-2',
        material_name: 'Тряпки',
        unit: 'шт',
        cost_per_unit: 50,
        consumed_quantity: 4,
        operations: 1,
      }),
    ]);
    repository.consumptionTotals.mockResolvedValue([
      {
        object_id: 'obj-1',
        materials_count: 3,
        consumed_quantity: 10,
        operations: 4,
        last_movement_at: day,
      },
      {
        object_id: 'obj-2',
        materials_count: 5,
        consumed_quantity: 2,
        operations: 2,
        last_movement_at: day,
      },
    ]);
    repository.lowStockMaterials.mockResolvedValue([
      { material_id: 'mat-1', object_id: 'obj-1', quantity: 1, min_stock_threshold: 5 },
    ]);

    const summary = await service.summary();

    expect(summary.consumedQuantity30d).toBe(6);
    expect(summary.cost30d).toBe(400);
    expect(summary.operations30d).toBe(2);
    expect(summary.objectsCount).toBe(2);
    // «Сколько материалов в справочнике участвует в расходе» — максимум по объектам, а не сумма:
    // один и тот же материал на двух объектах не должен считаться дважды.
    expect(summary.materialsCount).toBe(5);
    expect(summary.lowStockCount).toBe(1);
    expect(summary.topMaterials.map((row) => row.name)).toEqual(['Мыло', 'Тряпки']);
  });

  it('KPI: окно 30 дней передаётся в SQL, а не фильтруется в памяти', async () => {
    const before = Date.now();
    await service.summary();
    const after = Date.now();

    const filter = repository.consumptionDaily.mock.calls[0][0];
    expect(filter.objectId).toBeUndefined();
    const span = after - filter.from.getTime();
    expect(span).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000);
    expect(span).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + (after - before) + 1_000);
  });

  it('KPI на пустом складе не падает и возвращает нули', async () => {
    const summary = await service.summary();

    expect(summary).toEqual({
      consumedQuantity30d: 0,
      cost30d: 0,
      operations30d: 0,
      materialsCount: 0,
      objectsCount: 0,
      lowStockCount: 0,
      topMaterials: [],
    });
  });
});
