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
  /** Сообщение удалено — убрать его in-app уведомления у получателей (15.10.2026). */
  retractMessage(messageId: string): Promise<number>;
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
 * (сервисный JWT, тип CHAT_MESSAGE) и отвечает сводкой `{ delivered }`:
 * столько получателей получили in-app запись (и push, если есть устройства).
 *
 * Ошибка доставки push не отменяет отправку сообщения в чат: REST/WS-путь уже
 * завершён, push — лишь ускорение для оффлайн-пользователей, поэтому клиент
 * только логирует проблему и возвращает 0.
 */
@Injectable()
export class NotificationPushClient implements ChatPushNotifier {
  private readonly logger = new Logger(NotificationPushClient.name);

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

      if (!response.ok) {
        this.logger.warn(`notification-service вернул ${response.status} на push сообщения чата`);
        return 0;
      }

      // Ответ — сводка `{ delivered }`: часть получателей могла отключить тип
      // CHAT_MESSAGE в настройках, поэтому доставленных считаем по ответу, а не
      // по длине списка запроса.
      const delivered = await this.readDelivered(response, userIds.length);
      this.logger.log(`Push оффлайн-получателям: доставлено ${delivered} из ${userIds.length}`);
      return delivered;
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

  /**
   * Отзыв уведомлений об удалённом сообщении:
   * `DELETE {NOTIFICATION_SERVICE_URL}/api/notifications/internal/chat-message/:id`.
   * Ошибка не мешает удалению самого сообщения — оно уже удалено, уведомление
   * лишь указывало бы в пустоту; поэтому только лог и 0.
   */
  async retractMessage(messageId: string): Promise<number> {
    if (!this.enabled) {
      return 0;
    }
    const token = await this.tokens.getToken();
    if (!token) {
      this.logger.warn('Сервисный токен недоступен — уведомления об удалённом сообщении не отозваны');
      return 0;
    }
    const url = `${this.baseUrl}/api/notifications/internal/chat-message/${encodeURIComponent(messageId)}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`notification-service вернул ${response.status} на отзыв уведомлений`);
        return 0;
      }
      const payload = (await response.json().catch(() => null)) as { deleted?: unknown } | null;
      return typeof payload?.deleted === 'number' ? payload.deleted : 0;
    } catch (error) {
      this.logger.warn(
        `notification-service недоступен при отзыве уведомлений: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  /**
   * Число доставленных из сводки. Тело разбираем терпимо: старый/урезанный
   * ответ не должен превращать успешный push в ошибку — тогда считаем, что
   * уведомлены все получатели запроса.
   */
  private async readDelivered(response: Response, fallback: number): Promise<number> {
    const payload = (await response.json().catch(() => null)) as { delivered?: unknown } | null;
    const delivered = payload?.delivered;
    return typeof delivered === 'number' && Number.isFinite(delivered) ? delivered : fallback;
  }
}
