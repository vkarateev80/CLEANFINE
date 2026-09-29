import { Injectable, Logger } from '@nestjs/common';
import { EVENTS_EXCHANGE, type RoutingKey } from '@cleaning-ops/shared/constants/events';
import { AmqpConnectionService, describeError } from './amqp-connection.service';

/**
 * Публикация доменных событий в exchange cleaning-ops.events (topic).
 * Используется для `material.low` (М4.2). Никогда не бросает: недоступность
 * брокера — только warning, складское движение при этом уже зафиксировано.
 */
@Injectable()
export class EventsPublisher {
  private readonly logger = new Logger(EventsPublisher.name);

  constructor(private readonly amqp: AmqpConnectionService) {}

  async publish(routingKey: RoutingKey, payload: unknown): Promise<boolean> {
    try {
      const channel = await this.amqp.getChannel();
      if (!channel) {
        this.logger.warn(`Событие ${routingKey} не опубликовано: RabbitMQ недоступен`);
        return false;
      }
      const body = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
      const sent = channel.publish(EVENTS_EXCHANGE, routingKey, body, {
        contentType: 'application/json',
        persistent: true,
      });
      this.logger.log(`Событие ${routingKey} → ${EVENTS_EXCHANGE}`);
      return sent;
    } catch (error) {
      this.logger.warn(`Не удалось опубликовать ${routingKey}: ${describeError(error)}`);
      await this.amqp.reset();
      return false;
    }
  }
}
