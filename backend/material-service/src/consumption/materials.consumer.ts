import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EVENT_QUEUES,
  EVENTS_EXCHANGE,
  EVENTS_EXCHANGE_DLQ,
  ROUTING_KEYS,
} from '@cleaning-ops/shared/constants/events';
import {
  AmqpChannel,
  AmqpConnectionService,
  describeError,
} from '../amqp/amqp-connection.service';
import {
  MaterialConsumptionService,
  TicketOperationCompletedEvent,
} from './material-consumption.service';

/** Событие мы обрабатываем сами — имя очереди зафиксировано в shared/constants/events.ts. */
export const CONSUMPTION_QUEUE = EVENT_QUEUES[ROUTING_KEYS.TICKET_OPERATION_COMPLETED];
export const CONSUMPTION_DLQ = `${CONSUMPTION_QUEUE}.dlq`;

/** Сколько раз переотправлять сообщение, прежде чем убрать в DLQ. */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Консьюмер `ticket.operation.completed` (М4.2).
 *
 * Устойчивость:
 *  - подключение ленивое и не блокирует старт: недоступный брокер даёт warning и
 *    повторные попытки с паузой (retry), приложение продолжает обслуживать HTTP;
 *  - ack только после успешной обработки; при ошибке — nack с requeue, а после
 *    MAX_ATTEMPTS доставок сообщение уходит в DLQ и подтверждается (без «ядовитого»
 *    цикла переотправок);
 *  - битый payload (не JSON / нет обязательных полей) подтверждается — вечно
 *    переотправлять его бессмысленно.
 */
