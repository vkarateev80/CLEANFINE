import { ConfigService } from '@nestjs/config';
import { EVENTS_EXCHANGE_DLQ, ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { AmqpConnectionService } from '../amqp/amqp-connection.service';
import { MaterialsConsumer, attemptsOf, parseEvent } from './materials.consumer';

/** Фейковый канал amqplib: assert/consume/publish/ack/nack — только то, что нужно. */
function createChannel() {
  return {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'tag-1' }),
    cancel: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockReturnValue(true),
    ack: jest.fn(),
    nack: jest.fn(),
  };
}

function createConfig(consumerEnabled = true): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'rabbitmq.consumerEnabled') return consumerEnabled;
      if (key === 'rabbitmq.reconnectCooldownMs') return 1000;
      return undefined;
    }),
  } as unknown as ConfigService;
}

/**
 * Мок AmqpConnectionService: помнит слушателей потери соединения, чтобы тест мог
 * «уронить» брокер ровно так же, как это делает настоящий сервис.
 */
type AmqpMock = AmqpConnectionService & {
  getChannel: jest.Mock;
  reset: jest.Mock;
  onChannelLost: jest.Mock;
  loseChannel: () => void;
};

function createAmqpMock(channel: unknown): AmqpMock {
  const listeners = new Set<() => void>();
  const mock = {
    getChannel: jest.fn().mockResolvedValue(channel ?? null),
    reset: jest.fn().mockResolvedValue(undefined),
    onChannelLost: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    loseChannel: () => {
      for (const listener of [...listeners]) listener();
    },
  };
  return mock as unknown as AmqpMock;
}

function createMessage(payload: unknown, headers: Record<string, unknown> = {}) {
  return {
    content: Buffer.from(JSON.stringify(payload), 'utf8'),
    properties: { headers },
    fields: { redelivered: false },
  } as unknown as import('amqplib').ConsumeMessage;
}

/** Сериализует пару «payload — функция-обработчик» из аргументов consume(). */
type ConsumeHandler = (message: import('amqplib').ConsumeMessage) => void;

