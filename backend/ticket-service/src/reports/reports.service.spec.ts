import { ReportsService } from './reports.service';
import type { ReportsRepository, TicketExecutionDailyRow } from './reports.repository';

/**
 * Тесты read-слоя отчётов ticket-service (М7.1).
 *
 * Проверяется арифметика, которую нельзя проверить SQL-ом: схлопывание дневных строк в
 * разрез «объект + тип», взвешенное среднее времени цикла, доля просрочек и разбор
 * строковых агрегатов `$queryRaw`. Сами представления проверяются на стенде (e2e).
 */

interface RepositoryMock {
  execution: jest.Mock;
  executionDaily: jest.Mock;
  totals: jest.Mock;
}

function createRepositoryMock(): RepositoryMock {
  return {
    execution: jest.fn().mockResolvedValue([]),
    executionDaily: jest.fn().mockResolvedValue([]),
    totals: jest.fn().mockResolvedValue({
      tickets_total: 0,
      new_count: 0,
      in_work_count: 0,
      completed_count: 0,
      overdue_count: 0,
      emergency_count: 0,
      avg_cycle_minutes: null,
      cycle_measured_count: 0,
    }),
  };
}

function dailyRow(overrides: Partial<Record<keyof TicketExecutionDailyRow, unknown>> = {}) {
  return {
    day: new Date('2026-04-01T00:00:00.000Z'),
    object_id: 'obj-1',
    type: 'planned',
    created_count: 2,
    completed_count: 1,
    overdue_count: 0,
    cycle_minutes_sum: 60,
    cycle_measured_count: 1,
    ...overrides,
  } as unknown as TicketExecutionDailyRow;
}

