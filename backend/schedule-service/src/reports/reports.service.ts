import { Injectable } from '@nestjs/common';
import { ReportsRepository, type StaffControlRow } from './reports.repository';

/**
 * Отчёты schedule-service (М7.1, CQRS-read): контроль персонала — check-in/check-out,
 * явки, опоздания, авто-закрытия и длительность смен.
 *
 * Геозоны и маршруты этот сервис в отчёт не добавляет: геозоны живут в gps-service,
 * маршруты — в core-service, у каждого своя БД (см. комментарий миграции). Админка
 * складывает отчёт по персоналу из двух источников: эти смены и фактическое нахождение
 * в геозонах из gps-service.
 */

/** Строка отчёта контроля персонала (сводка по сотруднику за период). */
export interface StaffControlReportRow {
  userId: string;
  shiftsCount: number;
  checkedInCount: number;
  checkedOutCount: number;
  missedCount: number;
  autoClosedCount: number;
  lateCount: number;
  /** Средняя длительность смены в минутах; null — ни одна смена не измерена. */
  avgWorkedMinutes: number | null;
  /** Суммарно отработано, минут. */
  workedMinutes: number;
  /** Максимальное опоздание, минут; null — опозданий не было. */
  maxLatenessMinutes: number | null;
}

/** Точка ряда «смены по дням» для графика. */
export interface StaffDailyPoint {
  day: string;
  shiftsCount: number;
  checkedInCount: number;
  missedCount: number;
  lateCount: number;
}

/** Строка «сотрудник + объект» — вторая таблица страницы «Отчёты». */
export interface StaffByObjectRow {
  userId: string;
  objectId: string | null;
  routeId: string | null;
  shiftsCount: number;
  checkedInCount: number;
  missedCount: number;
  lateCount: number;
  workedMinutes: number;
}

export interface StaffControlReportView {
  from: string | null;
  to: string | null;
  rows: StaffControlReportRow[];
  byObject: StaffByObjectRow[];
  series: StaffDailyPoint[];
  totals: {
    shiftsCount: number;
    checkedInCount: number;
    checkedOutCount: number;
    missedCount: number;
    autoClosedCount: number;
    lateCount: number;
    workedMinutes: number;
    avgWorkedMinutes: number | null;
    /** Доля явок от смен, где отметка ожидалась, % (0–100). */
    attendanceRate: number;
  };
}

/** KPI контроля персонала для доски действий. */
export interface StaffSummaryView {
  shiftsTotal: number;
  checkedInCount: number;
  checkedOutCount: number;
  plannedCount: number;
  missedCount: number;
  autoClosedCount: number;
  lateCount: number;
  workedMinutes: number;
  avgWorkedMinutes: number | null;
  attendanceRate: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  /** Отчёт по персоналу за период: сотрудники, объекты, дни. */
  async staffControl(filter: {
    objectId?: string;
    userId?: string;
    from?: string;
    to?: string;
  }): Promise<StaffControlReportView> {
    const rows = await this.repository.staffControl({
      objectId: filter.objectId,
      userId: filter.userId,
      from: parseOptionalDate(filter.from),
      to: parseOptionalDate(filter.to),
    });

    const byUser = aggregateByUser(rows);
    const byObject = aggregateByObject(rows);
    const series = buildDailySeries(rows);

    const shiftsCount = sum(rows, (row) => number(row.shifts_count));
    const checkedInCount = sum(rows, (row) => number(row.checked_in_count));
    const checkedOutCount = sum(rows, (row) => number(row.checked_out_count));
    const missedCount = sum(rows, (row) => number(row.missed_count));
    const autoClosedCount = sum(rows, (row) => number(row.auto_closed_count));
    const lateCount = sum(rows, (row) => number(row.late_count));
    const workedMinutes = sum(rows, (row) => number(row.worked_minutes_sum));
    const workedMeasured = sum(rows, (row) => number(row.worked_measured_count));

    return {
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows: byUser,
      byObject,
      series,
      totals: {
        shiftsCount,
        checkedInCount,
        checkedOutCount,
        missedCount,
        autoClosedCount,
        lateCount,
        workedMinutes,
        avgWorkedMinutes: workedMeasured === 0 ? null : round1(workedMinutes / workedMeasured),
        // Явка = отметились из тех, кто был в смене. Пропущенные (MISSED) и неоткрытые
        // (PLANNED) снижают показатель: именно их и должен видеть бригадир.
        attendanceRate: shiftsCount === 0 ? 0 : round1((checkedInCount / shiftsCount) * 100),
      },
    };
  }

