import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER } from './push/push-sender';
import { MockPushSender } from './push/mock-push.sender';
import { NotificationConsumer } from './rabbitmq/notification.consumer';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    RabbitmqService,
    NotificationConsumer,
    {
      // Firebase из проекта исключён (решение владельца, 27.09.2026):
      // единственный канал push — мок, реальная отправка не подключается.
      provide: PUSH_SENDER,
      useClass: MockPushSender,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
