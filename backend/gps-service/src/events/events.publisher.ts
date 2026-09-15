import { Injectable, Logger } from '@nestjs/common';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import type { GeofenceExitEvent } from '@cleaning-ops/shared/types/events';
import { RabbitMqService } from './rabbitmq.service';

/**
 * Доменные события gps-service (контракт ПЛАН.md п.3.2).
 * Транспорт — RabbitMqService; здесь только маршрутизация и логирование.
 */
@Injectable()
export class EventsPublisher {
  private readonly logger = new Logger(EventsPublisher.name);

  constructor(private readonly rabbit: RabbitMqService) {}

  /**
   * geofence.exit: сотрудник вышел из геозоны объекта → notification-service
   * уведомляет бригадира/админа. Недоступность брокера не роняет приём треков.
   */
  publishGeofenceExit(event: GeofenceExitEvent): Promise<boolean> {
    return this.publish(ROUTING_KEYS.GEOFENCE_EXIT, event);
  }

  private async publish(routingKey: string, payload: unknown): Promise<boolean> {
    const published = await this.rabbit.publish(routingKey, payload);
    if (!published) {
      this.logger.warn(`Событие ${routingKey} не опубликовано (брокер недоступен)`);
    }
    return published;
  }
}
