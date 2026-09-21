import { ReportsService } from './reports.service';
import type { GeofenceControlRow, ReportsRepository, RouteActivityRow } from './reports.repository';

/**
 * Тесты read-слоя отчётов gps-service (М7.1).
 *
 * Проверяется арифметика, не выразимая в SQL: сводка «сотрудник + объект», ряд по дням
 * из двух read-моделей, счётчики уникальных сотрудников и объектов, разбор строковых
 * агрегатов `$queryRaw`. Геометрия (ST_Contains, пары вход/выход) проверяется на стенде:
 * e2e создаёт геозону и трек и сверяет ответ с фактом.
 */

interface RepositoryMock {
  geofenceControl: jest.Mock;
  routeActivity: jest.Mock;
  totals: jest.Mock;
}

function createRepositoryMock(): RepositoryMock {
  return {
    geofenceControl: jest.fn().mockResolvedValue([]),
    routeActivity: jest.fn().mockResolvedValue([]),
    totals: jest.fn().mockResolvedValue({
      control_rows: 0,
      visits_count: 0,
      dwell_minutes_sum: 0,
      tracked_users_count: 0,
      points_count: 0,
      objects_visited_count: 0,
    }),
  };
}

function controlRow(overrides: Record<string, unknown> = {}): GeofenceControlRow {
  return {
    user_id: 'user-1',
    object_id: 'obj-1',
    day: new Date('2026-06-01T00:00:00.000Z'),
    sessions_count: 1,
    visits_count: 1,
    presence_count: 1,
    dwell_minutes_sum: 120,
    first_entered_at: new Date('2026-06-01T09:00:00.000Z'),
    last_seen_at: new Date('2026-06-01T11:00:00.000Z'),
    ...overrides,
  } as unknown as GeofenceControlRow;
}

function activityRow(overrides: Record<string, unknown> = {}): RouteActivityRow {
  return {
    user_id: 'user-1',
    day: new Date('2026-06-01T00:00:00.000Z'),
    points_count: 40,
    first_point_at: new Date('2026-06-01T08:00:00.000Z'),
    last_point_at: new Date('2026-06-01T17:00:00.000Z'),
    span_minutes: 540,
    objects_visited: 2,
    ...overrides,
  } as unknown as RouteActivityRow;
}

