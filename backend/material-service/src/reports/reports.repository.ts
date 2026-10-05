import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-репозиторий отчётов material-service (М7.1, CQRS-read).
 *
 * Единственное место сервиса, которое читает SQL-представления из миграции
 * `20261001120000_m71_material_report_views`. Смысл слоя: write-модель
 * (`MaterialsService`) знает только про таблицы и остатки, а отчёты читают VIEW —
 * поэтому агрегат нельзя случайно «поправить» записью.
 *
 * Запросы идут через `$queryRaw` с тегированным шаблоном: Prisma подставляет
 * параметры ($1, $2, …), поэтому фильтры не склеиваются в SQL-строку.
 *
 * ЧТО ГДЕ ФИЛЬТРУЕТСЯ. Период применим ровно к одной read-модели — дневной
 * (`report_material_consumption_daily`), потому что только у неё зернистость мельче
 * периода. У `report_material_consumption` и `..._totals` строки схлопнуты по всему
 * времени, и фильтр «с … по …» по ним дал бы не «расход за период», а «расход за всё
 * время у тех, кто что-то списал в периоде» — поэтому эти две read-модели период не
 * принимают вовсе: отчёт за период собирается из дневной (см. `MaterialsService.report`).
 */

/** Строка `report_material_consumption` (расход по объекту + материалу, всё время). */
export interface ConsumptionViewRow {
  object_id: string;
  material_id: string;
  material_name: string;
  unit: string;
  cost_per_unit: number;
  consumed_quantity: number;
  operations: number;
  first_movement_at: Date | null;
  last_movement_at: Date | null;
}

/** Строка `report_material_consumption_daily` (расход по дням). */
export interface ConsumptionDailyViewRow {
  day: Date;
  object_id: string;
  material_id: string;
  material_name: string;
  unit: string;
  cost_per_unit: number;
  consumed_quantity: number;
  operations: number;
}

/** Строка `report_material_consumption_totals` (итог по объекту, всё время). */
export interface ConsumptionTotalsViewRow {
  object_id: string;
  materials_count: number;
  consumed_quantity: number;
  operations: number;
  last_movement_at: Date | null;
}

/** Фильтр дневной read-модели. `undefined` — без ограничения. */
export interface ConsumptionDailyFilter {
  objectId?: string;
  /** Начало периода включительно; сравнивается с датой дня (UTC). */
  from?: Date;
  /** Конец периода включительно. */
  to?: Date;
}

/** Фильтр объектных read-моделей: только объект (период к нему неприменим, см. выше). */
export interface ObjectOnlyFilter {
  objectId?: string;
}

/** Строка «остаток ниже порога» — для KPI доски действий. */
export interface LowStockViewRow {
  material_id: string;
  object_id: string;
  quantity: number;
  min_stock_threshold: number;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Расход по объекту и материалу за всё время (без периода — см. шапку файла). */
  async consumption(filter: ObjectOnlyFilter): Promise<ConsumptionViewRow[]> {
    return this.prisma.$queryRaw<ConsumptionViewRow[]>`
      SELECT object_id, material_id, material_name, unit, cost_per_unit,
             consumed_quantity, operations, first_movement_at, last_movement_at
      FROM report_material_consumption
      WHERE (${filter.objectId ?? null}::text IS NULL OR object_id = ${filter.objectId ?? null}::text)
      ORDER BY consumed_quantity DESC, material_name ASC
    `;
  }

  /** Расход по дням, объектам и материалам за период — основа отчёта М7.1. */
  async consumptionDaily(filter: ConsumptionDailyFilter): Promise<ConsumptionDailyViewRow[]> {
    return this.prisma.$queryRaw<ConsumptionDailyViewRow[]>`
      SELECT day, object_id, material_id, material_name, unit, cost_per_unit,
             consumed_quantity, operations
      FROM report_material_consumption_daily
      WHERE (${filter.objectId ?? null}::text IS NULL OR object_id = ${filter.objectId ?? null}::text)
        AND (${filter.from ?? null}::date IS NULL OR day >= ${filter.from ?? null}::date)
        AND (${filter.to ?? null}::date IS NULL OR day <= ${filter.to ?? null}::date)
      ORDER BY day ASC, material_name ASC
    `;
  }

  /** Итоги по объектам — для карточек доски действий. */
  async consumptionTotals(filter: ObjectOnlyFilter): Promise<ConsumptionTotalsViewRow[]> {
    return this.prisma.$queryRaw<ConsumptionTotalsViewRow[]>`
      SELECT object_id, materials_count, consumed_quantity, operations, last_movement_at
      FROM report_material_consumption_totals
      WHERE (${filter.objectId ?? null}::text IS NULL OR object_id = ${filter.objectId ?? null}::text)
      ORDER BY consumed_quantity DESC
    `;
  }

  /**
   * Остатки ниже порога материала — KPI «позиции ниже порога» на доске действий.
   *
   * Считается по ТАБЛИЦАМ, а не по read-модели: правило «ниже порога» — это сравнение
   * остатка с порогом справочника, то есть состояние склада, а не факт движения.
   */
  async lowStockMaterials(filter: ObjectOnlyFilter = {}): Promise<LowStockViewRow[]> {
    return this.prisma.$queryRaw<LowStockViewRow[]>`
      SELECT s."materialId" AS material_id,
             s."objectId"   AS object_id,
             s."quantity"   AS quantity,
             m."minStockThreshold" AS min_stock_threshold
      FROM "MaterialStock" s
      JOIN "Material" m ON m."id" = s."materialId"
      WHERE s."quantity" < m."minStockThreshold"
        AND (${filter.objectId ?? null}::text IS NULL OR s."objectId" = ${filter.objectId ?? null}::text)
      ORDER BY s."quantity" ASC
    `;
  }
}
