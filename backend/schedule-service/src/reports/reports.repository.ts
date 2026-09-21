import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-репозиторий отчётов schedule-service (М7.1, CQRS-read).
 *
 * Читает SQL-представления миграции `20261001140000_m71_staff_control_views`. Смысл слоя:
 * write-модель смен (`ScheduleService`) знает только таблицы и отметки, отчёты читают
 * VIEW — агрегат нельзя «поправить» записью.
 *
 * Запросы идут через `$queryRaw` с тегированным шаблоном: фильтры подставляются
 * параметрами, а не склейкой SQL.
 */

/** Фильтр отчётов контроля персонала. `undefined` — без ограничения. */
export interface StaffControlFilter {
  objectId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}

/** Строка `staff_control` (сотрудник + объект + день). */
export interface StaffControlRow {
  user_id: string;
  object_id: string | null;
  route_id: string | null;
  day: Date | string;
  shifts_count: number;
  checked_in_count: number;
  checked_out_count: number;
  missed_count: number;
  auto_closed_count: number;
  late_count: number;
  worked_minutes_sum: number;
  worked_measured_count: number;
  max_lateness_minutes: number | null;
  first_check_in_at: Date | null;
  last_check_out_at: Date | null;
}

/** Единственная строка `staff_control_totals` (KPI). */
export interface StaffControlTotalsRow {
  shifts_total: number;
  checked_in_count: number;
  checked_out_count: number;
  planned_count: number;
  missed_count: number;
  auto_closed_count: number;
  late_count: number;
  worked_minutes_sum: number;
  worked_measured_count: number;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Смены сотрудника по объектам и дням за период. */
  async staffControl(filter: StaffControlFilter): Promise<StaffControlRow[]> {
    return this.prisma.$queryRaw<StaffControlRow[]>`
      SELECT user_id, object_id, route_id, day, shifts_count, checked_in_count,
             checked_out_count, missed_count, auto_closed_count, late_count,
             worked_minutes_sum, worked_measured_count, max_lateness_minutes,
             first_check_in_at, last_check_out_at
      FROM staff_control
      WHERE (${filter.objectId ?? null}::text IS NULL OR object_id = ${filter.objectId ?? null}::text)
        AND (${filter.userId ?? null}::text IS NULL OR user_id = ${filter.userId ?? null}::text)
        AND (${filter.from ?? null}::date IS NULL OR day >= ${filter.from ?? null}::date)
        AND (${filter.to ?? null}::date IS NULL OR day <= ${filter.to ?? null}::date)
      ORDER BY day DESC, user_id ASC
    `;
  }

  /** KPI смен: одна строка, считается в SQL. */
  async totals(): Promise<StaffControlTotalsRow> {
    const rows = await this.prisma.$queryRaw<StaffControlTotalsRow[]>`
      SELECT shifts_total, checked_in_count, checked_out_count, planned_count,
             missed_count, auto_closed_count, late_count,
             worked_minutes_sum, worked_measured_count
      FROM staff_control_totals
    `;
    return rows[0];
  }
}
