import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EVENTS_EXCHANGE, type RoutingKey } from '@cleaning-ops/shared/constants/events';

/** Типы amqplib через ReturnType: устойчиво к переименованиям в @types/amqplib. */
type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>;

/** Пауза между попытками подключиться к брокеру, чтобы не тормозить HTTP-запросы. */
const RECONNECT_COOLDOWN_MS = 10_000;

/**
 * Публикация доменных событий в RabbitMQ (exchange cleaning-ops.events, topic).
 *
 * Требования М3.4–М3.6:
 *  - подключение ленивое: брокер поднимается вместе с сервисом, но не блокирует старт;
 *  - недоступность брокера НЕ роняет HTTP-запрос: publish() возвращает false и пишет warning;
 *  - после неудачной попытки подключения — пауза (RECONNECT_COOLDOWN_MS), иначе каждый
 *    запрос ждал бы таймаут сокета;
 *  - события публикуются с persistent: true и contentType application/json.
 *
 * В unit-тестах модуль amqplib мокается (см. events.publisher.spec.ts).
 */
@Injectable()
export class EventsPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(EventsPublisher.name);

  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private connecting: Promise<AmqpChannel | null> | null = null;
  private nextAttemptAt = 0;

  constructor(private readonly config: ConfigService) {}

  /** Публикует событие. Никогда не бросает: недоступность брокера — только warning. */
  async publish(routingKey: RoutingKey, payload: unknown): Promise<boolean> {
    try {
      const channel = await this.getChannel();
      if (!channel) {
        return false;
      }
      const body = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
      const sent = channel.publish(EVENTS_EXCHANGE, routingKey, body, {
        contentType: 'application/json',
        persistent: true,
      });
      this.logger.log(`Событие ${routingKey} → ${EVENTS_EXCHANGE}`);
      return sent;
    } catch (error) {
      this.logger.warn(
        `Не удалось опубликовать ${routingKey}: ${describe(error)}. ` +
          'HTTP-запрос продолжается, событие потеряно до переподключения.',
      );
      await this.reset();
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }

  private async getChannel(): Promise<AmqpChannel | null> {
    if (this.channel) {
      return this.channel;
    }
    if (Date.now() < this.nextAttemptAt) {
      // Брокер недавно был недоступен — не ждём таймаут на каждом запросе.
      return null;
    }
    if (!this.connecting) {
      this.connecting = this.connect();
    }
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<AmqpChannel | null> {
    const url = this.config.get<string>('rabbitmq.url') ?? 'amqp://localhost:5672';
    const timeout = this.config.get<number>('rabbitmq.timeoutMs') ?? 5_000;
    try {
      const connection = await amqp.connect(url, { timeout });
      connection.on('error', (error: unknown) => {
        this.logger.warn(`Ошибка соединения с RabbitMQ: ${describe(error)}`);
      });
      connection.on('close', () => {
        this.logger.warn('Соединение с RabbitMQ закрыто — переподключение при следующем событии');
        this.channel = null;
        this.connection = null;
      });

      const channel = await connection.createChannel();
      await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

      this.connection = connection;
      this.channel = channel;
      this.logger.log(`RabbitMQ подключён, exchange ${EVENTS_EXCHANGE} готов`);
      return channel;
    } catch (error) {
      this.nextAttemptAt = Date.now() + RECONNECT_COOLDOWN_MS;
      this.logger.warn(
        `RabbitMQ недоступен (${safeHost(url)}): ${describe(error)}. ` +
          `Следующая попытка не раньше чем через ${RECONNECT_COOLDOWN_MS / 1000} с.`,
      );
      return null;
    }
  }

  /** Закрывает канал/соединение; ошибки закрытия не важны для вызывающего кода. */
  private async reset(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    this.connecting = null;
    try {
      await channel?.close();
    } catch {
      /* канал уже закрыт брокером */
    }
    try {
      await connection?.close();
    } catch {
      /* соединение уже закрыто брокером */
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Хост брокера без пароля — в лог нельзя писать учётные данные из RABBITMQ_URL. */
function safeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return 'неизвестный хост';
  }
}
