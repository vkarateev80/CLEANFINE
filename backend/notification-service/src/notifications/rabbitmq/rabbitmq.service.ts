import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';
// amqplib 0.10.5+: connect() отдаёт ChannelModel (фасад соединения), а Connection —
// нижележащий сокет-слой; в сервисе нужен именно ChannelModel.
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { EVENTS_EXCHANGE, EVENTS_EXCHANGE_DLQ } from '@cleaning-ops/shared/constants/events';
import { errorMessage } from '../../common/error.util';
import { DEFAULT_RABBITMQ_URL } from '../../config/configuration';

export interface RabbitMessage {
  queue: string;
  routingKey: string;
  payload: unknown;
}

export type RabbitMessageHandler = (message: RabbitMessage) => Promise<void>;

interface Subscription {
  queue: string;
  routingKey: string;
  handler: RabbitMessageHandler;
}

/** Потолок задержки переподключения — 6 базовых интервалов (30 с по умолчанию). */
const RECONNECT_DELAY_CAP_MULTIPLIER = 6;

/**
 * Подписка на очереди RabbitMQ (amqplib) с ленивым подключением и ретраями.
 *
 * Требование М3.3: недоступный брокер не должен ронять сервис. Поэтому здесь
 * нет падения в onModuleInit — подключение идёт фоном с backoff, а HTTP-часть
 * (регистрация устройств, in-app список, настройки) работает независимо.
 */
