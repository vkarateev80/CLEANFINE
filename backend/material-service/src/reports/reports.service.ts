import { Injectable } from '@nestjs/common';
import {
  ReportsRepository,
  type ConsumptionTotalsViewRow,
  type ConsumptionViewRow,
} from './reports.repository';
import { round2 } from '../materials/materials.service';

/**
 * Отчёты material-service (М7.1, CQRS-read).
 *
 * Сервис только собирает ответ из строк read-модели: арифметика (стоимость по цене
 * справочника, суммы, ряды для графика) — здесь, потому что VIEW хранит количество и
 * цену, но не стоимость (см. комментарий миграции `20261001120000_m71_material_report_views`).
 */

/** Строка разреза «объект + материал»: то, что видит админка в таблице отчёта. */
export interface ConsumptionReportRow {
  objectId: string;
  materialId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  consumedQuantity: number;
  operationsCount: number;
  cost: number;
}

/** Точка ряда расхода по дням (график Recharts на странице «Отчёты»). */
export interface ConsumptionSeriesPoint {
  day: string;
  consumedQuantity: number;
  cost: number;
  operationsCount: number;
}

export interface ConsumptionReportView {
  from: string | null;
  to: string | null;
  rows: ConsumptionReportRow[];
  totals: { consumedQuantity: number; operationsCount: number; cost: number };
  series: ConsumptionSeriesPoint[];
}

