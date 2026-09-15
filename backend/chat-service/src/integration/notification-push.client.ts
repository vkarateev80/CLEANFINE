import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenProvider } from './service-token.provider';

/** Что нужно отправить оффлайн-получателям сообщения чата. */
export interface ChatPushRequest {
  /** Получатели, у которых нет активного WebSocket-соединения. */
  userIds: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

/**
 * Доставщик push оффлайн-получателям. Абстракция нужна, чтобы ChatService и
 * шлюз зависели от интерфейса, а не от конкретного транспорта (и легко мокались).
 */
export interface ChatPushNotifier {
  notifyOffline(request: ChatPushRequest): Promise<number>;
}

export const CHAT_PUSH_NOTIFIER = 'CHAT_PUSH_NOTIFIER';

/**
 * Push оффлайн-получателям сообщения чата (М5.1) через REST notification-service.
 *
 * ВАЖНО (решение зафиксировано в README): routing key `chat.message` в
 * shared/constants/events.ts отсутствует, а контракт событий меняется только
 * через review архитектора, поэтому RabbitMQ-путь не расширяется молча.
 * Notification-service принимает push через внутренний вызов
 * `POST {NOTIFICATION_SERVICE_URL}/api/notifications/internal/chat-message`
 * (сервисный JWT, тип CHAT_MESSAGE). Пока такого эндпоинта в
 * notification-service нет — вызов отвечает 404, клиент это логирует и
 * возвращает 0. Доставка сообщения в чат от этого не страдает: REST/WS-путь
 * уже завершён, push — лишь ускорение для оффлайн-пользователей.
 *
 * Такой клиент готов к включению push без правок chat-service: достаточно
 * добавить эндпоинт (и тип CHAT_MESSAGE) в notification-service.
 */
@Injectable()
export class NotificationPushClient implements ChatPushNotifier {
  private readonly logger = new Logger(NotificationPushClient.name);
  private skippedOnce = false;

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: ServiceTokenProvider,
  ) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('notificationService.baseUrl') ?? 'http://localhost:3006'
    ).replace(/\/+$/, '');
  }

  private get timeoutMs(): number {
    return this.config.get<number>('notificationService.timeoutMs') ?? 5_000;
  }

  private get enabled(): boolean {
    return this.config.get<boolean>('notificationService.enabled') ?? true;
  }

  async notifyOffline(request: ChatPushRequest): Promise<number> {
    const userIds = Array.from(new Set(request.userIds.filter((id) => id !== '')));
    if (userIds.length === 0) {
      return 0;
    }
    if (!this.enabled) {
      this.logger.debug('Push оффлайн-получателям выключен (CHAT_PUSH_ENABLED=false)');
      return 0;
    }

    const token = await this.tokens.getToken();
    if (!token) {
      this.logger.warn('Сервисный токен недоступен — push оффлайн-получателям пропущен');
      return 0;
    }

    const url = `${this.baseUrl}/api/notifications/internal/chat-message`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userIds,
          type: 'CHAT_MESSAGE',
          title: request.title,
          body: request.body,
          data: request.data,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status === 404) {
        // Однократный warning: иначе каждое сообщение оффлайн-пользователю шумит в логах.
        if (!this.skippedOnce) {
          this.skippedOnce = true;
          this.logger.warn(
            'notification-service не имеет эндпоинта chat-message (404): ' +
              'push оффлайн-получателям не доставляется (см. README chat-service)',
          );
        }
        return 0;
      }
      if (!response.ok) {
        this.logger.warn(`notification-service вернул ${response.status} на push сообщения чата`);
        return 0;
      }
      this.logger.log(`Push оффлайн-получателям: ${userIds.length} чел.`);
      return userIds.length;
    } catch (error) {
      // Недоступность notification-service не должна отменять отправку сообщения.
      this.logger.warn(
        `notification-service недоступен (${this.baseUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }
}
