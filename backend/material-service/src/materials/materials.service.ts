import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Material, MaterialMovement, MaterialStock, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { rangeFilter } from './date-range';
import {
  CreateMaterialDto,
  ListMaterialsQueryDto,
  StocksQueryDto,
  UpdateMaterialDto,
} from './dto/material.dto';
import { isConsumingMovement, stockEffects } from './movement-effects';
import type { MovementType } from '@cleaning-ops/shared/types/materials';

/** Позиция склада вместе с материалом: наружу отдаётся с признаком «ниже порога». */
export interface StockView {
  materialId: string;
  objectId: string;
  quantity: number;
  minStockThreshold: number;
  belowThreshold: boolean;
  updatedAt: Date;
  material: { id: string; name: string; unit: string; costPerUnit: number };
}

/** Итог отчёта по одному материалу. */
export interface MaterialConsumptionRow {
  materialId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  consumedQuantity: number;
  operationsCount: number;
  cost: number;
}

export interface ConsumptionReport {
  objectId: string | null;
  from: string | null;
  to: string | null;
  rows: MaterialConsumptionRow[];
  totals: { consumedQuantity: number; operationsCount: number; cost: number };
}

/** Контекст движения — общий для ручного API и автосписания (М4.2). */
export interface MovementContext {
  materialId: string;
  objectId: string;
  type: MovementType;
  quantity: number;
  userId: string;
  ticketId?: string | null;
  targetObjectId?: string | null;
}

/**
 * Справочник материалов, складские остатки, движения и отчёт по расходу (М4.1).
 *
 * Все изменения остатка идут через `applyMovementWithinTransaction`: остаток
 * пересчитывается транзакционно вместе с записью движения, а уход в минус
 * отклоняется — см. `assertNonNegative`.
 */
