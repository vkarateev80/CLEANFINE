import { Injectable } from '@nestjs/common';
import { ReportsRepository, type TicketExecutionDailyRow } from './reports.repository';

/**
 * Отчёты ticket-service (М7.1, CQRS-read): выполнение заявок — количество, время
 * цикла, просрочки.
 *
 * Арифметика (перевод минут в часы, средние, объединение разрезов) — здесь, потому что
 * VIEW отдаёт суммы и счётчики «измеренных» строк. Среднее считается как
 * `сумма / число измеренных`, а не как среднее средних: только так оно не смещается,
 * когда у части заявок время цикла не измерено (нет `completedAt`).
 */

/** Строка отчёта выполнения: объект + тип со сводкой. */
export interface TicketExecutionReportRow {
  objectId: string;
  type: string;
  ticketsCount: number;
  completedCount: number;
  overdueCount: number;
  /** Среднее время цикла в минутах; null — ни одна заявка не измерена. */
  avgCycleMinutes: number | null;
  /** Среднее время реакции (создание → назначение) в минутах; null — не измерено. */
  avgReactionMinutes: number | null;
}

/** Точка ряда «заявки по дням» для графика Recharts. */
export interface TicketDailyPoint {
  day: string;
  createdCount: number;
  completedCount: number;
  overdueCount: number;
  avgCycleMinutes: number | null;
}

export interface TicketExecutionReportView {
  from: string | null;
  to: string | null;
  rows: TicketExecutionReportRow[];
  series: TicketDailyPoint[];
  totals: {
    ticketsCount: number;
    completedCount: number;
    overdueCount: number;
    avgCycleMinutes: number | null;
    /** Доля просроченных от завершённых в отчёте, % (0–100). */
    overdueRate: number;
  };
}

/** KPI доски действий по заявкам. */
export interface TicketSummaryView {
  ticketsTotal: number;
  newCount: number;
  inWorkCount: number;
  completedCount: number;
  overdueCount: number;
  emergencyCount: number;
  avgCycleMinutes: number | null;
  /** Попадание в срок: 100 − доля просроченных, % (0–100). */
  onTimeRate: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  /**
   * Отчёт по выполнению заявок за период.
   *
   * Разрез строк — «объект + тип»: тип влияет на норматив (плановая/внеплановая/аварийная),
   * поэтому смешивать их в одном среднем нельзя. Статусы внутри разреза сложены, как и
   * задано планом («количество, время цикла, просрочки»).
   */
  async execution(filter: {
    objectId?: string;
    from?: string;
    to?: string;
  }): Promise<TicketExecutionReportView> {
    const period = {
      objectId: filter.objectId,
      from: parseOptionalDate(filter.from),
      to: parseOptionalDate(filter.to),
    };

    const daily = await this.repository.executionDaily(period);

    const rows = aggregateExecutionRows(daily);
    const series = buildDailySeries(daily);

    const ticketsCount = rows.reduce((sum, row) => sum + row.ticketsCount, 0);
    const completedCount = rows.reduce((sum, row) => sum + row.completedCount, 0);
    const overdueCount = rows.reduce((sum, row) => sum + row.overdueCount, 0);
    const timing = averageCycle(rows);

    return {
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows,
      series,
      totals: {
        ticketsCount,
        // Просрочка берётся из дневной read-модели по ДНЮ СОЗДАНИЯ заявки: так один
        // период считается непротиворечиво, а просроченная заявка (её нет в completed)
        // не выпадает из отчёта.
        overdueCount: overdueCount,
        completedCount,
        avgCycleMinutes: timing.value,
        overdueRate: ticketsCount === 0 ? 0 : round1((overdueCount / ticketsCount) * 100),
      },
    };
  }

  /** KPI заявок для доски действий: считается одной строкой read-модели. */
  async summary(): Promise<TicketSummaryView> {
    const totals = await this.repository.totals();

    const all = number(totals?.tickets_total);
    const overdue = number(totals?.overdue_count);
    const avg = totals?.avg_cycle_minutes;

    return {
      ticketsTotal: all,
      newCount: number(totals?.new_count),
      inWorkCount: number(totals?.in_work_count),
      completedCount: number(totals?.completed_count),
      overdueCount: overdue,
      emergencyCount: number(totals?.emergency_count),
      avgCycleMinutes: avg === null || avg === undefined ? null : round1(number(avg)),
      // «В срок» = не просрочено. При пустой базе считаем 100 %, а не 0:
      // отсутствие просрочек — это отсутствие нарушений, а не провал показателя.
      onTimeRate: all === 0 ? 100 : round1(((all - overdue) / all) * 100),
    };
  }
}

