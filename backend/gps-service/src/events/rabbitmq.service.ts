import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>;

/**
 * Транспорт RabbitMQ (amqplib) для gps-service.
 *
 * Требования надёжности: подключение ленивое (первая публикация), брокер может быть
 * недоступен — в этом случае событие теряется с warning'ом, но HTTP-запрос приёма
 * треков не падает (треки важнее уведомления о выходе из геозоны).
 */
@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private connecting: Promise<AmqpChannel | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Публикация события в общий exchange (cleaning-ops.events). */
  async publish(routingKey: string, payload: unknown): Promise<boolean> {
    const channel = await this.getChannel();
    if (!channel) {
      return false;
    }
    try {
      const body = Buffer.from(JSON.stringify(payload));
      const flushed = channel.publish(this.exchange, routingKey, body, {
        contentType: 'application/json',
        persistent: true,
        timestamp: Date.now(),
      });
      if (!flushed) {
        // false — только backpressure буфера канала: сообщение уже принято клиентом.
        this.logger.warn(`Канал RabbitMQ переполнен, событие ${routingKey} буферизовано`);
      }
      return true;
    } catch (error) {
      this.logger.warn(`Не удалось опубликовать ${routingKey}: ${describe(error)}`);
      this.reset();
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    try {
      await channel?.close();
    } catch (error) {
      this.logger.warn(`Ошибка закрытия канала RabbitMQ: ${describe(error)}`);
    }
    try {
      await connection?.close();
    } catch (error) {
      this.logger.warn(`Ошибка закрытия соединения RabbitMQ: ${describe(error)}`);
    }
  }

  private get exchange(): string {
    return this.config.get<string>('rabbitmq.exchange') ?? 'cleaning-ops.events';
  }

  private get enabled(): boolean {
    return this.config.get<boolean>('rabbitmq.enabled') ?? true;
  }

  private get url(): string {
    return this.config.get<string>('rabbitmq.url') ?? '';
  }

  private async getChannel(): Promise<AmqpChannel | null> {
    if (this.channel) {
      return this.channel;
    }
    if (!this.connecting) {
      // Параллельные публикации ждут одну попытку подключения, а не открывают N соединений.
      this.connecting = this.connect().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async connect(): Promise<AmqpChannel | null> {
    if (!this.enabled) {
      this.logger.warn('RabbitMQ отключён (RABBITMQ_ENABLED=false) — события не публикуются');
      return null;
    }
    const url = this.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL не задан — события не публикуются');
      return null;
    }
    try {
      const connection = await amqp.connect(url);
      connection.on('error', (error: unknown) => {
        this.logger.warn(`Ошибка соединения RabbitMQ: ${describe(error)}`);
      });
      connection.on('close', () => {
        this.connection = null;
        this.channel = null;
      });
      const channel = await connection.createChannel();
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      this.connection = connection;
      this.channel = channel;
      this.logger.log(`RabbitMQ подключён, exchange ${this.exchange}`);
      return channel;
    } catch (error) {
      this.logger.warn(
        `RabbitMQ недоступен (${describe(error)}) — событие потеряно, запрос продолжен`,
      );
      return null;
    }
  }

  private reset(): void {
    this.channel = null;
    this.connection = null;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
