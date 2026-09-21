import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-репозиторий отчётов gps-service (М7.1, CQRS-read).
 *
 * Читает SQL-представления миграции `20261001150000_m71_staff_geofence_views`. Геометрия
 * остаётся внутри SQL: наружу уходят только числа (время на объекте, число посещений,
 * покрытие дня точками) — Prisma не умеет PostGIS-типы, а ответу API WKB не нужен.
 *
 * Запросы идут через `$queryRaw` с тегированным шаблоном: фильтры подставляются
 * параметрами, а не склейкой SQL.
 */

/** Фильтр отчётов контроля по геозонам. `undefined` — без ограничения. */
export interface GeofenceControlFilter {
  objectId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}

/** Строка `staff_geofence_control` (сотрудник + объект + день). */
export interface GeofenceControlRow {
  user_id: string;
  object_id: string;
  day: Date | string;
  sessions_count: number;
  visits_count: number;
  presence_count: number;
  dwell_minutes_sum: number;
  first_entered_at: Date | null;
  last_seen_at: Date | null;
}

/** Строка `staff_route_activity` (сотрудник + день). */
export interface RouteActivityRow {
  user_id: string;
  day: Date | string;
  points_count: number;
  first_point_at: Date | null;
  last_point_at: Date | null;
  span_minutes: number;
  objects_visited: number;
}

/** Единственная строка `staff_geofence_totals` (KPI). */
export interface GeofenceTotalsRow {
  control_rows: number;
  visits_count: number;
  dwell_minutes_sum: number;
  tracked_users_count: number;
  points_count: number;
  objects_visited_count: number;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Посещения геозон по сотрудникам, объектам и дням за период.
   *
   * ВНИМАНИЕ к типам: `user_id` и `object_id` в представлениях — `uuid` (так они объявлены
   * в gps-схеме), поэтому фильтр приводится к `::uuid`, а не к `::text`: Postgres не
   * выполняет `uuid = text` без явного приведения и падает с SQLSTATE 42883.
   */
  async geofenceControl(filter: GeofenceControlFilter): Promise<GeofenceControlRow[]> {
    return this.prisma.$queryRaw<GeofenceControlRow[]>`
      SELECT user_id, object_id, day, sessions_count, visits_count, presence_count,
             dwell_minutes_sum, first_entered_at, last_seen_at
      FROM staff_geofence_control
      WHERE (${filter.objectId ?? null}::uuid IS NULL OR object_id = ${filter.objectId ?? null}::uuid)
        AND (${filter.userId ?? null}::uuid IS NULL OR user_id = ${filter.userId ?? null}::uuid)
        AND (${filter.from ?? null}::date IS NULL OR day >= ${filter.from ?? null}::date)
        AND (${filter.to ?? null}::date IS NULL OR day <= ${filter.to ?? null}::date)
      ORDER BY day DESC, user_id ASC
    `;
  }

  /**
   * Активность по дням (точки трека = покрытие маршрута).
   *
   * ВНИМАНИЕ: `user_id` в `gps_tracks` — `uuid`, поэтому фильтр по нему сравнивается с
   * приведением `::uuid`, а не `::text`: сравнение `uuid = text` Postgres не выполняет
   * без явного приведения, и запрос упал бы на первом же вызове с фильтром.
   */
  async routeActivity(filter: GeofenceControlFilter): Promise<RouteActivityRow[]> {
    return this.prisma.$queryRaw<RouteActivityRow[]>`
      SELECT user_id, day, points_count, first_point_at, last_point_at, span_minutes, objects_visited
      FROM staff_route_activity
      WHERE (${filter.userId ?? null}::uuid IS NULL OR user_id = ${filter.userId ?? null}::uuid)
        AND (${filter.from ?? null}::date IS NULL OR day >= ${filter.from ?? null}::date)
        AND (${filter.to ?? null}::date IS NULL OR day <= ${filter.to ?? null}::date)
      ORDER BY day DESC, user_id ASC
    `;
  }

  /** KPI контроля по GPS: одна строка, считается в SQL. */
  async totals(): Promise<GeofenceTotalsRow> {
    const rows = await this.prisma.$queryRaw<GeofenceTotalsRow[]>`
      SELECT control_rows, visits_count, dwell_minutes_sum, tracked_users_count,
             points_count, objects_visited_count
      FROM staff_geofence_totals
    `;
    return rows[0];
  }
}
