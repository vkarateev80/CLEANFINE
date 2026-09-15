import { Global, Module } from '@nestjs/common';
import { AmqpConnectionService } from './amqp-connection.service';
import { EventsPublisher } from './events.publisher';

/** RabbitMQ: общее ленивое соединение + публикация событий (material.low). */
@Global()
@Module({
  providers: [AmqpConnectionService, EventsPublisher],
  exports: [AmqpConnectionService, EventsPublisher],
})
export class AmqpModule {}
