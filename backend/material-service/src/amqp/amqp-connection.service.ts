import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { EVENTS_EXCHANGE } from '@cleaning-ops/shared/constants/events';

/** Типы amqplib через ReturnType: устойчиво к переименованиям в @types/amqplib. */
export type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
export type AmqpChannel = Awaited<ReturnType<AmqpConnection['createChannel']>>;

/** Разбор ошибки в строку для логов (Error | unknown). */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Хост брокера без пароля — в лог нельзя писать учётные данные из RABBITMQ_URL. */
export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'неизвестный хост';
  }
}

/**
 * Ленивое соединение с RabbitMQ: один канал на сервис, используемый и
 * публикацией (material.low), и консьюмером (ticket.operation.completed).
 *
 * Недоступность брокера НЕ роняет приложение и не тормозит HTTP: после неудачной
 * попытки включена пауза `reconnectCooldownMs`, поэтому следующая попытка не ждёт
 * таймаут сокета.
 *
 * Потеря УЖЕ установленного соединения — отдельный случай, и он опаснее первого:
 * канал становится мёртвым, а подписчик очереди (консьюмер) остаётся «зарегистрированным»
 * только в своей памяти. Поэтому сервис оповещает подписчиков через
 * `onChannelLost` — консьюмер обязан зарегистрироваться заново (см. `MaterialsConsumer`).
 */
@Injectable()
export class AmqpConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(AmqpConnectionService.name);

  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private connecting: Promise<AmqpChannel | null> | null = null;
  private nextAttemptAt = 0;
  /** Подписчики на потерю соединения/канала (консьюмеры обязаны перерегистрироваться). */
  private readonly channelLostListeners = new Set<() => void>();
  /** `reset()` закрывает канал сам — это не потеря соединения и не повод для повтора. */
  private closing = false;

  constructor(private readonly config: ConfigService) {}

  private get url(): string {
    return this.config.get<string>('rabbitmq.url') ?? 'amqp://localhost:5672';
  }

  private get timeoutMs(): number {
    return this.config.get<number>('rabbitmq.timeoutMs') ?? 5_000;
  }

  private get cooldownMs(): number {
    return this.config.get<number>('rabbitmq.reconnectCooldownMs') ?? 10_000;
  }

  /** Канал или null, если брокер недоступен. Никогда не бросает. */
  async getChannel(): Promise<AmqpChannel | null> {
    if (this.channel) {
      return this.channel;
    }
    if (Date.now() < this.nextAttemptAt) {
      return null;
    }
    if (!this.connecting) {
      this.connecting = this.connect();
    }
    try {
      return await this.connecting;
    } catch (error) {
      this.logger.warn(`RabbitMQ: не удалось получить канал — ${describeError(error)}`);
      return null;
    } finally {
      this.connecting = null;
    }
  }

  /**
   * Подписка на потерю соединения или канала. Возвращает функцию отписки.
   * Консьюмеры обязаны на это событие перерегистрироваться: иначе доставка
   * событий встаёт молча (в М7.3 так «зависла» очередь автосписания).
   */
  onChannelLost(listener: () => void): () => void {
    this.channelLostListeners.add(listener);
    return () => this.channelLostListeners.delete(listener);
  }

  /** Оповещает подписчиков; ошибка слушателя не должна ломать остальные. */
  private notifyChannelLost(reason: string): void {
    if (this.closing || this.channelLostListeners.size === 0) {
      return;
    }
    this.logger.warn(
      `RabbitMQ: ${reason} — оповещаю консьюмеров (${this.channelLostListeners.size})`,
    );
    for (const listener of this.channelLostListeners) {
      try {
        listener();
      } catch (error) {
        this.logger.warn(`RabbitMQ: слушатель потери соединения упал — ${describeError(error)}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }

  private async connect(): Promise<AmqpChannel | null> {
    const url = this.url;
    try {
      const connection = await amqp.connect(url, { timeout: this.timeoutMs });
      connection.on('error', (error: unknown) => {
        this.logger.warn(`Ошибка соединения с RabbitMQ: ${describeError(error)}`);
      });
      connection.on('close', () => {
        this.logger.warn('Соединение с RabbitMQ закрыто — переподключение при следующей попытке');
        this.channel = null;
        this.connection = null;
        this.notifyChannelLost('соединение закрыто');
      });

      const channel = await connection.createChannel();
      channel.on('close', () => {
        if (this.channel === channel) {
          this.channel = null;
        }
        this.notifyChannelLost('канал закрыт');
      });
      await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

      this.connection = connection;
      this.channel = channel;
      this.logger.log(`RabbitMQ подключён, exchange ${EVENTS_EXCHANGE} готов`);
      return channel;
    } catch (error) {
      this.nextAttemptAt = Date.now() + this.cooldownMs;
      this.logger.warn(
        `RabbitMQ недоступен (${safeHost(url)}): ${describeError(error)}. ` +
          `Следующая попытка не раньше чем через ${Math.round(this.cooldownMs / 1000)} с.`,
      );
      return null;
    }
  }

  /** Сбрасывает соединение (при ошибке канала/событии close). */
  async reset(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    this.connecting = null;
    // Собственное закрытие не считается потерей: слушателей не тревожим.
    this.closing = true;
    try {
      await channel?.close();
    } catch {
      /* канал уже закрыт брокером */
    }
    try {
      await connection?.close();
    } catch {
      /* соединение уже закрыто */
    } finally {
      this.closing = false;
    }
  }
}
