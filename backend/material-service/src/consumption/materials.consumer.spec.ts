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
    const amqp = { getChannel: jest.fn().mockResolvedValue(channel), reset: jest.fn() } as unknown as AmqpConnectionService;
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
    const amqp = { getChannel: jest.fn().mockResolvedValue(null), reset: jest.fn() } as unknown as AmqpConnectionService;
    const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

    await expect(consumer.start()).resolves.toBe(false);
    await consumer.onModuleDestroy();
  });

  it('ошибка объявления очереди сбрасывает соединение и планирует retry', async () => {
    const channel = createChannel();
    channel.assertQueue.mockRejectedValue(new Error('channel closed'));
    const amqp = { getChannel: jest.fn().mockResolvedValue(channel), reset: jest.fn() } as unknown as AmqpConnectionService;
    const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

    await expect(consumer.start()).resolves.toBe(false);
    expect(amqp.reset).toHaveBeenCalled();
    await consumer.onModuleDestroy();
  });

  it('обрабатывает сообщение и подтверждает его (ack) после успеха', async () => {
    const channel = createChannel();
    const amqp = { getChannel: jest.fn().mockResolvedValue(channel), reset: jest.fn() } as unknown as AmqpConnectionService;
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
    const amqp = { getChannel: jest.fn().mockResolvedValue(channel), reset: jest.fn() } as unknown as AmqpConnectionService;
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
    const amqp = { getChannel: jest.fn().mockResolvedValue(channel), reset: jest.fn() } as unknown as AmqpConnectionService;
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
    const amqp = { getChannel: jest.fn().mockResolvedValue(channel), reset: jest.fn() } as unknown as AmqpConnectionService;
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
    const amqp = { getChannel: jest.fn(), reset: jest.fn() } as unknown as AmqpConnectionService;
    const consumer = new MaterialsConsumer(amqp, createConfig(false), {} as never);

    consumer.onModuleInit();

    expect(amqp.getChannel).not.toHaveBeenCalled();
    await consumer.onModuleDestroy();
  });

  it('process(null) и process без канала — no-op', async () => {
    const amqp = { getChannel: jest.fn().mockResolvedValue(null), reset: jest.fn() } as unknown as AmqpConnectionService;
    const consumer = new MaterialsConsumer(amqp, createConfig(), {} as never);

    await expect(consumer.process(null)).resolves.toBeUndefined();
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
