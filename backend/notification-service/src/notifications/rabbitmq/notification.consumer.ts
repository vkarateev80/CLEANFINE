import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EVENT_QUEUES } from '@cleaning-ops/shared/constants/events';
import {
  NOTIFICATION_ROUTING_KEYS,
  resolveEvent,
  type ResolvedNotification,
} from '../notification-events';
import { NotificationsService } from '../notifications.service';
import type { RabbitMessage } from './rabbitmq.service';
import { RabbitmqService } from './rabbitmq.service';

/**
 * RabbitMQ-консьюмер уведомлений (docs/agents/BACKEND_NOTIFICATIONS.md, п.4).
 *
 * Подписывается на очереди EVENT_QUEUES из shared/constants/events.ts и
 * превращает события в уведомления: событие → шаблон → получатели →
 * фильтр подписок → push (мок в dev) → in-app запись.
 */
@Injectable()
export class NotificationConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    private readonly rabbit: RabbitmqService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const routingKey of NOTIFICATION_ROUTING_KEYS) {
      this.rabbit.subscribe(EVENT_QUEUES[routingKey], routingKey, (message) =>
        this.handle(message),
      );
    }
    this.logger.log(`Консьюмер уведомлений: очередей ${NOTIFICATION_ROUTING_KEYS.length}`);
  }

  /** Обработка одного события. Ошибка обработки пробрасывается в RabbitmqService (nack). */
  async handle(message: RabbitMessage): Promise<void> {
    const resolved = resolveEvent(message.routingKey, message.payload);
    if (resolved === null) {
      this.logger.warn(`Событие ${message.routingKey} не преобразуется в уведомление — пропущено`);
      return;
    }

    // Контракт 3.2 не содержит получателя для emergency/overdue/material.low:
    // без assigneeId/userIds уведомляем бригадиров, админов и владельцев устройств.
    // Служебная аудитория (includeStaff) добавляется к явным получателям —
    // так смену статуса видят и админ, и автор заявки.
    const recipients = await this.resolveRecipients(resolved);

    if (recipients.length === 0) {
      this.logger.warn(`Событие ${message.routingKey}: получателей нет — пропущено`);
      return;
    }

    const notified = await this.notifications.notifyUsers(
      recipients,
      resolved.template,
      resolved.params,
      resolved.data,
    );
    this.logger.log(
      `Событие ${message.routingKey}: уведомлено ${notified} из ${recipients.length}`,
    );
  }

  /** Получатели события: явные + служебная аудитория/broadcast, минус исключённые. */
  async resolveRecipients(resolved: ResolvedNotification): Promise<string[]> {
    const recipients = new Set(resolved.userIds);
    if (resolved.includeStaff) {
      for (const userId of await this.notifications.resolveStaffRecipients()) {
        recipients.add(userId);
      }
    } else if (recipients.size === 0) {
      for (const userId of await this.notifications.resolveBroadcastRecipients()) {
        recipients.add(userId);
      }
    }
    for (const userId of resolved.excludeUserIds ?? []) {
      recipients.delete(userId);
    }
    return Array.from(recipients);
  }
}