  /** KPI контроля персонала для доски действий: одна строка read-модели. */
  async summary(): Promise<StaffSummaryView> {
    const totals = await this.repository.totals();

    const shiftsTotal = number(totals?.shifts_total);
    const checkedInCount = number(totals?.checked_in_count);
    const workedMinutes = number(totals?.worked_minutes_sum);
    const workedMeasured = number(totals?.worked_measured_count);

    return {
      shiftsTotal,
      checkedInCount,
      checkedOutCount: number(totals?.checked_out_count),
      plannedCount: number(totals?.planned_count),
      missedCount: number(totals?.missed_count),
      autoClosedCount: number(totals?.auto_closed_count),
      lateCount: number(totals?.late_count),
      workedMinutes,
      avgWorkedMinutes: workedMeasured === 0 ? null : round1(workedMinutes / workedMeasured),
      // Нет смен — нет и нарушений явки: 100 %, а не 0 (то же правило, что у заявок).
      attendanceRate: shiftsTotal === 0 ? 100 : round1((checkedInCount / shiftsTotal) * 100),
    };
  }
}

/** Сводка по сотруднику: строки «объект + день» складываются. */
export function aggregateByUser(rows: StaffControlRow[]): StaffControlReportRow[] {
  const byUser = new Map<string, StaffControlReportRow & { workedMeasured: number }>();

  for (const row of rows) {
    const aggregated = byUser.get(row.user_id) ?? {
      userId: row.user_id,
      shiftsCount: 0,
      checkedInCount: 0,
      checkedOutCount: 0,
      missedCount: 0,
      autoClosedCount: 0,
      lateCount: 0,
      workedMinutes: 0,
      avgWorkedMinutes: null,
      maxLatenessMinutes: null,
      workedMeasured: 0,
    };

    aggregated.shiftsCount += number(row.shifts_count);
    aggregated.checkedInCount += number(row.checked_in_count);
    aggregated.checkedOutCount += number(row.checked_out_count);
    aggregated.missedCount += number(row.missed_count);
    aggregated.autoClosedCount += number(row.auto_closed_count);
    aggregated.lateCount += number(row.late_count);
    aggregated.workedMinutes += number(row.worked_minutes_sum);
    aggregated.workedMeasured += number(row.worked_measured_count);

    const lateness = row.max_lateness_minutes;
    if (lateness !== null && lateness !== undefined) {
      const value = number(lateness);
      aggregated.maxLatenessMinutes =
        aggregated.maxLatenessMinutes === null
          ? value
          : Math.max(aggregated.maxLatenessMinutes, value);
    }

    byUser.set(row.user_id, aggregated);
  }

  return [...byUser.values()]
    .map((row) => ({
      userId: row.userId,
      shiftsCount: row.shiftsCount,
      checkedInCount: row.checkedInCount,
      checkedOutCount: row.checkedOutCount,
      missedCount: row.missedCount,
      autoClosedCount: row.autoClosedCount,
      lateCount: row.lateCount,
      workedMinutes: row.workedMinutes,
      avgWorkedMinutes:
        row.workedMeasured === 0 ? null : round1(row.workedMinutes / row.workedMeasured),
      maxLatenessMinutes: row.maxLatenessMinutes,
    }))
    .sort(
      (left, right) =>
        right.shiftsCount - left.shiftsCount || left.userId.localeCompare(right.userId),
    );
}

/** Сводка «сотрудник + объект»: без дня, для таблицы объектов. */
export function aggregateByObject(rows: StaffControlRow[]): StaffByObjectRow[] {
  const byObject = new Map<string, StaffByObjectRow>();

  for (const row of rows) {
    const key = `${row.user_id}::${row.object_id ?? ''}::${row.route_id ?? ''}`;
    const aggregated = byObject.get(key) ?? {
      userId: row.user_id,
      objectId: row.object_id,
      routeId: row.route_id,
      shiftsCount: 0,
      checkedInCount: 0,
      missedCount: 0,
      lateCount: 0,
      workedMinutes: 0,
    };
    aggregated.shiftsCount += number(row.shifts_count);
    aggregated.checkedInCount += number(row.checked_in_count);
    aggregated.missedCount += number(row.missed_count);
    aggregated.lateCount += number(row.late_count);
    aggregated.workedMinutes += number(row.worked_minutes_sum);
    byObject.set(key, aggregated);
  }

  return [...byObject.values()].sort(
    (left, right) =>
      right.shiftsCount - left.shiftsCount ||
      (left.objectId ?? '').localeCompare(right.objectId ?? ''),
  );
}

/** Ряд «смены по дням»: дни складываются по сотрудникам и объектам. */
export function buildDailySeries(rows: StaffControlRow[]): StaffDailyPoint[] {
  const byDay = new Map<string, StaffDailyPoint>();

  for (const row of rows) {
    const day = toDayString(row.day);
    const point = byDay.get(day) ?? {
      day,
      shiftsCount: 0,
      checkedInCount: 0,
      missedCount: 0,
      lateCount: 0,
    };
    point.shiftsCount += number(row.shifts_count);
    point.checkedInCount += number(row.checked_in_count);
    point.missedCount += number(row.missed_count);
    point.lateCount += number(row.late_count);
    byDay.set(day, point);
  }

  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
}

function sum(rows: StaffControlRow[], pick: (row: StaffControlRow) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function number(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function toDayString(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
