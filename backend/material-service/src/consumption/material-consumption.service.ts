import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { EventsPublisher } from '../amqp/events.publisher';
import { CoreMaterialsClient } from '../integration/core-materials.client';
import {
  OPERATION_MATERIALS_RESOLVER,
  OperationMaterialsResolver,
} from '../integration/operation-materials.resolver';
import { MaterialsService } from '../materials/materials.service';
import { PrismaService } from '../prisma/prisma.service';

/** Payload события ticket.operation.completed (контракт 3.2). */
export interface TicketOperationCompletedEvent {
  operationId: string;
  ticketId: string;
  objectId: string;
  completedAt: string;
}

/** Кто списывает в автосписании: в событии пользователя нет. */
export const SYSTEM_USER_ID = 'system:auto-consumption';

export interface ConsumeResult {
  status: 'skipped' | 'consumed' | 'duplicate' | 'partial' | 'failed';
  /** Материалы, реально списанные этим вызовом. */
  consumed: Array<{ materialId: string; quantity: number }>;
  /** Материалы, движение по которым уже было записано ранее (идемпотентность). */
  duplicates: string[];
  /** Материалы, списание которых не удалось (нет остатка, нет материала, ноль расхода). */
  failed: Array<{ materialId: string; reason: string }>;
}

/**
 * Автосписание материалов по завершению операции техкарты (М4.2).
 *
 * Идемпотентность: таблица `ConsumedOperation` с `@@unique([operationId, materialId])`
 * пишется в ТОЙ ЖЕ транзакции, что и движение. Повторная доставка события
 * (или гонка двух консьюмеров) получает нарушение уникальности и пропускает
 * материал — материалы не списываются дважды.
 *
 * Порог: после успешного списания, если остаток ниже minStockThreshold,
 * публикуется `material.low`. Недоступность core (название объекта) не мешает
 * событию: в payload уходит objectId.
 */
@Injectable()
export class MaterialConsumptionService {
  private readonly logger = new Logger(MaterialConsumptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materials: MaterialsService,
    private readonly publisher: EventsPublisher,
    private readonly core: CoreMaterialsClient,
    @Inject(OPERATION_MATERIALS_RESOLVER)
    private readonly resolver: OperationMaterialsResolver,
  ) {}

  /** Обработка события. Никогда не бросает: результат описывает, что произошло. */
  async handleOperationCompleted(event: TicketOperationCompletedEvent): Promise<ConsumeResult> {
    const { operationId, ticketId, objectId } = event;
    const result: ConsumeResult = {
      status: 'skipped',
      consumed: [],
      duplicates: [],
      failed: [],
    };

    try {
      const required = await this.resolver.getOperationMaterials(ticketId, operationId);
      if (required === null) {
        this.logger.warn(
          `Операция ${operationId} (заявка ${ticketId}): материалы не определены — без списания`,
        );
        return result;
      }
      if (required.length === 0) {
        this.logger.log(`Операция ${operationId}: материалов нет — нечего списывать`);
        return result;
      }

      for (const requirement of required) {
        const quantity = consumptionQuantity(requirement);
        if (quantity === null) {
          this.logger.warn(
            `Операция ${operationId}: материал ${requirement.materialId} с нулевым расходом — пропуск`,
          );
          result.failed.push({ materialId: requirement.materialId, reason: 'нулевой расход' });
          continue;
        }

        try {
          const stock = await this.consumeRequirement({
            operationId,
            ticketId,
            objectId,
            materialId: requirement.materialId,
            quantity,
          });
          result.consumed.push({ materialId: requirement.materialId, quantity });
          await this.checkThreshold(requirement.materialId, objectId, stock.quantity);
        } catch (error) {
          if (isUniqueViolation(error)) {
            // Событие доставлено повторно — материал уже списан ранее.
            this.logger.log(
              `Операция ${operationId}: материал ${requirement.materialId} уже списан — пропуск`,
            );
            result.duplicates.push(requirement.materialId);
            continue;
          }
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Операция ${operationId}: материал ${requirement.materialId} не списан — ${reason}`,
          );
          result.failed.push({ materialId: requirement.materialId, reason });
        }
      }
    } catch (error) {
      result.status = 'failed';
      this.logger.error(
        `Ошибка автосписания по операции ${operationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return result;
    }

    if (result.consumed.length > 0 && result.failed.length > 0) {
      result.status = 'partial';
    } else if (result.consumed.length > 0) {
      result.status = 'consumed';
    } else if (result.duplicates.length > 0) {
      result.status = 'duplicate';
    }
    return result;
  }

  /**
   * Списание одного материала: движение OUT + запись идемпотентности в одной
   * транзакции. Возвращает остаток после списания.
   */
  private async consumeRequirement(params: {
    operationId: string;
    ticketId: string;
    objectId: string;
    materialId: string;
    quantity: number;
  }): Promise<{ quantity: number }> {
    const { operationId, ticketId, objectId, materialId, quantity } = params;

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.materialMovement.create({
        data: {
          materialId,
          objectId,
          type: 'OUT',
          quantity,
          ticketId,
          userId: SYSTEM_USER_ID,
        },
      });

      await this.materials.applyMovementWithinTransaction(tx, {
        materialId,
        objectId,
        type: 'OUT',
        quantity,
        userId: SYSTEM_USER_ID,
        ticketId,
      });

      await tx.consumedOperation.create({
        data: { operationId, materialId, ticketId, objectId, quantity, movementId: movement.id },
      });

      const stock = await tx.materialStock.findUnique({
        where: { materialId_objectId: { materialId, objectId } },
      });
      return { quantity: stock?.quantity ?? 0 };
    });
  }

  /** Порог: остаток ниже minStockThreshold → material.low (exchange cleaning-ops.events). */
  private async checkThreshold(
    materialId: string,
    objectId: string,
    quantity: number,
  ): Promise<void> {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, name: true, minStockThreshold: true },
    });
    if (!material || quantity >= material.minStockThreshold) {
      return;
    }

    const objectName = await this.core.getObjectName(objectId);
    const payload = {
      materialId,
      materialName: material.name,
      objectId,
      objectName: objectName ?? objectId,
      quantity,
      threshold: material.minStockThreshold,
    };

    const published = await this.publisher.publish(ROUTING_KEYS.MATERIAL_LOW, payload);
    this.logger.warn(
      `Материал ${material.name} ниже порога на объекте ${objectId}: ` +
        `${quantity} < ${material.minStockThreshold}` +
        (published ? ' — material.low опубликовано' : ' — материал ниже порога, событие не опубликовано'),
    );
  }
}

/**
 * Расход на операцию. Ноль/отрицательное значение — не списываем (не откатываем
 * всю операцию из-за одной некорректной строки техкарты).
 */
export function consumptionQuantity(material: {
  consumptionPerOperation: number;
}): number | null {
  const value = material.consumptionPerOperation;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Нарушение уникальности Prisma (P2002) — признак повторной доставки события. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