@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- справочник

  async create(dto: CreateMaterialDto): Promise<Material> {
    return this.prisma.material.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        defaultConsumption: dto.defaultConsumption,
        minStockThreshold: dto.minStockThreshold,
        costPerUnit: dto.costPerUnit,
        supplier: dto.supplier ?? null,
      },
    });
  }

  async list(query: ListMaterialsQueryDto) {
    const where: Prisma.MaterialWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { supplier: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.material.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
        include: { _count: { select: { stocks: true, movements: true } } },
      }),
      this.prisma.material.count({ where }),
    ]);

    return { items, total };
  }

  async getById(id: string): Promise<Material> {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: {
        stocks: { orderBy: { objectId: 'asc' } },
      },
    });
    if (!material) {
      throw new NotFoundException('Материал не найден');
    }
    return material;
  }

  async update(id: string, dto: UpdateMaterialDto): Promise<Material> {
    await this.getById(id);
    return this.prisma.material.update({
      where: { id },
      data: {
        name: dto.name,
        unit: dto.unit,
        defaultConsumption: dto.defaultConsumption,
        minStockThreshold: dto.minStockThreshold,
        costPerUnit: dto.costPerUnit,
        // undefined — не менять, null — очистить поставщика.
        ...(dto.supplier !== undefined ? { supplier: dto.supplier } : {}),
      },
    });
  }

  /** Удаление материала каскадом снимает остатки и историю движений (FK в схеме). */
  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.material.delete({ where: { id } });
  }

  // -------------------------------------------------------------------- склад

  async listStocks(query: StocksQueryDto): Promise<{ items: StockView[]; total: number }> {
    const stocks = await this.prisma.materialStock.findMany({
      where: query.objectId ? { objectId: query.objectId } : {},
      include: {
        material: { select: { id: true, name: true, unit: true, costPerUnit: true, minStockThreshold: true } },
      },
      orderBy: [{ objectId: 'asc' }, { material: { name: 'asc' } }],
    });

    const items: StockView[] = stocks
      .map((stock) => toStockView(stock))
      .filter((stock) => (query.onlyLow ? stock.belowThreshold : true));

    return { items, total: items.length };
  }

  // ----------------------------------------------------------------- движения

  /**
   * Ручное движение: остаток пересчитывается транзакционно; попытка уйти в минус → 400.
   * Для TRANSFER обязателен targetObjectId: списание с одного объекта, приход на другой.
   */
  async createMovement(context: MovementContext) {
    this.validateMovement(context);
    return this.prisma.$transaction(async (tx) => {
      await this.assertMaterialExists(tx, context.materialId);
      const movement = await tx.materialMovement.create({
        data: {
          materialId: context.materialId,
          objectId: context.objectId,
          type: context.type,
          quantity: context.quantity,
          ticketId: context.ticketId ?? null,
          userId: context.userId,
          targetObjectId: context.targetObjectId ?? null,
        },
      });
      const stocks = await this.applyMovementWithinTransaction(tx, context);
      return { movement, stocks };
    });
  }

  async listMovements(
    materialId: string,
    query: { objectId?: string; from?: string; to?: string; limit?: number },
  ) {
    await this.assertMaterialExists(this.prisma, materialId);

    const where: Prisma.MaterialMovementWhereInput = {
      materialId,
      ...(query.objectId ? { objectId: query.objectId } : {}),
    };
    const createdAt = rangeFilter({
      from: parseOptionalDate(query.from),
      to: parseOptionalDate(query.to),
    });
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.materialMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(query.limit ?? 100, 500),
      }),
      this.prisma.materialMovement.count({ where }),
    ]);

    return { items, total };
  }

  // --------------------------------------------------------------------- отчёт

  /**
   * Отчёт по расходу: агрегаты OUT/WRITE_OFF по материалам за объект и период
   * (сумма, количество операций) плюс итог по стоимости (цена справочника).
   */
  async report(query: { objectId?: string; from?: string; to?: string }): Promise<ConsumptionReport> {
    const where: Prisma.MaterialMovementWhereInput = {
      type: { in: ['OUT', 'WRITE_OFF'] },
      ...(query.objectId ? { objectId: query.objectId } : {}),
    };
    const createdAt = rangeFilter({
      from: parseOptionalDate(query.from),
      to: parseOptionalDate(query.to),
    });
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const grouped = await this.prisma.materialMovement.groupBy({
      by: ['materialId'],
      where,
      _sum: { quantity: true },
      _count: { _all: true },
    });

    const materialIds = grouped.map((row) => row.materialId);
    const materials = materialIds.length
      ? await this.prisma.material.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, name: true, unit: true, costPerUnit: true },
        })
      : [];
    const byId = new Map(materials.map((material) => [material.id, material]));

    const rows: MaterialConsumptionRow[] = grouped
      .map((row) => {
        const material = byId.get(row.materialId);
        const consumedQuantity = row._sum.quantity ?? 0;
        const costPerUnit = material?.costPerUnit ?? 0;
        return {
          materialId: row.materialId,
          name: material?.name ?? row.materialId,
          unit: material?.unit ?? '',
          costPerUnit,
          consumedQuantity,
          operationsCount: row._count._all,
          cost: round2(consumedQuantity * costPerUnit),
        };
      })
      .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, 'ru'));

    return {
      objectId: query.objectId ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      rows,
      totals: {
        consumedQuantity: round2(rows.reduce((sum, row) => sum + row.consumedQuantity, 0)),
        operationsCount: rows.reduce((sum, row) => sum + row.operationsCount, 0),
        cost: round2(rows.reduce((sum, row) => sum + row.cost, 0)),
      },
    };
  }

  // ------------------------------------------------------------------ helpers

  /** Доменные проверки движения до транзакции (400 вместо 500). */
  validateMovement(context: MovementContext): void {
    if (!Number.isFinite(context.quantity) || context.quantity <= 0) {
      throw new BadRequestException('Количество должно быть больше 0');
    }
    if (context.type === 'TRANSFER') {
      if (!context.targetObjectId) {
        throw new BadRequestException('Для TRANSFER обязателен targetObjectId');
      }
      if (context.targetObjectId === context.objectId) {
        throw new BadRequestException('targetObjectId должен отличаться от objectId');
      }
    } else if (context.targetObjectId) {
      throw new BadRequestException('targetObjectId допустим только для TRANSFER');
    }
  }

  /**
   * Применяет складской эффект движения внутри уже открытой транзакции.
   * Каждый объект обновляется условным UPDATE (quantity + delta >= 0), поэтому
   * уход в минус невозможен даже при конкурентных движениях.
   */
  async applyMovementWithinTransaction(
    tx: Prisma.TransactionClient,
    context: MovementContext,
  ): Promise<Array<{ objectId: string; quantity: number }>> {
    const effects = stockEffects(
      context.type,
      context.quantity,
      context.objectId,
      context.targetObjectId,
    );

    const result: Array<{ objectId: string; quantity: number }> = [];
    for (const effect of effects) {
      const stock = await tx.materialStock.upsert({
        where: {
          materialId_objectId: { materialId: context.materialId, objectId: effect.objectId },
        },
        create: {
          materialId: context.materialId,
          objectId: effect.objectId,
          quantity: 0,
        },
        update: {},
      });

      const next = stock.quantity + effect.delta;
      if (next < 0) {
        throw new BadRequestException(
          `Недостаточно материала на объекте ${effect.objectId}: остаток ${stock.quantity}, ` +
            `запрошено ${Math.abs(effect.delta)}`,
        );
      }

      const updated = await tx.materialStock.updateMany({
        where: {
          materialId: context.materialId,
          objectId: effect.objectId,
          quantity: { gte: -effect.delta },
        },
        data: { quantity: { increment: effect.delta } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          `Недостаточно материала на объекте ${effect.objectId}: остаток изменился ` +
            'конкурентным движением',
        );
      }
      result.push({ objectId: effect.objectId, quantity: round2(next) });
    }

    if (isConsumingMovement(context.type)) {
      this.logger.log(
        `Расход материала ${context.materialId}: ${context.quantity} с объекта ${context.objectId}` +
          (context.ticketId ? ` (заявка ${context.ticketId})` : ''),
      );
    }
    return result;
  }

  async assertMaterialExists(
    client: Prisma.TransactionClient | PrismaService,
    materialId: string,
  ): Promise<void> {
    const material = await client.material.findUnique({
      where: { id: materialId },
      select: { id: true },
    });
    if (!material) {
      throw new NotFoundException(`Материал ${materialId} не найден`);
    }
  }
}

/** Строка склада → контракт API: добавляет признак «ниже порога». */
export function toStockView(
  stock: MaterialStock & {
    material: { id: string; name: string; unit: string; costPerUnit: number; minStockThreshold: number };
  },
): StockView {
  return {
    materialId: stock.materialId,
    objectId: stock.objectId,
    quantity: round2(stock.quantity),
    minStockThreshold: stock.material.minStockThreshold,
    belowThreshold: stock.quantity < stock.material.minStockThreshold,
    updatedAt: stock.updatedAt,
    material: {
      id: stock.material.id,
      name: stock.material.name,
      unit: stock.material.unit,
      costPerUnit: stock.material.costPerUnit,
    },
  };
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Округление до 2 знаков — чтобы 0.1+0.2 не уезжало в отчёт. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type { MaterialMovement };