describe('MaterialsConsumer (М4.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('объявляет очередь, DLQ и биндит routing key ticket.operation.completed', async () => {
    const channel = createChannel();
    const amqp = createAmqpMock(channel);
    const consumption = { handleOperationCompleted: jest.fn().mockResolvedValue({ status: 'consumed' }) };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);

    await expect(consumer.start()).resolves.toBe(true);

    expect(channel.assertExchange).toHaveBeenCalledWith(EVENTS_EXCHANGE_DLQ, 'topic', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('material.ticket.operation.completed', { durable: true });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'material.ticket.operation.completed',
      'cleaning-ops.events',
      ROUTING_KEYS.TICKET_OPERATION_COMPLETED,
    );
    expect(channel.assertQueue).toHaveBeenCalledWith('material.ticket.operation.completed.dlq', {
      durable: true,
    });
    expect(channel.consume).toHaveBeenCalledWith(
      'material.ticket.operation.completed',
      expect.any(Function),
      { noAck: false },
    );
    await consumer.stop();
    expect(channel.cancel).toHaveBeenCalledWith('tag-1');
  });

  it('если брокер недоступен — консьюмер не поднимается и не падает', async () => {
    const amqp = createAmqpMock(null);
    const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

    await expect(consumer.start()).resolves.toBe(false);
    await consumer.onModuleDestroy();
  });

  it('ошибка объявления очереди сбрасывает соединение и планирует retry', async () => {
    const channel = createChannel();
    channel.assertQueue.mockRejectedValue(new Error('channel closed'));
    const amqp = createAmqpMock(channel);
    const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

    await expect(consumer.start()).resolves.toBe(false);
    expect(amqp.reset).toHaveBeenCalled();
    await consumer.onModuleDestroy();
  });

  it('обрабатывает сообщение и подтверждает его (ack) после успеха', async () => {
    const channel = createChannel();
    const amqp = createAmqpMock(channel);
    const consumption = {
      handleOperationCompleted: jest.fn().mockResolvedValue({
        status: 'consumed',
        consumed: [],
        duplicates: [],
        failed: [],
      }),
    };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);
    await consumer.start();

    const handler = channel.consume.mock.calls[0][1] as ConsumeHandler;
    handler(createMessage({ operationId: 'op-1', ticketId: 't-1', objectId: 'obj-1' }));

    await new Promise((resolve) => setImmediate(resolve));

    expect(consumption.handleOperationCompleted).toHaveBeenCalledWith({
      operationId: 'op-1',
      ticketId: 't-1',
      objectId: 'obj-1',
      completedAt: expect.any(String),
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('битый payload подтверждается без обработки', async () => {
    const channel = createChannel();
    const amqp = createAmqpMock(channel);
    const consumption = { handleOperationCompleted: jest.fn() };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);
    await consumer.start();

    const handler = channel.consume.mock.calls[0][1] as ConsumeHandler;
    handler({ content: Buffer.from('не json', 'utf8') } as unknown as import('amqplib').ConsumeMessage);
    await new Promise((resolve) => setImmediate(resolve));

    expect(consumption.handleOperationCompleted).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('обработчик, который бросил, приводит к nack с requeue', async () => {
    const channel = createChannel();
    const amqp = createAmqpMock(channel);
    const consumption = {
      handleOperationCompleted: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);
    await consumer.start();

    const handler = channel.consume.mock.calls[0][1] as ConsumeHandler;
    handler(createMessage({ operationId: 'op-1', ticketId: 't-1', objectId: 'obj-1' }));
    await new Promise((resolve) => setImmediate(resolve));

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('после исчерпания попыток сообщение уходит в DLQ и подтверждается', async () => {
    const channel = createChannel();
    const amqp = createAmqpMock(channel);
    const consumption = {
      handleOperationCompleted: jest.fn().mockRejectedValue(new Error('всё ещё падает')),
    };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);
    await consumer.start();

    const message = createMessage(
      { operationId: 'op-1', ticketId: 't-1', objectId: 'obj-1' },
      { 'x-death': [{ count: 5 }] },
    );
    await consumer.process(message);

    expect(channel.publish).toHaveBeenCalledWith(
      EVENTS_EXCHANGE_DLQ,
      ROUTING_KEYS.TICKET_OPERATION_COMPLETED,
      message.content,
      { contentType: 'application/json', persistent: true },
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('MATERIAL_CONSUMER_ENABLED=false отключает подписку', async () => {
    const amqp = createAmqpMock(null);
    const consumer = new MaterialsConsumer(amqp, createConfig(false), {} as never);

    consumer.onModuleInit();

    expect(amqp.getChannel).not.toHaveBeenCalled();
    await consumer.onModuleDestroy();
  });

  it('process(null) и process без канала — no-op', async () => {
    const amqp = createAmqpMock(null);
    const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

    await expect(consumer.process(null)).resolves.toBeUndefined();
  });

  it('потеря соединения с RabbitMQ перерегистрирует консьюмер (М7.3)', async () => {
    jest.useFakeTimers();
    try {
      const channel = createChannel();
      const amqp = createAmqpMock(channel);
      const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

      consumer.onModuleInit();
      // Подписка на событие потери — до фактического старта (гонки быть не должно).
      expect(amqp.onChannelLost).toHaveBeenCalledTimes(1);
      // Дренаж микрозадач: start() объявляет очередь, DLQ и подписывается.
      await jest.advanceTimersByTimeAsync(0);
      expect(channel.consume).toHaveBeenCalledTimes(1);

      // Брокер ушёл (рестарт контейнера/разрыв сети): сервис оповещает консьюмеров.
      amqp.loseChannel();
      expect(channel.consume).toHaveBeenCalledTimes(1);

      // Через кулдаун консьюмер обязан подняться заново: без этого автосписание
      // молча встаёт, а события копятся в очереди (дефект М7.3 — 18 сообщений).
      await jest.advanceTimersByTimeAsync(1_000);
      expect(channel.consume).toHaveBeenCalledTimes(2);
      await consumer.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('nack по закрытому каналу не роняет обработчик', async () => {
    const channel = createChannel();
    channel.nack.mockImplementation(() => {
      throw new Error('Channel closed');
    });
    const amqp = createAmqpMock(channel);
    const consumption = {
      handleOperationCompleted: jest.fn().mockRejectedValue(new Error('склад недоступен')),
    };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);
    await consumer.start();

    await expect(consumer.process(createMessage({ operationId: 'op-1', ticketId: 't-1', objectId: 'o-1' })))
      .resolves.toBeUndefined();
  });

  it('сообщение подтверждается на канале доставки, даже если поле ещё пусто (М7.3)', async () => {
    // Накопленная очередь приходит в том же кадре сокета, что и consume-ok:
    // обработчик обязан ack-ать на канале из замыкания подписки. Иначе часть
    // событий остаётся unacked навсегда и автосписание по ним не выполняется.
    const channel = createChannel();
    const amqp = createAmqpMock(channel);
    const consumption = {
      handleOperationCompleted: jest.fn().mockResolvedValue({
        status: 'consumed',
        consumed: [],
        duplicates: [],
        failed: [],
      }),
    };
    const consumer = new MaterialsConsumer(amqp, createConfig(), consumption as never);
    await consumer.start();

    const handler = channel.consume.mock.calls[0][1] as ConsumeHandler;
    // Имитируем «доставку до присвоения поля»: поле пусто, канал есть только в замыкании.
    (consumer as unknown as { channel: unknown }).channel = null;
    const message = createMessage({ operationId: 'op-2', ticketId: 't-2', objectId: 'o-2' });
    handler(message);
    await new Promise((resolve) => setImmediate(resolve));

    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(consumption.handleOperationCompleted).toHaveBeenCalledTimes(1);
  });
});

describe('parseEvent / attemptsOf', () => {
  it('parseEvent принимает только полный контракт', () => {
    expect(parseEvent(Buffer.from(JSON.stringify({ operationId: 'op', ticketId: 't', objectId: 'o' })))).toEqual({
      operationId: 'op',
      ticketId: 't',
      objectId: 'o',
      completedAt: expect.any(String),
    });
    expect(parseEvent(Buffer.from(JSON.stringify({ operationId: 'op', ticketId: 't', objectId: 'o', completedAt: '2026-01-02T10:00:00.000Z' })))).toEqual({
      operationId: 'op',
      ticketId: 't',
      objectId: 'o',
      completedAt: '2026-01-02T10:00:00.000Z',
    });
    expect(parseEvent(Buffer.from('null'))).toBeNull();
    expect(parseEvent(Buffer.from('[1,2]'))).toBeNull();
    expect(parseEvent(Buffer.from(JSON.stringify({ operationId: 'op' })))).toBeNull();
    expect(parseEvent(Buffer.from(JSON.stringify({ operationId: '', ticketId: 't', objectId: 'o' })))).toBeNull();
    expect(parseEvent(Buffer.from(JSON.stringify({ operationId: 1, ticketId: 't', objectId: 'o' })))).toBeNull();
  });

  it('attemptsOf считает доставки по x-death, иначе по redelivered', () => {
    const base = { properties: { headers: {} }, fields: { redelivered: false } };
    expect(attemptsOf(base as never)).toBe(1);
    expect(attemptsOf({ properties: { headers: {} }, fields: { redelivered: true } } as never)).toBe(2);
    expect(attemptsOf({ properties: { headers: { 'x-death': [{ count: 2 }, { count: 3 }] } }, fields: {} } as never)).toBe(6);
  });
});
