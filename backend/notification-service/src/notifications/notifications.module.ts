import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER } from './push/push-sender';
import { createPushSender } from './push/push-sender.factory';
import { NotificationConsumer } from './rabbitmq/notification.consumer';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    RabbitmqService,
    NotificationConsumer,
    {
      // Реализация push выбирается по конфигу: dev — мок, prod — FCM.
      provide: PUSH_SENDER,
      useFactory: (config: ConfigService) => createPushSender(config),
      inject: [ConfigService],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
