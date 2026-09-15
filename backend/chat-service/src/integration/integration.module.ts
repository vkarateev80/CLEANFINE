import { Global, Module } from '@nestjs/common';
import { CoreClient } from './core.client';
import {
  CHAT_PUSH_NOTIFIER,
  NotificationPushClient,
} from './notification-push.client';
import { ServiceTokenProvider } from './service-token.provider';
import { TicketClient } from './ticket.client';

/**
 * Внутренние вызовы chat-service: сервисный токен, клиенты ticket/core,
 * push оффлайн-получателям. Глобальный — ChatService и шлюз берут зависимости
 * по токену-абстракции, не завися от конкретной реализации транспорта.
 */
@Global()
@Module({
  providers: [
    ServiceTokenProvider,
    TicketClient,
    CoreClient,
    NotificationPushClient,
    { provide: CHAT_PUSH_NOTIFIER, useExisting: NotificationPushClient },
  ],
  exports: [ServiceTokenProvider, TicketClient, CoreClient, CHAT_PUSH_NOTIFIER],
})
export class IntegrationModule {}