/** KPI расхода для карточек дашборда. */
export interface ConsumptionSummaryView {
  consumedQuantity30d: number;
  cost30d: number;
  operations30d: number;
  materialsCount: number;
  objectsCount: number;
  lowStockCount: number;
  topMaterials: Array<{ materialId: string; name: string; unit: string; cost: number }>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  /**
   * Отчёт по расходу: разрез по объекту, периоду и материалу.
   *
   * Источник — ДНЕВНАЯ read-модель: только у неё зернистость мельче периода, поэтому
   * «расход за март» из неё выводится честно (обоснование — в шапке `ReportsRepository`).
   */
  async consumption(filter: {
    objectId?: string;
    from?: string;
    to?: string;
  }): Promise<ConsumptionReportView> {
    const daily = await this.repository.consumptionDaily({
      objectId: filter.objectId,
      from: parseOptionalDate(filter.from),
      to: parseOptionalDate(filter.to),
    });

    const byObjectAndMaterial = new Map<string, ConsumptionReportRow>();
    const byDay = new Map<string, ConsumptionSeriesPoint>();
    const totals = { consumedQuantity: 0, operationsCount: 0, cost: 0 };

    for (const row of daily) {
      const cost = round2(number(row.consumed_quantity) * number(row.cost_per_unit));
      const quantity = number(row.consumed_quantity);
      const operations = number(row.operations);

      const key = `${row.object_id}::${row.material_id}`;
      const aggregated = byObjectAndMaterial.get(key);
      if (aggregated) {
        aggregated.consumedQuantity = round2(aggregated.consumedQuantity + quantity);
        aggregated.operationsCount += operations;
        aggregated.cost = round2(aggregated.cost + cost);
      } else {
        byObjectAndMaterial.set(key, {
          objectId: row.object_id,
          materialId: row.material_id,
          name: row.material_name,
          unit: row.unit,
          costPerUnit: number(row.cost_per_unit),
          consumedQuantity: round2(quantity),
          operationsCount: operations,
          cost,
        });
      }

      const day = toDayString(row.day);
      const point = byDay.get(day) ?? { day, consumedQuantity: 0, cost: 0, operationsCount: 0 };
      point.consumedQuantity = round2(point.consumedQuantity + quantity);
      point.cost = round2(point.cost + cost);
      point.operationsCount += operations;
      byDay.set(day, point);

      totals.consumedQuantity = round2(totals.consumedQuantity + quantity);
      totals.operationsCount += operations;
      totals.cost = round2(totals.cost + cost);
    }

    const rows = [...byObjectAndMaterial.values()].sort(
      (left, right) => right.cost - left.cost || left.name.localeCompare(right.name, 'ru'),
    );
    const series = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));

    return {
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows,
      totals,
      series,
    };
  }

  /**
   * Расход без разреза по объекту — контракт существующего `GET /api/materials/report`
   * (М4.3). Отдельный метод, а не флаг: у него своя форма ответа, которую нельзя менять
   * (её читает вкладка «Отчёт» экрана «Материалы»).
   */
  async consumptionByMaterial(filter: { objectId?: string; from?: string; to?: string }): Promise<{
    objectId: string | null;
    from: string | null;
    to: string | null;
    rows: Array<{
      materialId: string;
      name: string;
      unit: string;
      costPerUnit: number;
      consumedQuantity: number;
      operationsCount: number;
      cost: number;
    }>;
    totals: { consumedQuantity: number; operationsCount: number; cost: number };
  }> {
    const report = await this.consumption(filter);

    const byMaterial = new Map<
      string,
      {
        materialId: string;
        name: string;
        unit: string;
        costPerUnit: number;
        consumedQuantity: number;
        operationsCount: number;
        cost: number;
      }
    >();
    for (const row of report.rows) {
      const aggregated = byMaterial.get(row.materialId);
      if (aggregated) {
        aggregated.consumedQuantity = round2(aggregated.consumedQuantity + row.consumedQuantity);
        aggregated.operationsCount += row.operationsCount;
        aggregated.cost = round2(aggregated.cost + row.cost);
      } else {
        // Поля перечислены явно: `objectId` в контракт М4.3 не входит, и раскладывать
        // строку спредом нельзя — в ответе появилось бы лишнее поле.
        byMaterial.set(row.materialId, {
          materialId: row.materialId,
          name: row.name,
          unit: row.unit,
          costPerUnit: row.costPerUnit,
          consumedQuantity: row.consumedQuantity,
          operationsCount: row.operationsCount,
          cost: row.cost,
        });
      }
    }

    const rows = [...byMaterial.values()].sort(
      (left, right) => right.cost - left.cost || left.name.localeCompare(right.name, 'ru'),
    );

    return {
      objectId: filter.objectId ?? null,
      from: filter.from ?? null,
      to: filter.to ?? null,
      rows,
      totals: report.totals,
    };
  }

  /**
   * KPI дашборда: расход за последние 30 дней, число материалов и объектов, позиции
   * ниже порога, топ-5 материалов по стоимости.
   *
   * «За 30 дней» — решение, принятое здесь: план М7.1 не задаёт окно KPI. 30 дней —
   * компромисс между «месяц как отчётный период» и стоимостью запроса по read-модели
   * (окно передаётся в SQL, а не фильтруется в памяти).
   */
  async summary(): Promise<ConsumptionSummaryView> {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [daily, totals, lowStock] = await Promise.all([
      this.repository.consumptionDaily({ from, to }),
      this.repository.consumptionTotals({}),
      this.repository.lowStockMaterials(),
    ]);

    const report = daily.reduce(
      (acc, row) => {
        const quantity = number(row.consumed_quantity);
        const cost = round2(quantity * number(row.cost_per_unit));
        acc.consumedQuantity = round2(acc.consumedQuantity + quantity);
        acc.cost = round2(acc.cost + cost);
        acc.operations += number(row.operations);
        acc.byMaterial.set(row.material_id, {
          materialId: row.material_id,
          name: row.material_name,
          unit: row.unit,
          cost: round2((acc.byMaterial.get(row.material_id)?.cost ?? 0) + cost),
        });
        return acc;
      },
      {
        consumedQuantity: 0,
        cost: 0,
        operations: 0,
        byMaterial: new Map<
          string,
          { materialId: string; name: string; unit: string; cost: number }
        >(),
      },
    );

    return {
      consumedQuantity30d: report.consumedQuantity,
      cost30d: report.cost,
      operations30d: report.operations,
      materialsCount: countMaterials(totals),
      objectsCount: totals.length,
      lowStockCount: lowStock.length,
      topMaterials: [...report.byMaterial.values()].sort((a, b) => b.cost - a.cost).slice(0, 5),
    };
  }

  /** Разрез «объект + материал» за всё время — вторая таблица страницы «Отчёты». */
  async byObject(filter: { objectId?: string }): Promise<{
    rows: ConsumptionReportRow[];
    totals: { consumedQuantity: number; operationsCount: number; cost: number };
  }> {
    const rows = await this.repository.consumption(filter);

    const mapped = rows.map((row: ConsumptionViewRow) => ({
      objectId: row.object_id,
      materialId: row.material_id,
      name: row.material_name,
      unit: row.unit,
      costPerUnit: number(row.cost_per_unit),
      consumedQuantity: round2(number(row.consumed_quantity)),
      operationsCount: number(row.operations),
      cost: round2(number(row.consumed_quantity) * number(row.cost_per_unit)),
    }));

    return {
      rows: mapped,
      totals: mapped.reduce(
        (acc, row) => ({
          consumedQuantity: round2(acc.consumedQuantity + row.consumedQuantity),
          operationsCount: acc.operationsCount + row.operationsCount,
          cost: round2(acc.cost + row.cost),
        }),
        { consumedQuantity: 0, operationsCount: 0, cost: 0 },
      ),
    };
  }
}

/** Prisma отдаёт `SUM(float8)` как number, но `$queryRaw` может вернуть строку: приводим. */
function number(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value);
}

/** `date` из Postgres → `YYYY-MM-DD` (в ответе API день без времени и без таймзоны). */
function toDayString(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** «Сколько разных материалов» — сумма по объектам (материал может быть на нескольких). */
function countMaterials(totals: ConsumptionTotalsViewRow[]): number {
  return totals.reduce((max, row) => Math.max(max, number(row.materials_count)), 0);
}
