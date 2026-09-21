import { Injectable } from '@nestjs/common';
import {
  ReportsRepository,
  type GeofenceControlRow,
  type RouteActivityRow,
} from './reports.repository';

/**
 * Отчёты gps-service (М7.1, CQRS-read): контроль персонала по геозонам и маршрутам.
 *
 * Сервис складывает две read-модели: посещения геозон (`staff_geofence_control`) и
 * активность по дням (`staff_route_activity`). Смена (schedule-service) и геозона
 * (здесь) — разные БД, поэтому «опоздал» и «был на объекте» складываются в админке,
 * а не в SQL.
 *
 * Порог посещения — одна константа на сервис: представление уже отсекло транзит
 * (`staff_geofence_control.visits_count`), сервису остаётся это пересказать в контракте.
 */

/** Минимальная длительность нахождения в геозоне, чтобы это считалось посещением. */
export const GEOFENCE_MIN_VISIT_MINUTES = 5;

/** Строка отчёта: сотрудник + объект со сводкой за период. */
export interface GeofenceControlReportRow {
  userId: string;
  objectId: string;
  /** Посещения от порога (транзит отброшен в SQL). */
  visitsCount: number;
  /** Все появления в геозоне, включая незакрытые сессии. */
  presenceCount: number;
  /** Суммарное время в геозоне, минут. */
  dwellMinutes: number;
  /** Первое появление сотрудника на объекте в периоде. */
  firstEnteredAt: string | null;
}

/** Активность сотрудника по дням: «маршрут» в измеримой форме. */
export interface RouteActivityReportRow {
  userId: string;
  day: string;
  pointsCount: number;
  spanMinutes: number;
  objectsVisited: number;
  firstPointAt: string | null;
  lastPointAt: string | null;
}

/** Точка ряда «посещения по дням» для графика. */
export interface GeofenceDailyPoint {
  day: string;
  visitsCount: number;
  dwellMinutes: number;
  pointsCount: number;
}

export interface GeofenceControlReportView {
  from: string | null;
  to: string | null;
  rows: GeofenceControlReportRow[];
  routes: RouteActivityReportRow[];
  series: GeofenceDailyPoint[];
  totals: {
    visitsCount: number;
    dwellMinutes: number;
    trackedUsersCount: number;
    pointsCount: number;
    objectsVisitedCount: number;
  };
}

/** KPI контроля по GPS для дашборда. */
export interface GeofenceSummaryView {
  visitsCount: number;
  dwellMinutes: number;
  /** Среднее время на объекте за посещение, минут; null — посещений не было. */
  avgDwellMinutes: number | null;
  trackedUsersCount: number;
  pointsCount: number;
  objectsVisitedCount: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  /** Отчёт «геозоны и маршруты» за период. */
  async geofenceControl(filter: {
    objectId?: string;
    userId?: string;
    from?: string;
    to?: string;
  }): Promise<GeofenceControlReportView> {
    const period = {
      objectId: filter.objectId,
      userId: filter.userId,
      from: parseOptionalDate(filter.from),
      to: parseOptionalDate(filter.to),
    };

    const [control, activity] = await Promise.all([
      this.repository.geofenceControl(period),
      this.repository.routeActivity(period),
    ]);

    const rows = aggregateControl(control);
    const routes = activity.map((row) => ({
      userId: row.user_id,
      day: toDayString(row.day),
      pointsCount: number(row.points_count),
      spanMinutes: number(row.span_minutes),
      objectsVisited: number(row.objects_visited),
      firstPointAt: toIsoOrNull(row.first_point_at),
      lastPointAt: toIsoOrNull(row.last_point_at),
    }));
    const series = buildDailySeries(control, activity);

    const visitsCount = rows.reduce((sum, row) => sum + row.visitsCount, 0);
    const dwellMinutes = rows.reduce((sum, row) => sum + row.dwellMinutes, 0);

    return {
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows,
      routes,
      series,
      totals: {
        visitsCount,
        dwellMinutes,
        trackedUsersCount: new Set(routes.map((row) => row.userId)).size,
        pointsCount: routes.reduce((sum, row) => sum + row.pointsCount, 0),
        objectsVisitedCount: new Set(rows.map((row) => row.objectId)).size,
      },
    };
  }

  /** KPI контроля по GPS для дашборда: одна строка read-модели. */
  async summary(): Promise<GeofenceSummaryView> {
    const totals = await this.repository.totals();

    const visits = number(totals?.visits_count);
    const dwell = number(totals?.dwell_minutes_sum);

    return {
      visitsCount: visits,
      dwellMinutes: dwell,
      avgDwellMinutes: visits === 0 ? null : round1(dwell / visits),
      trackedUsersCount: number(totals?.tracked_users_count),
      pointsCount: number(totals?.points_count),
      objectsVisitedCount: number(totals?.objects_visited_count),
    };
  }
}

/** Сводка «сотрудник + объект»: дни складываются. */
export function aggregateControl(rows: GeofenceControlRow[]): GeofenceControlReportRow[] {
  const byUserAndObject = new Map<string, GeofenceControlReportRow & { sessionsCount: number }>();

  for (const row of rows) {
    const key = `${row.user_id}::${row.object_id}`;
    const aggregated = byUserAndObject.get(key) ?? {
      userId: row.user_id,
      objectId: row.object_id,
      visitsCount: 0,
      presenceCount: 0,
      dwellMinutes: 0,
      firstEnteredAt: null,
      sessionsCount: 0,
    };
    aggregated.sessionsCount += number(row.sessions_count);
    aggregated.visitsCount += number(row.visits_count);
    aggregated.presenceCount += number(row.presence_count);
    aggregated.dwellMinutes += number(row.dwell_minutes_sum);

    const entered = toIsoOrNull(row.first_entered_at);
    if (entered && (aggregated.firstEnteredAt === null || entered < aggregated.firstEnteredAt)) {
      aggregated.firstEnteredAt = entered;
    }
    byUserAndObject.set(key, aggregated);
  }

  return [...byUserAndObject.values()]
    .map((row) => ({
      userId: row.userId,
      objectId: row.objectId,
      visitsCount: row.visitsCount,
      presenceCount: row.presenceCount,
      dwellMinutes: row.dwellMinutes,
      firstEnteredAt: row.firstEnteredAt,
    }))
    .sort(
      (left, right) =>
        right.dwellMinutes - left.dwellMinutes ||
        left.objectId.localeCompare(right.objectId) ||
        left.userId.localeCompare(right.userId),
    );
}

/** Ряд «посещения по дням»: складывает геозоны (visits/dwell) и активность (points). */
export function buildDailySeries(
  control: GeofenceControlRow[],
  activity: RouteActivityRow[],
): GeofenceDailyPoint[] {
  const byDay = new Map<string, GeofenceDailyPoint>();

  for (const row of control) {
    const day = toDayString(row.day);
    const point = byDay.get(day) ?? { day, visitsCount: 0, dwellMinutes: 0, pointsCount: 0 };
    point.visitsCount += number(row.visits_count);
    point.dwellMinutes += number(row.dwell_minutes_sum);
    byDay.set(day, point);
  }

  for (const row of activity) {
    const day = toDayString(row.day);
    const point = byDay.get(day) ?? { day, visitsCount: 0, dwellMinutes: 0, pointsCount: 0 };
    point.pointsCount += number(row.points_count);
    byDay.set(day, point);
  }

  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
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

function toIsoOrNull(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
