import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-репозиторий отчётов ticket-service (М7.1, CQRS-read).
 *
 * Читает SQL-представления миграции `20261001130000_m71_ticket_report_views`. Смысл слоя:
 * write-модель (`TicketsService`) знает только таблицы и переходы статусов, отчёты читают
 * VIEW — агрегат нельзя «поправить» записью.
 *
 * Запросы идут через `$queryRaw` с тегированным шаблоном: фильтры подставляются
 * параметрами, а не склейкой SQL.
 */

/** Фильтр периода отчётов: `undefined` — без ограничения. */
export interface ReportPeriodFilter {
  /** Начало периода включительно. */
  from?: Date;
  /** Конец периода включительно. */
  to?: Date;
  /** Объект core-service; `undefined` — по всем объектам. */
  objectId?: string;
}

/** Строка `ticket_execution` (объект + тип + статус). */
export interface TicketExecutionRow {
  object_id: string;
  type: string;
  status: string;
  tickets_count: number;
  completed_count: number;
  overdue_count: number;
  cycle_minutes_sum: number | string | null;
  cycle_measured_count: number;
  reaction_minutes_sum: number | string | null;
  reaction_measured_count: number;
}

/** Строка `ticket_execution_daily` (заявки по дням создания). */
export interface TicketExecutionDailyRow {
  day: Date | string;
  object_id: string;
  type: string;
  created_count: number;
  completed_count: number;
  overdue_count: number;
  cycle_minutes_sum: number | string | null;
  cycle_measured_count: number;
}

/** Единственная строка `ticket_execution_totals` (KPI). */
export interface TicketExecutionTotalsRow {
  tickets_total: number;
  new_count: number;
  in_work_count: number;
  completed_count: number;
  overdue_count: number;
  emergency_count: number;
  avg_cycle_minutes: number | string | null;
  cycle_measured_count: number;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Выполнение по объекту, типу и статусу — без периода.
   *
   * Периода здесь нет намеренно: представление схлопнуто по (объект, тип, статус) и
   * «дня» не имеет, поэтому фильтр «с … по …» дал бы не «выполнение за период», а
   * «выполнение по всем заявкам тех объектов, где в периоде что-то создавалось».
   * Отчёт за период собирается из дневной read-модели (`executionDaily`).
   */
  async execution(filter: { objectId?: string } = {}): Promise<TicketExecutionRow[]> {
    return this.prisma.$queryRaw<TicketExecutionRow[]>`
      SELECT object_id, type, status, tickets_count, completed_count, overdue_count,
             cycle_minutes_sum, cycle_measured_count, reaction_minutes_sum, reaction_measured_count
      FROM ticket_execution
      WHERE (${filter.objectId ?? null}::text IS NULL OR object_id = ${filter.objectId ?? null}::text)
      ORDER BY tickets_count DESC, object_id ASC
    `;
  }

  /** Заявки по дням создания за период — основа отчёта и графика. */
  async executionDaily(filter: ReportPeriodFilter): Promise<TicketExecutionDailyRow[]> {
    return this.prisma.$queryRaw<TicketExecutionDailyRow[]>`
      SELECT day, object_id, type, created_count, completed_count, overdue_count,
             cycle_minutes_sum, cycle_measured_count
      FROM ticket_execution_daily
      WHERE (${filter.objectId ?? null}::text IS NULL OR object_id = ${filter.objectId ?? null}::text)
        AND (${filter.from ?? null}::date IS NULL OR day >= ${filter.from ?? null}::date)
        AND (${filter.to ?? null}::date IS NULL OR day <= ${filter.to ?? null}::date)
      ORDER BY day ASC
    `;
  }

  /** KPI по всем заявкам: одна строка, считается в SQL. */
  async totals(): Promise<TicketExecutionTotalsRow> {
    const rows = await this.prisma.$queryRaw<TicketExecutionTotalsRow[]>`
      SELECT tickets_total, new_count, in_work_count, completed_count, overdue_count,
             emergency_count, avg_cycle_minutes, cycle_measured_count
      FROM ticket_execution_totals
    `;
    return rows[0];
  }
}