@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private readonly subscriptions: Subscription[] = [];
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private connecting = false;
  private disposed = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('rabbitmq.enabled')) {
      this.logger.warn('RabbitMQ-консьюмер отключён (NOTIFICATION_RABBITMQ_ENABLED=false)');
      return;
    }
    // Намеренно без await: старт приложения не зависит от доступности брокера.
    void this.connectWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    this.disposed = true;
    this.clearReconnectTimer();

    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;

    if (channel !== null) {
      try {
        await channel.close();
      } catch (error) {
        this.logger.debug(`RabbitMQ: канал уже закрыт (${errorMessage(error)})`);
      }
    }
    if (connection !== null) {
      try {
        await connection.close();
      } catch (error) {
        this.logger.debug(`RabbitMQ: соединение уже закрыто (${errorMessage(error)})`);
      }
    }
  }

  /** Зарегистрированные очереди (диагностика и тесты). */
  get subscribedQueues(): string[] {
    return this.subscriptions.map((subscription) => subscription.queue);
  }

  /**
   * Подписка на очередь. Повторная регистрация той же очереди игнорируется,
   * иначе сообщения дублировались бы между двумя consumer-ами канала.
   */
  subscribe(queue: string, routingKey: string, handler: RabbitMessageHandler): void {
    if (this.subscriptions.some((subscription) => subscription.queue === queue)) {
      return;
    }
    const subscription: Subscription = { queue, routingKey, handler };
    this.subscriptions.push(subscription);

    // Соединение может установиться раньше, чем консьюмер зарегистрирует подписки.
    const channel = this.channel;
    if (channel !== null) {
      void this.bind(channel, subscription).catch((error: unknown) => {
        this.logger.error(`RabbitMQ: не удалось подписаться на ${queue}: ${errorMessage(error)}`);
      });
    }
  }

  private async connectWithRetry(): Promise<void> {
    if (this.disposed || this.connecting) {
      return;
    }
    this.connecting = true;
    try {
      const url = this.config.get<string>('rabbitmq.url') ?? DEFAULT_RABBITMQ_URL;
      const connection = await connect(url);
      this.connection = connection;
      connection.on('error', (error: unknown) => {
        this.logger.error(`RabbitMQ: ошибка соединения: ${errorMessage(error)}`);
      });
      connection.on('close', () => this.handleDisconnect('соединение закрыто'));

      const channel = await connection.createChannel();
      this.channel = channel;
      channel.on('error', (error: unknown) => {
        this.logger.error(`RabbitMQ: ошибка канала: ${errorMessage(error)}`);
      });
      channel.on('close', () => this.handleDisconnect('канал закрыт'));

      await channel.prefetch(this.config.get<number>('rabbitmq.prefetch') ?? 10);
      await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
      for (const subscription of this.subscriptions) {
        await this.bind(channel, subscription);
      }

      this.reconnectAttempt = 0;
      this.logger.log(
        `RabbitMQ подключён: exchange=${EVENTS_EXCHANGE}, подписок ${this.subscriptions.length}`,
      );
    } catch (error) {
      this.logger.warn(`RabbitMQ недоступен: ${errorMessage(error)}`);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private handleDisconnect(reason: string): void {
    if (this.disposed) {
      return;
    }
    this.channel = null;
    this.connection = null;
    this.logger.warn(`RabbitMQ: ${reason} — переподключение`);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) {
      return;
    }
    this.reconnectAttempt += 1;
    const baseDelay = this.config.get<number>('rabbitmq.reconnectBaseMs') ?? 5_000;
    // Линейный backoff с потолком: не долбим брокер и не ждём бесконечно долго.
    const delay = Math.min(
      baseDelay * this.reconnectAttempt,
      baseDelay * RECONNECT_DELAY_CAP_MULTIPLIER,
    );
    this.logger.log(`RabbitMQ: повтор через ${delay} мс (попытка ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectWithRetry();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async bind(channel: Channel, subscription: Subscription): Promise<void> {
    await channel.assertExchange(EVENTS_EXCHANGE_DLQ, 'topic', { durable: true });
    await channel.assertQueue(subscription.queue, { durable: true });
    await channel.bindQueue(subscription.queue, EVENTS_EXCHANGE, subscription.routingKey);
    // DLQ той же routing key: nack(requeue=false) сам по себе сообщение теряет,
    // если очередь не привязана к dead-letter exchange (дефект «DLX/DLQ не привязаны»).
    await channel.assertQueue(dlqName(subscription.queue), { durable: true });
    await channel.bindQueue(
      dlqName(subscription.queue),
      EVENTS_EXCHANGE_DLQ,
      subscription.routingKey,
    );
    await channel.consume(subscription.queue, (message) => {
      void this.dispatch(channel, subscription, message);
    });
  }

  private async dispatch(
    channel: Channel,
    subscription: Subscription,
    message: ConsumeMessage | null,
  ): Promise<void> {
    // null приходит при отмене consumer-а — обрабатывать нечего.
    if (message === null) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(message.content.toString('utf8')) as unknown;
    } catch {
      // Битый JSON не станет валидным при повторной доставке — подтверждаем и логируем.
      this.logger.error(
        `RabbitMQ: некорректный JSON в очереди ${subscription.queue} — сообщение отброшено`,
      );
      channel.ack(message);
      return;
    }

    try {
      await subscription.handler({
        queue: subscription.queue,
        routingKey: subscription.routingKey,
        payload,
      });
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        `RabbitMQ: ошибка обработки ${subscription.routingKey}: ${errorMessage(error)}`,
      );
      // Явная публикация в DLQ + ack: nack(requeue=false) без dead-letter-exchange
      // на очереди просто отбрасывает сообщение. Так событие сохраняется для разбора.
      try {
        channel.publish(EVENTS_EXCHANGE_DLQ, subscription.routingKey, message.content, {
          contentType: 'application/json',
          persistent: true,
        });
        channel.ack(message);
      } catch (publishError) {
        // Канал закрылся: сообщение останется unacked и вернётся после переподключения.
        this.logger.warn(
          `RabbitMQ: не удалось убрать ${subscription.routingKey} в DLQ: ${errorMessage(publishError)}`,
        );
      }
    }
  }
}

/** Имя DLQ рабочей очереди: `<queue>.dlq` (как у material-service). */
export function dlqName(queue: string): string {
  return `${queue}.dlq`;
}