describe('ReportsService (М7.1, CQRS-read)', () => {
  let repository: RepositoryMock;
  let service: ReportsService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ReportsService(repository as unknown as ReportsRepository);
  });

  // -------------------------------------------------------------- выполнение

  it('схлопывает дневные строки в разрез «объект + тип» и считает среднее по измеренным', async () => {
    repository.executionDaily.mockResolvedValue([
      dailyRow({
        day: new Date('2026-04-01T00:00:00.000Z'),
        created_count: 2,
        completed_count: 1,
        cycle_minutes_sum: 60,
        cycle_measured_count: 1,
      }),
      dailyRow({
        day: new Date('2026-04-02T00:00:00.000Z'),
        created_count: 1,
        completed_count: 1,
        cycle_minutes_sum: 180,
        cycle_measured_count: 1,
      }),
      dailyRow({
        day: new Date('2026-04-02T00:00:00.000Z'),
        type: 'emergency',
        created_count: 1,
        completed_count: 0,
        cycle_minutes_sum: 0,
        cycle_measured_count: 0,
      }),
    ]);

    const report = await service.execution({
      objectId: 'obj-1',
      from: '2026-04-01',
      to: '2026-04-30',
    });

    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({
      objectId: 'obj-1',
      type: 'planned',
      ticketsCount: 3,
      completedCount: 2,
      // (60 + 180) / 2 измеренных = 120 мин, а не (60 + 180 + 0) / 3.
      avgCycleMinutes: 120,
    });
    expect(report.rows[1]).toMatchObject({
      type: 'emergency',
      ticketsCount: 1,
      avgCycleMinutes: null,
    });
    expect(report.totals).toMatchObject({
      ticketsCount: 4,
      completedCount: 2,
      overdueCount: 0,
      avgCycleMinutes: 120,
    });
    expect(report.totals.overdueRate).toBe(0);
  });

  it('ряд по дням складывает объекты и типы внутри дня', async () => {
    repository.executionDaily.mockResolvedValue([
      dailyRow({
        day: new Date('2026-04-01T00:00:00.000Z'),
        created_count: 2,
        completed_count: 1,
        overdue_count: 1,
        cycle_minutes_sum: 60,
        cycle_measured_count: 1,
      }),
      dailyRow({
        day: new Date('2026-04-01T00:00:00.000Z'),
        object_id: 'obj-2',
        created_count: 3,
        completed_count: 2,
        overdue_count: 0,
        cycle_minutes_sum: 300,
        cycle_measured_count: 2,
      }),
      dailyRow({
        day: new Date('2026-04-02T00:00:00.000Z'),
        created_count: 1,
        completed_count: 1,
        cycle_minutes_sum: 30,
        cycle_measured_count: 1,
      }),
    ]);

    const report = await service.execution({});

    expect(report.series).toEqual([
      {
        day: '2026-04-01',
        createdCount: 5,
        completedCount: 3,
        overdueCount: 1,
        avgCycleMinutes: 120,
      },
      {
        day: '2026-04-02',
        createdCount: 1,
        completedCount: 1,
        overdueCount: 0,
        avgCycleMinutes: 30,
      },
    ]);
  });

  it('доля просрочек считается от всех заявок периода, а не от завершённых', async () => {
    repository.executionDaily.mockResolvedValue([
      dailyRow({
        created_count: 4,
        completed_count: 1,
        overdue_count: 2,
        cycle_minutes_sum: 60,
        cycle_measured_count: 1,
      }),
    ]);

    const report = await service.execution({});

    expect(report.totals).toMatchObject({ ticketsCount: 4, completedCount: 1, overdueCount: 2 });
    expect(report.totals.overdueRate).toBe(50);
  });

  it('период передаётся в SQL датами, мусорный период игнорируется', async () => {
    await service.execution({ from: '2026-04-01', to: '2026-04-30' });
    const ok = repository.executionDaily.mock.calls[0][0];
    expect(ok.from).toBeInstanceOf(Date);
    expect(ok.to).toBeInstanceOf(Date);

    await service.execution({ from: 'позавчера', to: '' });
    const bad = repository.executionDaily.mock.calls[1][0];
    expect(bad.from).toBeUndefined();
    expect(bad.to).toBeUndefined();
  });

  it('строковые агрегаты Postgres приводятся к числам', async () => {
    repository.executionDaily.mockResolvedValue([
      dailyRow({
        created_count: '3',
        completed_count: '2',
        cycle_minutes_sum: '240',
        cycle_measured_count: '2',
      }),
    ]);

    const report = await service.execution({});

    expect(report.rows[0]).toMatchObject({
      ticketsCount: 3,
      completedCount: 2,
      avgCycleMinutes: 120,
    });
  });

  it('пустая read-модель даёт пустой отчёт без ошибок', async () => {
    const report = await service.execution({});

    expect(report.rows).toEqual([]);
    expect(report.series).toEqual([]);
    expect(report.totals).toEqual({
      ticketsCount: 0,
      completedCount: 0,
      overdueCount: 0,
      avgCycleMinutes: null,
      overdueRate: 0,
    });
  });

  // ------------------------------------------------------------------- KPI

  it('KPI заявок: доли и среднее время цикла', async () => {
    repository.totals.mockResolvedValue({
      tickets_total: 20,
      new_count: 3,
      in_work_count: 4,
      completed_count: 12,
      overdue_count: 5,
      emergency_count: 2,
      avg_cycle_minutes: '95.55',
      cycle_measured_count: 12,
    });

    const summary = await service.summary();

    expect(summary).toEqual({
      ticketsTotal: 20,
      newCount: 3,
      inWorkCount: 4,
      completedCount: 12,
      overdueCount: 5,
      emergencyCount: 2,
      avgCycleMinutes: 95.6,
      onTimeRate: 75,
    });
  });

  it('KPI на пустой базе: просрочек нет — попадание в срок 100 %, а не 0', async () => {
    const summary = await service.summary();

    expect(summary.ticketsTotal).toBe(0);
    expect(summary.overdueCount).toBe(0);
    expect(summary.avgCycleMinutes).toBeNull();
    expect(summary.onTimeRate).toBe(100);
  });
});
