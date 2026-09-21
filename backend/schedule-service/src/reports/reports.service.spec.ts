import { ReportsService } from './reports.service';
import type { ReportsRepository, StaffControlRow } from './reports.repository';

/**
 * Тесты read-слоя отчётов schedule-service (М7.1).
 *
 * Проверяется арифметика, которую нельзя проверить SQL-ом: сводка по сотруднику,
 * разрез «сотрудник + объект», ряд по дням, явка и разбор строковых агрегатов `$queryRaw`.
 * Сами представления проверяются на стенде (e2e).
 */

interface RepositoryMock {
  staffControl: jest.Mock;
  totals: jest.Mock;
}

function createRepositoryMock(): RepositoryMock {
  return {
    staffControl: jest.fn().mockResolvedValue([]),
    totals: jest.fn().mockResolvedValue({
      shifts_total: 0,
      checked_in_count: 0,
      checked_out_count: 0,
      planned_count: 0,
      missed_count: 0,
      auto_closed_count: 0,
      late_count: 0,
      worked_minutes_sum: 0,
      worked_measured_count: 0,
    }),
  };
}

function row(overrides: Record<string, unknown> = {}): StaffControlRow {
  return {
    user_id: 'user-1',
    object_id: 'obj-1',
    route_id: null,
    day: new Date('2026-05-04T00:00:00.000Z'),
    shifts_count: 1,
    checked_in_count: 1,
    checked_out_count: 1,
    missed_count: 0,
    auto_closed_count: 0,
    late_count: 0,
    worked_minutes_sum: 480,
    worked_measured_count: 1,
    max_lateness_minutes: 0,
    first_check_in_at: new Date('2026-05-04T08:00:00.000Z'),
    last_check_out_at: new Date('2026-05-04T16:00:00.000Z'),
    ...overrides,
  } as unknown as StaffControlRow;
}