describe('ReportsService (М7.1, CQRS-read)', () => {
  let repository: RepositoryMock;
  let service: ReportsService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ReportsService(repository as unknown as ReportsRepository);
  });

  // ------------------------------------------------------- геозоны и маршруты

  it('складывает посещения по дням в разрез «сотрудник + объект»', async () => {
    repository.geofenceControl.mockResolvedValue([
      controlRow({
        day: new Date('2026-06-01T00:00:00.000Z'),
        visits_count: 1,
        dwell_minutes_sum: 120,
      }),
      controlRow({
        day: new Date('2026-06-02T00:00:00.000Z'),
        visits_count: 2,
        dwell_minutes_sum: 300,
        first_entered_at: new Date('2026-06-02T08:30:00.000Z'),
      }),
    ]);
    repository.routeActivity.mockResolvedValue([activityRow()]);

    const report = await service.geofenceControl({
      objectId: 'obj-1',
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      userId: 'user-1',
      objectId: 'obj-1',
      visitsCount: 3,
      presenceCount: 2,
      dwellMinutes: 420,
      // Первое появление — минимум из дней, а не первая строка ответа.
      firstEnteredAt: '2026-06-01T09:00:00.000Z',
    });
    expect(report.totals).toMatchObject({
      visitsCount: 3,
      dwellMinutes: 420,
      objectsVisitedCount: 1,
    });
  });

  it('разделяет сотрудников и объекты, сортирует по времени на объекте', async () => {
    repository.geofenceControl.mockResolvedValue([
      controlRow({ user_id: 'user-1', object_id: 'obj-1', dwell_minutes_sum: 60, visits_count: 1 }),
      controlRow({
        user_id: 'user-1',
        object_id: 'obj-2',
        dwell_minutes_sum: 300,
        visits_count: 2,
      }),
      controlRow({
        user_id: 'user-2',
        object_id: 'obj-1',
        dwell_minutes_sum: 120,
        visits_count: 1,
      }),
    ]);

    const report = await service.geofenceControl({});

    expect(report.rows.map((row) => `${row.userId}/${row.objectId}`)).toEqual([
      'user-1/obj-2',
      'user-2/obj-1',
      'user-1/obj-1',
    ]);
    expect(report.totals.objectsVisitedCount).toBe(2);
  });

  it('ряд по дням складывает посещения и активность по маршруту', async () => {
    repository.geofenceControl.mockResolvedValue([
      controlRow({
        day: new Date('2026-06-01T00:00:00.000Z'),
        visits_count: 1,
        dwell_minutes_sum: 120,
      }),
      controlRow({
        day: new Date('2026-06-01T00:00:00.000Z'),
        user_id: 'user-2',
        object_id: 'obj-2',
        visits_count: 2,
        dwell_minutes_sum: 60,
      }),
      controlRow({
        day: new Date('2026-06-02T00:00:00.000Z'),
        visits_count: 1,
        dwell_minutes_sum: 30,
      }),
    ]);
    repository.routeActivity.mockResolvedValue([
      activityRow({ day: new Date('2026-06-01T00:00:00.000Z'), points_count: 40 }),
      activityRow({
        day: new Date('2026-06-02T00:00:00.000Z'),
        user_id: 'user-2',
        points_count: 15,
      }),
    ]);

    const report = await service.geofenceControl({});

    expect(report.series).toEqual([
      { day: '2026-06-01', visitsCount: 3, dwellMinutes: 180, pointsCount: 40 },
      { day: '2026-06-02', visitsCount: 1, dwellMinutes: 30, pointsCount: 15 },
    ]);
  });

  it('активность по маршруту отдаётся с ISO-временем границ дня', async () => {
    repository.routeActivity.mockResolvedValue([activityRow()]);

    const report = await service.geofenceControl({});

    expect(report.routes[0]).toMatchObject({
      userId: 'user-1',
      day: '2026-06-01',
      pointsCount: 40,
      spanMinutes: 540,
      objectsVisited: 2,
      firstPointAt: '2026-06-01T08:00:00.000Z',
      lastPointAt: '2026-06-01T17:00:00.000Z',
    });
    expect(report.totals).toMatchObject({
      trackedUsersCount: 1,
      pointsCount: 40,
      objectsVisitedCount: 0,
    });
  });

  it('период передаётся в SQL датами, мусорный период игнорируется', async () => {
    await service.geofenceControl({ userId: 'user-1', from: '2026-06-01', to: '2026-06-30' });
    const ok = repository.geofenceControl.mock.calls[0][0];
    expect(ok.userId).toBe('user-1');
    expect(ok.from).toBeInstanceOf(Date);
    expect(ok.to).toBeInstanceOf(Date);

    await service.geofenceControl({ from: 'позавчера', to: '' });
    const bad = repository.geofenceControl.mock.calls[1][0];
    expect(bad.from).toBeUndefined();
    expect(bad.to).toBeUndefined();
  });

  it('строковые агрегаты Postgres приводятся к числам', async () => {
    repository.geofenceControl.mockResolvedValue([
      controlRow({
        visits_count: '3',
        presence_count: '3',
        dwell_minutes_sum: '450',
        sessions_count: '3',
      }),
    ]);
    repository.routeActivity.mockResolvedValue([
      activityRow({ points_count: '40', span_minutes: '540' }),
    ]);

    const report = await service.geofenceControl({});

    expect(report.rows[0]).toMatchObject({ visitsCount: 3, dwellMinutes: 450 });
    expect(report.routes[0]).toMatchObject({ pointsCount: 40, spanMinutes: 540 });
    expect(report.totals).toMatchObject({ visitsCount: 3, dwellMinutes: 450, pointsCount: 40 });
  });

  it('пустые read-модели дают пустой отчёт без ошибок', async () => {
    const report = await service.geofenceControl({});

    expect(report.rows).toEqual([]);
    expect(report.routes).toEqual([]);
    expect(report.series).toEqual([]);
    expect(report.totals).toEqual({
      visitsCount: 0,
      dwellMinutes: 0,
      trackedUsersCount: 0,
      pointsCount: 0,
      objectsVisitedCount: 0,
    });
  });

  // ------------------------------------------------------------------- KPI

  it('KPI: среднее время на объекте за посещение', async () => {
    repository.totals.mockResolvedValue({
      control_rows: 4,
      visits_count: '7',
      dwell_minutes_sum: '840',
      tracked_users_count: '3',
      points_count: '1200',
      objects_visited_count: '5',
    });

    const summary = await service.summary();

    expect(summary).toEqual({
      visitsCount: 7,
      dwellMinutes: 840,
      avgDwellMinutes: 120,
      trackedUsersCount: 3,
      pointsCount: 1200,
      objectsVisitedCount: 5,
    });
  });

  it('KPI на пустых треках: среднее null, а не деление на ноль', async () => {
    const summary = await service.summary();

    expect(summary.visitsCount).toBe(0);
    expect(summary.avgDwellMinutes).toBeNull();
    expect(summary.trackedUsersCount).toBe(0);
  });
});
