import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TechCard, TechOperation } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateOperationDto,
  CreateTechCardDto,
  ReorderOperationsDto,
  UpdateOperationDto,
  UpdateTechCardDto,
} from './dto/tech-card.dto';

const ORDER_OFFSET = 100_000;

@Injectable()
export class TechCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTechCardDto): Promise<TechCard> {
    return this.prisma.techCard.create({ data: { name: dto.name } });
  }

  async list(query: { skip?: number; take?: number; search?: string }) {
    const where: Prisma.TechCardWhereInput = query.search
      ? { name: { contains: query.search, mode: 'insensitive' } }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.techCard.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 100),
        include: { _count: { select: { operations: true, rooms: true } } },
      }),
      this.prisma.techCard.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Техкарта с операциями (по orderIndex) и материалами, плюс суммарное время
   * и список помещений, где она используется.
   */
  async getDetail(id: string) {
    const card = await this.prisma.techCard.findUnique({
      where: { id },
      include: {
        operations: {
          orderBy: { orderIndex: 'asc' },
          include: { materials: true },
        },
        rooms: {
          select: {
            id: true,
            name: true,
            floor: { select: { id: true, name: true, objectId: true } },
          },
        },
      },
    });
    if (!card) {
      throw new NotFoundException('Техкарта не найдена');
    }
    return {
      ...card,
      totalEstimatedTimeMin: card.operations.reduce((sum, op) => sum + op.estimatedTimeMin, 0),
    };
  }

  async update(id: string, dto: UpdateTechCardDto): Promise<TechCard> {
    await this.getCard(id);
    return this.prisma.techCard.update({ where: { id }, data: { name: dto.name } });
  }

  /** Удаление техкарты: помещения, где она использовалась, остаются (onDelete: SetNull). */
  async remove(id: string): Promise<void> {
    await this.getCard(id);
    await this.prisma.techCard.delete({ where: { id } });
  }

  /** Добавление операции. orderIndex по умолчанию — в конец. */
  async addOperation(cardId: string, dto: CreateOperationDto): Promise<TechOperation> {
    await this.getCard(cardId);

    const orderIndex = dto.orderIndex ?? (await this.nextOrderIndex(cardId));

    return this.prisma.$transaction(async (tx) => {
      // Освобождаем место, если вставляем в середину
      if (dto.orderIndex !== undefined) {
        await this.shiftFrom(tx, cardId, orderIndex, 1);
      }

      return tx.techOperation.create({
        data: {
          techCardId: cardId,
          name: dto.name,
          orderIndex,
          description: dto.description,
          equipment: (dto.equipment ?? undefined) as Prisma.InputJsonValue | undefined,
          estimatedTimeMin: dto.estimatedTimeMin,
          requiresPhoto: dto.requiresPhoto ?? false,
          requiresQr: dto.requiresQr ?? false,
          ...(dto.materials?.length
            ? {
                materials: {
                  create: dto.materials.map((m) => ({
                    materialId: m.materialId,
                    consumptionPerOperation: m.consumptionPerOperation,
                    unit: m.unit,
                  })),
                },
              }
            : {}),
        },
        include: { materials: true },
      });
    });
  }

  async updateOperation(operationId: string, dto: UpdateOperationDto): Promise<TechOperation> {
    const operation = await this.getOperation(operationId);
    const orderChanged = dto.orderIndex !== undefined && dto.orderIndex !== operation.orderIndex;

    // Смена порядка — отдельной операцией (нужна перестановка соседей в транзакции).
    if (orderChanged) {
      await this.moveOperation(operationId, dto.orderIndex as number);
    }

    await this.prisma.$transaction(async (tx) => {
      // Полная замена материалов: сначала удаляем, затем создаём переданные
      if (dto.materials !== undefined) {
        await tx.techOperationMaterial.deleteMany({ where: { operationId } });
        if (dto.materials.length > 0) {
          await tx.techOperationMaterial.createMany({
            data: dto.materials.map((m) => ({
              operationId,
              materialId: m.materialId,
              consumptionPerOperation: m.consumptionPerOperation,
              unit: m.unit,
            })),
          });
        }
      }

      await tx.techOperation.update({
        where: { id: operationId },
        data: {
          name: dto.name,
          description: dto.description,
          // undefined — не менять, null — сбросить (Prisma.DbNull = JSON null),
          // объект — записать.
          ...(dto.equipment !== undefined
            ? {
                equipment:
                  dto.equipment === null ? Prisma.DbNull : (dto.equipment as Prisma.InputJsonValue),
              }
            : {}),
          estimatedTimeMin: dto.estimatedTimeMin,
          requiresPhoto: dto.requiresPhoto,
          requiresQr: dto.requiresQr,
        },
      });
    });

    const updated = await this.prisma.techOperation.findUnique({
      where: { id: operationId },
      include: { materials: true },
    });
    return updated as TechOperation;
  }

  /** Удаление операции с пересборкой порядковых номеров. */
  async removeOperation(operationId: string): Promise<void> {
    const operation = await this.getOperation(operationId);

    await this.prisma.$transaction(async (tx) => {
      await tx.techOperation.delete({ where: { id: operationId } });
      await this.renumber(tx, operation.techCardId);
    });
  }

  /**
   * Переупорядочивание операций техкарты (симметрично reorder точек маршрута).
   * Требуется полный список id; порядок массива = новый orderIndex.
   */
  async reorderOperations(cardId: string, dto: ReorderOperationsDto): Promise<TechOperation[]> {
    await this.getCard(cardId);

    const existing = await this.prisma.techOperation.findMany({
      where: { techCardId: cardId },
      orderBy: { orderIndex: 'asc' },
    });

    const existingIds = new Set(existing.map((op) => op.id));
    const foreign = dto.operationIds.filter((id) => !existingIds.has(id));
    if (foreign.length > 0) {
      throw new BadRequestException(`Операции не принадлежат техкарте: ${foreign.join(', ')}`);
    }
    if (dto.operationIds.length !== existing.length) {
      throw new BadRequestException(
        `Передан неполный список операций: в техкарте ${existing.length}, передано ${dto.operationIds.length}`,
      );
    }
    if (new Set(dto.operationIds).size !== dto.operationIds.length) {
      throw new BadRequestException('operationIds содержит дубликаты');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.operationIds.entries()) {
        await tx.techOperation.update({
          where: { id },
          data: { orderIndex: ORDER_OFFSET + index },
        });
      }
      for (const [index, id] of dto.operationIds.entries()) {
        await tx.techOperation.update({ where: { id }, data: { orderIndex: index } });
      }
    });

    return this.prisma.techOperation.findMany({
      where: { techCardId: cardId },
      orderBy: { orderIndex: 'asc' },
      include: { materials: true },
    });
  }

  private async moveOperation(operationId: string, targetIndex: number): Promise<void> {
    const operation = await this.getOperation(operationId);
    await this.prisma.$transaction(async (tx) => {
      const all = await tx.techOperation.findMany({
        where: { techCardId: operation.techCardId },
        orderBy: { orderIndex: 'asc' },
      });

      const without = all.filter((op) => op.id !== operationId);
      const clamped = Math.max(0, Math.min(targetIndex, without.length));
      without.splice(clamped, 0, operation);

      for (const [index, op] of without.entries()) {
        await tx.techOperation.update({
          where: { id: op.id },
          data: { orderIndex: ORDER_OFFSET + index },
        });
      }
      for (const [index, op] of without.entries()) {
        await tx.techOperation.update({ where: { id: op.id }, data: { orderIndex: index } });
      }
    });
  }

  private async nextOrderIndex(cardId: string): Promise<number> {
    const last = await this.prisma.techOperation.findFirst({
      where: { techCardId: cardId },
      orderBy: { orderIndex: 'desc' },
    });
    return (last?.orderIndex ?? -1) + 1;
  }

  /** Сдвиг операций вправо, чтобы освободить orderIndex. */
  private async shiftFrom(
    tx: Prisma.TransactionClient,
    cardId: string,
    fromIndex: number,
    delta: number,
  ): Promise<void> {
    const toShift = await tx.techOperation.findMany({
      where: { techCardId: cardId, orderIndex: { gte: fromIndex } },
      orderBy: { orderIndex: 'desc' },
    });
    for (const op of toShift) {
      await tx.techOperation.update({
        where: { id: op.id },
        data: { orderIndex: ORDER_OFFSET + op.orderIndex + delta },
      });
    }
    for (const op of toShift) {
      await tx.techOperation.update({
        where: { id: op.id },
        data: { orderIndex: op.orderIndex + delta },
      });
    }
  }

  /** Плотная нумерация операций техкарты после удаления. */
  private async renumber(tx: Prisma.TransactionClient, cardId: string): Promise<void> {
    const rest = await tx.techOperation.findMany({
      where: { techCardId: cardId },
      orderBy: { orderIndex: 'asc' },
    });
    for (const [index, op] of rest.entries()) {
      await tx.techOperation.update({
        where: { id: op.id },
        data: { orderIndex: ORDER_OFFSET + index },
      });
    }
    for (const [index, op] of rest.entries()) {
      await tx.techOperation.update({ where: { id: op.id }, data: { orderIndex: index } });
    }
  }

  private async getCard(id: string): Promise<TechCard> {
    const card = await this.prisma.techCard.findUnique({ where: { id } });
    if (!card) {
      throw new NotFoundException('Техкарта не найдена');
    }
    return card;
  }

  private async getOperation(id: string): Promise<TechOperation> {
    const operation = await this.prisma.techOperation.findUnique({ where: { id } });
    if (!operation) {
      throw new NotFoundException('Операция не найдена');
    }
    return operation;
  }
}