describe('ReportsService (М7.1, CQRS-read)', () => {
  let repository: RepositoryMock;
  let service: ReportsService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ReportsService(repository as unknown as ReportsRepository);
  });

  // -------------------------------------------------------- контроль персонала

  it('сводка по сотруднику складывает дни и объекты', async () => {
    repository.staffControl.mockResolvedValue([
      row({
        day: new Date('2026-05-04T00:00:00.000Z'),
        shifts_count: 1,
        worked_minutes_sum: 480,
        worked_measured_count: 1,
      }),
      row({
        day: new Date('2026-05-05T00:00:00.000Z'),
        object_id: 'obj-2',
        shifts_count: 1,
        missed_count: 1,
        checked_in_count: 0,
        checked_out_count: 0,
        worked_minutes_sum: 0,
        worked_measured_count: 0,
        max_lateness_minutes: null,
      }),
      row({
        day: new Date('2026-05-06T00:00:00.000Z'),
        shifts_count: 1,
        auto_closed_count: 1,
        checked_in_count: 1,
        checked_out_count: 0,
        worked_minutes_sum: 120,
        worked_measured_count: 1,
        late_count: 1,
        max_lateness_minutes: 42,
      }),
    ]);

    const report = await service.staffControl({
      userId: 'user-1',
      from: '2026-05-01',
      to: '2026-05-31',
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      userId: 'user-1',
      shiftsCount: 3,
      checkedInCount: 2,
      checkedOutCount: 1,
      missedCount: 1,
      autoClosedCount: 1,
      lateCount: 1,
      workedMinutes: 600,
      // 600 минут на 2 измеренные смены — пропущенная смена (без отметок) среднее не тянет.
      avgWorkedMinutes: 300,
      maxLatenessMinutes: 42,
    });
    // Явка: 2 отметки из 3 смен.
    expect(report.totals).toMatchObject({
      shiftsCount: 3,
      checkedInCount: 2,
      missedCount: 1,
      workedMinutes: 600,
    });
    expect(report.totals.attendanceRate).toBe(66.7);
  });

  it('разрез «сотрудник + объект» отделяет объекты одного сотрудника', async () => {
    repository.staffControl.mockResolvedValue([
      row({
        object_id: 'obj-1',
        shifts_count: 2,
        worked_minutes_sum: 960,
        worked_measured_count: 2,
      }),
      row({
        object_id: 'obj-2',
        shifts_count: 1,
        worked_minutes_sum: 240,
        worked_measured_count: 1,
      }),
    ]);

    const report = await service.staffControl({});

    expect(report.byObject).toHaveLength(2);
    expect(report.byObject[0]).toMatchObject({
      objectId: 'obj-1',
      shiftsCount: 2,
      workedMinutes: 960,
    });
    expect(report.byObject[1]).toMatchObject({ objectId: 'obj-2', shiftsCount: 1 });
  });

  it('ряд по дням складывает сотрудников и объекты внутри дня', async () => {
    repository.staffControl.mockResolvedValue([
      row({
        day: new Date('2026-05-04T00:00:00.000Z'),
        shifts_count: 2,
        checked_in_count: 2,
        missed_count: 0,
        late_count: 1,
      }),
      row({
        day: new Date('2026-05-04T00:00:00.000Z'),
        user_id: 'user-2',
        shifts_count: 1,
        checked_in_count: 1,
        missed_count: 0,
        late_count: 0,
      }),
      row({
        day: new Date('2026-05-05T00:00:00.000Z'),
        shifts_count: 1,
        checked_in_count: 0,
        missed_count: 1,
        late_count: 0,
      }),
    ]);

    const report = await service.staffControl({});

    expect(report.series).toEqual([
      { day: '2026-05-04', shiftsCount: 3, checkedInCount: 3, missedCount: 0, lateCount: 1 },
      { day: '2026-05-05', shiftsCount: 1, checkedInCount: 0, missedCount: 1, lateCount: 0 },
    ]);
  });

  it('сортировка сотрудников — по числу смен, затем по id (стабильный порядок отчёта)', async () => {
    repository.staffControl.mockResolvedValue([
      row({ user_id: 'user-b', shifts_count: 1 }),
      row({ user_id: 'user-a', shifts_count: 3 }),
      row({ user_id: 'user-c', shifts_count: 3 }),
    ]);

    const report = await service.staffControl({});

    expect(report.rows.map((item) => item.userId)).toEqual(['user-a', 'user-c', 'user-b']);
  });

  it('период передаётся в SQL датами, мусорный период игнорируется', async () => {
    await service.staffControl({ from: '2026-05-01', to: '2026-05-31' });
    const ok = repository.staffControl.mock.calls[0][0];
    expect(ok.from).toBeInstanceOf(Date);
    expect(ok.to).toBeInstanceOf(Date);

    await service.staffControl({ from: 'вчера', to: '' });
    const bad = repository.staffControl.mock.calls[1][0];
    expect(bad.from).toBeUndefined();
    expect(bad.to).toBeUndefined();
  });

  it('строковые агрегаты Postgres приводятся к числам', async () => {
    repository.staffControl.mockResolvedValue([
      row({
        shifts_count: '2',
        worked_minutes_sum: '600',
        worked_measured_count: '2',
        late_count: '1',
        max_lateness_minutes: '30',
      }),
    ]);

    const report = await service.staffControl({});

    expect(report.rows[0]).toMatchObject({
      shiftsCount: 2,
      workedMinutes: 600,
      avgWorkedMinutes: 300,
      lateCount: 1,
      maxLatenessMinutes: 30,
    });
  });

  it('пустая read-модель даёт пустой отчёт без ошибок', async () => {
    const report = await service.staffControl({});

    expect(report.rows).toEqual([]);
    expect(report.byObject).toEqual([]);
    expect(report.series).toEqual([]);
    expect(report.totals).toEqual({
      shiftsCount: 0,
      checkedInCount: 0,
      checkedOutCount: 0,
      missedCount: 0,
      autoClosedCount: 0,
      lateCount: 0,
      workedMinutes: 0,
      avgWorkedMinutes: null,
      attendanceRate: 0,
    });
  });

  // ------------------------------------------------------------------- KPI

  it('KPI смен: явка и средняя длительность по измеренным сменам', async () => {
    repository.totals.mockResolvedValue({
      shifts_total: 10,
      checked_in_count: 8,
      checked_out_count: 7,
      planned_count: 1,
      missed_count: 1,
      auto_closed_count: 2,
      late_count: 3,
      worked_minutes_sum: '2400',
      worked_measured_count: 8,
    });

    const summary = await service.summary();

    expect(summary).toEqual({
      shiftsTotal: 10,
      checkedInCount: 8,
      checkedOutCount: 7,
      plannedCount: 1,
      missedCount: 1,
      autoClosedCount: 2,
      lateCount: 3,
      workedMinutes: 2400,
      avgWorkedMinutes: 300,
      attendanceRate: 80,
    });
  });

  it('KPI на пустом графике: явка 100 %, а не 0', async () => {
    const summary = await service.summary();

    expect(summary.shiftsTotal).toBe(0);
    expect(summary.workedMinutes).toBe(0);
    expect(summary.avgWorkedMinutes).toBeNull();
    expect(summary.attendanceRate).toBe(100);
  });
});
