import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreMaterialsClient } from './core-materials.client';
import { OperationMaterials } from './operation-materials';
import { TicketsClient } from './tickets.client';

/**
 * Абстракция «материалы операции» — консьюмер автосписания не знает, REST это
 * или кэш. Даёт точку подмены в unit-тестах без мока fetch.
 */
export abstract class OperationMaterialsResolver {
  abstract getOperationMaterials(
    ticketId: string,
    operationId: string,
  ): Promise<OperationMaterials>;
}

export const OPERATION_MATERIALS_RESOLVER = Symbol('OPERATION_MATERIALS_RESOLVER');

/**
 * Реализация через API (М4.2):
 *   ticket-service `/api/tickets/:id` → roomId,
 *   core-service  `/api/rooms/:id`    → techCardId,
 *   core-service  `/api/tech-cards/:id` → operations[] → operationId → materials[].
 *
 * Прямое чтение БД core не используется: границы сервисов сохраняются, как в
 * остальных сервисах монорепозитория.
 */
@Injectable()
export class ApiOperationMaterialsResolver implements OperationMaterialsResolver {
  private readonly logger = new Logger(ApiOperationMaterialsResolver.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tickets: TicketsClient,
    private readonly core: CoreMaterialsClient,
  ) {}

  async getOperationMaterials(
    ticketId: string,
    operationId: string,
  ): Promise<OperationMaterials> {
    const ticket = await this.tickets.getTicket(ticketId);
    if (!ticket) {
      this.logger.warn(`Заявка ${ticketId} недоступна — автосписание пропущено`);
      return null;
    }
    if (!ticket.roomId) {
      this.logger.warn(
        `Заявка ${ticketId} без roomId — материалы операции ${operationId} не определить`,
      );
      return null;
    }
    return this.core.getOperationMaterials(ticket.roomId, operationId);
  }
}
