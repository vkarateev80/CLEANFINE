import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from '../integration/service-token.provider';
import { StaffDirectoryService } from '../integration/staff-directory.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER, type PushSender } from './push/push-sender';
import { MockPushSender } from './push/mock-push.sender';
import { NtfyPushSender } from './push/ntfy-push.sender';
import { WebPushSender } from './push/web-push.sender';
import { NotificationConsumer } from './rabbitmq/notification.consumer';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    RabbitmqService,
    NotificationConsumer,
    ServiceTokenProvider,
    StaffDirectoryService,
    WebPushSender,
    {
      // Firebase исключён (27.09.2026); 05.10 — self-hosted ntfy (PUSH_PROVIDER=ntfy),
      // дефолт mock: e2e/юниты ходят без внешнего push-сервиса.
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PushSender => {
        const provider = config.get<string>('push.provider') ?? 'mock';
        return provider === 'ntfy' ? new NtfyPushSender(config) : new MockPushSender();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
