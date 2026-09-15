import { Module } from '@nestjs/common';
import { EventsPublisher } from './events.publisher';
import { RabbitMqService } from './rabbitmq.service';

/** Публикация доменных событий в RabbitMQ (exchange cleaning-ops.events). */
@Module({
  providers: [RabbitMqService, EventsPublisher],
  exports: [RabbitMqService, EventsPublisher],
})
export class EventsModule {}