/** Схлопывает дневные строки в разрез «объект + тип». */
export function aggregateExecutionRows(
  daily: TicketExecutionDailyRow[],
): TicketExecutionReportRow[] {
  const byObjectAndType = new Map<
    string,
    {
      objectId: string;
      type: string;
      ticketsCount: number;
      completedCount: number;
      overdueCount: number;
      cycleSum: number;
      cycleMeasured: number;
    }
  >();

  for (const row of daily) {
    const key = `${row.object_id}::${row.type}`;
    const aggregated = byObjectAndType.get(key) ?? {
      objectId: row.object_id,
      type: row.type,
      ticketsCount: 0,
      completedCount: 0,
      overdueCount: 0,
      cycleSum: 0,
      cycleMeasured: 0,
    };
    aggregated.ticketsCount += number(row.created_count);
    aggregated.completedCount += number(row.completed_count);
    aggregated.overdueCount += number(row.overdue_count);
    aggregated.cycleSum += number(row.cycle_minutes_sum);
    aggregated.cycleMeasured += number(row.cycle_measured_count);
    byObjectAndType.set(key, aggregated);
  }

  return [...byObjectAndType.values()]
    .map((row) => ({
      objectId: row.objectId,
      type: row.type,
      ticketsCount: row.ticketsCount,
      completedCount: row.completedCount,
      overdueCount: row.overdueCount,
      avgCycleMinutes: row.cycleMeasured === 0 ? null : round1(row.cycleSum / row.cycleMeasured),
      // Реакция (создание → назначение) в дневной read-модели не разложена: она есть
      // только в разрезе «объект + тип + статус» (`ticket_execution`). Здесь null,
      // чтобы не подменять её временем цикла.
      avgReactionMinutes: null,
    }))
    .sort(
      (left, right) =>
        right.ticketsCount - left.ticketsCount ||
        left.objectId.localeCompare(right.objectId) ||
        left.type.localeCompare(right.type),
    );
}

/** Ряд «заявки по дням»: дни без заявок не выдумываются, порядок — по возрастанию. */
export function buildDailySeries(daily: TicketExecutionDailyRow[]): TicketDailyPoint[] {
  const byDay = new Map<string, TicketDailyPoint & { cycleSum: number; cycleMeasured: number }>();

  for (const row of daily) {
    const day = toDayString(row.day);
    const point = byDay.get(day) ?? {
      day,
      createdCount: 0,
      completedCount: 0,
      overdueCount: 0,
      avgCycleMinutes: null,
      cycleSum: 0,
      cycleMeasured: 0,
    };
    point.createdCount += number(row.created_count);
    point.completedCount += number(row.completed_count);
    point.overdueCount += number(row.overdue_count);
    point.cycleSum += number(row.cycle_minutes_sum);
    point.cycleMeasured += number(row.cycle_measured_count);
    byDay.set(day, point);
  }

  return [...byDay.values()]
    .sort((left, right) => left.day.localeCompare(right.day))
    .map((point) => ({
      day: point.day,
      createdCount: point.createdCount,
      completedCount: point.completedCount,
      overdueCount: point.overdueCount,
      avgCycleMinutes:
        point.cycleMeasured === 0 ? null : round1(point.cycleSum / point.cycleMeasured),
    }));
}

/** Взвешенное среднее времени цикла по строкам отчёта (не среднее средних). */
function averageCycle(rows: TicketExecutionReportRow[]): { value: number | null } {
  // Вес строки — число выполненных заявок в ней, иначе мелкий объект перевесил бы крупный.
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.avgCycleMinutes === null) continue;
    const rowWeight = Math.max(1, row.completedCount);
    weighted += row.avgCycleMinutes * rowWeight;
    weight += rowWeight;
  }
  return { value: weight === 0 ? null : round1(weighted / weight) };
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
