import { Global, Module } from '@nestjs/common';
import { EventsPublisher } from './events.publisher';

/** Паблишер событий RabbitMQ — глобальный: им пользуются tickets и эскалация. */
@Global()
@Module({
  providers: [EventsPublisher],
  exports: [EventsPublisher],
})
export class EventsModule {}