@Injectable()
export class MaterialsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaterialsConsumer.name);

  private channel: AmqpChannel | null = null;
  private consumerTag: string | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly amqp: AmqpConnectionService,
    private readonly config: ConfigService,
    private readonly consumption: MaterialConsumptionService,
  ) {}

  onModuleInit(): void {
    if ((this.config.get<boolean>('rabbitmq.consumerEnabled') ?? true) === false) {
      this.logger.warn('Консьюмер автосписания отключён (MATERIAL_CONSUMER_ENABLED=false)');
      return;
    }
    // Потеря УЖЕ установленного соединения (рестарт брокера, разрыв сети) рвёт
    // подписку на очередь: `channel.consume` сам по себе не возобновляется, и
    // автосписание встаёт МОЛЧА. В М7.3 так и случилось: в очереди
    // material.ticket.operation.completed накопилось 18 необработанных событий,
    // при этом сервис отвечал 200 и в логе не было ни одной ошибки.
    this.amqp.onChannelLost(() => this.handleChannelLost());
    void this.start();
  }

  /** Реакция на потерю соединения: консьюмер регистрируется на очереди заново. */
  private handleChannelLost(): void {
    if (this.stopped) {
      return;
    }
    this.channel = null;
    this.consumerTag = null;
    this.logger.warn(
      `Потеря соединения с RabbitMQ — консьюмер ${CONSUMPTION_QUEUE} будет зарегистрирован заново`,
    );
    this.scheduleRetry();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    void this.stop();
  }

  /** Пытается поднять консьюмер; при неудаче планирует повтор. Никогда не бросает. */
  async start(): Promise<boolean> {
    try {
      const channel = await this.amqp.getChannel();
      if (!channel) {
        this.scheduleRetry();
        return false;
      }

      await channel.assertExchange(EVENTS_EXCHANGE_DLQ, 'topic', { durable: true });
      await channel.assertQueue(CONSUMPTION_QUEUE, { durable: true });
      await channel.bindQueue(CONSUMPTION_QUEUE, EVENTS_EXCHANGE, ROUTING_KEYS.TICKET_OPERATION_COMPLETED);
      await channel.assertQueue(CONSUMPTION_DLQ, { durable: true });
      await channel.bindQueue(CONSUMPTION_DLQ, EVENTS_EXCHANGE_DLQ, ROUTING_KEYS.TICKET_OPERATION_COMPLETED);

      // Канал запоминаем ДО подписки: доставка может начаться в том же кадре
      // сокета, что и consume-ok (так приходит накопленная очередь после
      // переподключения), и обработчик обязан видеть живой канал.
      this.channel = channel;

      const handle = await channel.consume(
        CONSUMPTION_QUEUE,
        (message) => {
          // Канал передаём из замыкания, а не берём из поля: сообщение должно
          // подтверждаться на ТОМ канале, который его доставил, — иначе часть
          // накопленной очереди остаётся unacked навсегда (дефект М7.3: 9 событий
          // висели неподтверждёнными, автосписание по ним не выполнялось).
          void this.process(message, channel);
        },
        { noAck: false },
      );

      this.consumerTag = handle.consumerTag;
      this.logger.log(
        `Консьюмер автосписания слушает ${CONSUMPTION_QUEUE} ` +
          `(routing key ${ROUTING_KEYS.TICKET_OPERATION_COMPLETED})`,
      );
      return true;
    } catch (error) {
      this.logger.warn(`Не удалось поднять консьюмер ${CONSUMPTION_QUEUE}: ${describeError(error)}`);
      await this.amqp.reset();
      this.channel = null;
      this.scheduleRetry();
      return false;
    }
  }

  async stop(): Promise<void> {
    const channel = this.channel;
    const tag = this.consumerTag;
    this.channel = null;
    this.consumerTag = null;
    if (channel && tag) {
      try {
        await channel.cancel(tag);
      } catch {
        /* канал уже закрыт брокером */
      }
    }
  }

  /**
   * Обработка одного сообщения: ack/nack + DLQ после исчерпания попыток.
   *
   * `deliveredOn` — канал, на котором сообщение пришло (из замыкания подписки).
   * Без него сообщения, доставленные раньше присвоения `this.channel`, молча
   * оставались бы неподтверждёнными.
   */
  async process(
    message: import('amqplib').ConsumeMessage | null,
    deliveredOn: AmqpChannel | null = this.channel,
  ): Promise<void> {
    if (!message) {
      return;
    }
    const channel = deliveredOn;
    if (!channel) {
      return;
    }

    const event = parseEvent(message.content);
    if (!event) {
      this.logger.warn(
        `Сообщение ${CONSUMPTION_QUEUE} не соответствует контракту ticket.operation.completed — пропуск`,
      );
      channel.ack(message);
      return;
    }

    try {
      const result = await this.consumption.handleOperationCompleted(event);
      this.logger.log(
        `Обработана операция ${event.operationId}: ${result.status} ` +
          `(списано ${result.consumed.length}, повтор ${result.duplicates.length}, ошибок ${result.failed.length})`,
      );
      this.ackSafely(channel, message);
    } catch (error) {
      if (attemptsOf(message) >= this.maxAttempts) {
        this.logger.error(
          `Операция ${event.operationId}: после ${this.maxAttempts} попыток — в ${CONSUMPTION_DLQ}: ` +
            describeError(error),
        );
        channel.publish(
          EVENTS_EXCHANGE_DLQ,
          ROUTING_KEYS.TICKET_OPERATION_COMPLETED,
          message.content,
          { contentType: 'application/json', persistent: true },
        );
        this.ackSafely(channel, message);
        return;
      }
      this.logger.warn(
        `Операция ${event.operationId}: ошибка обработки — повторная доставка: ${describeError(error)}`,
      );
      try {
        channel.nack(message, false, true);
      } catch (nackError) {
        // Канал успел закрыться: сообщение останется неподтверждённым и вернётся
        // брокером после переподключения — терять его нельзя, но и падать некуда.
        this.logger.warn(
          `Операция ${event.operationId}: nack не доставлен (${describeError(nackError)}) — ` +
            'сообщение вернётся после переподключения',
        );
      }
    }
  }

  /** ack, который не роняет обработчик при уже закрытом канале. */
  private ackSafely(channel: AmqpChannel, message: import('amqplib').ConsumeMessage): void {
    try {
      channel.ack(message);
    } catch (error) {
      this.logger.warn(
        `ack не доставлен (${describeError(error)}) — счётчик доставок учтёт брокер`,
      );
    }
  }

  private get maxAttempts(): number {
    const configured = Number(process.env.MATERIAL_CONSUMER_MAX_ATTEMPTS);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_ATTEMPTS;
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) {
      return;
    }
    const cooldown = this.config.get<number>('rabbitmq.reconnectCooldownMs') ?? 10_000;
    this.logger.warn(`Повтор подключения консьюмера через ${Math.round(cooldown / 1000)} с`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.start();
    }, cooldown);
    this.retryTimer.unref?.();
  }
}

/** Разбирает payload; null — сообщение не соответствует контракту. */
export function parseEvent(content: Buffer): TicketOperationCompletedEvent | null {
  try {
    const parsed: unknown = JSON.parse(content.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    const operationId = candidate.operationId;
    const ticketId = candidate.ticketId;
    const objectId = candidate.objectId;
    if (
      typeof operationId !== 'string' ||
      typeof ticketId !== 'string' ||
      typeof objectId !== 'string' ||
      operationId === '' ||
      ticketId === '' ||
      objectId === ''
    ) {
      return null;
    }
    return {
      operationId,
      ticketId,
      objectId,
      completedAt:
        typeof candidate.completedAt === 'string'
          ? candidate.completedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Сколько доставок сообщение уже пережило (x-death от RabbitMQ). */
export function attemptsOf(message: import('amqplib').ConsumeMessage): number {
  const deaths = message.properties?.headers?.['x-death'];
  if (!Array.isArray(deaths)) {
    return message.fields?.redelivered ? 2 : 1;
  }
  return deaths.reduce((total, entry) => {
    const count = (entry as { count?: number })?.count;
    return total + (typeof count === 'number' ? count : 0);
  }, 1);
}
