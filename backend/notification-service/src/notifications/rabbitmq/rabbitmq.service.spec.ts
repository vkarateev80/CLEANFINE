import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';
import type { ConsumeMessage } from 'amqplib';
import { DEFAULT_RABBITMQ_URL } from '../../config/configuration';
import { RabbitmqService } from './rabbitmq.service';

/**
 * RabbitMQ в unit-тестах мокается целиком (требование М3.3): проверяем нашу
 * логику — ретраи, подписки, ack/nack — без брокера.
 */
jest.mock('amqplib', () => ({ connect: jest.fn() }));

const connectMock = connect as unknown as jest.Mock;

interface FakeChannel {
  prefetch: jest.Mock;
  assertExchange: jest.Mock;
  assertQueue: jest.Mock;
  bindQueue: jest.Mock;
  consume: jest.Mock;
  ack: jest.Mock;
  nack: jest.Mock;
  publish: jest.Mock;
  close: jest.Mock;
  on: jest.Mock;
}

function createChannel(): FakeChannel {
  return {
    prefetch: jest.fn().mockResolvedValue({}),
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'tag' }),
    ack: jest.fn(),
    nack: jest.fn(),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
}

interface FakeConnection {
  createChannel: jest.Mock;
  close: jest.Mock;
  on: jest.Mock;
}

function createConnection(channel: FakeChannel): FakeConnection {
  return {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
}

function configWith(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function defaultConfig(): ConfigService {
  return configWith({
    'rabbitmq.enabled': true,
    'rabbitmq.url': 'amqp://test:5672',
    'rabbitmq.prefetch': 5,
    'rabbitmq.reconnectBaseMs': 1_000,
  });
}

/**
 * Даёт промис-цепочкам подключения завершиться.
 * Только микротаски: под фейковыми таймерами setImmediate/setTimeout заморожены.
 */
async function flush(times = 25): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function listenerOf(target: { on: jest.Mock }, event: string): (...args: unknown[]) => void {
  const call = target.on.mock.calls.find(([name]) => name === event);
  if (call === undefined) {
    throw new Error(`Обработчик ${event} не зарегистрирован`);
  }
  return call[1] as (...args: unknown[]) => void;
}

function consumeCallback(channel: FakeChannel): (message: ConsumeMessage | null) => void {
  return channel.consume.mock.calls[0][1] as (message: ConsumeMessage | null) => void;
}

function amqpMessage(body: string): ConsumeMessage {
  return { content: Buffer.from(body, 'utf8') } as ConsumeMessage;
}

describe('RabbitmqService', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    connectMock.mockReset();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('не подключается, если консьюмер выключен конфигом', async () => {
    const service = new RabbitmqService(configWith({ 'rabbitmq.enabled': false }));

    service.onModuleInit();
    await flush();

    expect(connectMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('отключён'));
  });

  it('подключается, настраивает prefetch, exchange и ранее зарегистрированные подписки', async () => {
    const channel = createChannel();
    const connection = createConnection(channel);
    connectMock.mockResolvedValue(connection);
    const service = new RabbitmqService(defaultConfig());
    const handler = jest.fn().mockResolvedValue(undefined);

    // Подписка до подключения: bind должен произойти после установки канала.
    service.subscribe('notification.ticket.created', 'ticket.created', handler);
    service.onModuleInit();
    await flush();

    expect(connectMock).toHaveBeenCalledWith('amqp://test:5672');
    expect(channel.prefetch).toHaveBeenCalledWith(5);
    expect(channel.assertExchange).toHaveBeenCalledWith('cleaning-ops.events', 'topic', {
      durable: true,
    });
    expect(channel.assertExchange).toHaveBeenCalledWith('cleaning-ops.events.dlq', 'topic', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('notification.ticket.created', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('notification.ticket.created.dlq', {
      durable: true,
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'notification.ticket.created',
      'cleaning-ops.events',
      'ticket.created',
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'notification.ticket.created.dlq',
      'cleaning-ops.events.dlq',
      'ticket.created',
    );
    expect(channel.consume).toHaveBeenCalledWith(
      'notification.ticket.created',
      expect.any(Function),
    );
    expect(service.subscribedQueues).toEqual(['notification.ticket.created']);
  });

  it('подписка после подключения биндится сразу', async () => {
    const channel = createChannel();
    connectMock.mockResolvedValue(createConnection(channel));
    const service = new RabbitmqService(defaultConfig());

    service.onModuleInit();
    await flush();
    service.subscribe('notification.geofence.exit', 'geofence.exit', jest.fn());
    await flush();

    expect(channel.assertQueue).toHaveBeenCalledWith('notification.geofence.exit', {
      durable: true,
    });
  });

  it('повторная подписка на ту же очередь игнорируется', async () => {
    const service = new RabbitmqService(defaultConfig());

    service.subscribe('notification.ticket.created', 'ticket.created', jest.fn());
    service.subscribe('notification.ticket.created', 'ticket.created', jest.fn());

    // Иначе два consumer-а на одной очереди делили бы сообщения между собой.
    expect(service.subscribedQueues).toEqual(['notification.ticket.created']);
  });

  it('использует дефолты, если конфиг пуст', async () => {
    const channel = createChannel();
    connectMock.mockResolvedValue(createConnection(channel));
    const service = new RabbitmqService(configWith({ 'rabbitmq.enabled': true }));

    service.onModuleInit();
    await flush();

    expect(connectMock).toHaveBeenCalledWith(DEFAULT_RABBITMQ_URL);
    expect(channel.prefetch).toHaveBeenCalledWith(10);
  });

  it('ошибка bind при поздней подписке не роняет сервис', async () => {
    const channel = createChannel();
    channel.assertQueue.mockRejectedValue(new Error('PRECONDITION_FAILED'));
    connectMock.mockResolvedValue(createConnection(channel));
    const service = new RabbitmqService(defaultConfig());

    service.onModuleInit();
    await flush();
    service.subscribe('notification.material.low', 'material.low', jest.fn());
    await flush();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('не удалось подписаться'));
  });

  describe('ретраи при недоступном брокере', () => {
    it('не роняет приложение и повторяет подключение с backoff', async () => {
      jest.useFakeTimers();
      connectMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new RabbitmqService(defaultConfig());

      // Требование М3.3: сервис поднимается независимо от RabbitMQ.
      expect(() => service.onModuleInit()).not.toThrow();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('RabbitMQ недоступен'));

      jest.advanceTimersByTime(1_000);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(2);

      // Вторая задержка — 2000 мс: до её истечения повтора нет.
      jest.advanceTimersByTime(1_500);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(500);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(3);
    });

    it('переподключается после разрыва соединения', async () => {
      jest.useFakeTimers();
      const channel = createChannel();
      const connection = createConnection(channel);
      connectMock.mockResolvedValueOnce(connection).mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new RabbitmqService(defaultConfig());

      service.onModuleInit();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);

      // Брокер разорвал соединение — сервис должен переподключиться сам.
      listenerOf(connection, 'close')();
      jest.advanceTimersByTime(1_000);
      await flush();

      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('переподключение'));
    });

    it('успешное подключение сбрасывает счётчик попыток', async () => {
      jest.useFakeTimers();
      const channel = createChannel();
      const connection = createConnection(channel);
      connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(connection);
      const service = new RabbitmqService(defaultConfig());

      service.onModuleInit();
      await flush();
      jest.advanceTimersByTime(1_000);
      await flush();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('RabbitMQ подключён'));

      // После успеха разрыв снова даёт базовую задержку, а не удвоенную.
      listenerOf(connection, 'close')();
      await flush();
      jest.advanceTimersByTime(1_000);
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('обработка сообщений', () => {
    async function connected(): Promise<{
      service: RabbitmqService;
      channel: FakeChannel;
      connection: FakeConnection;
      handler: jest.Mock;
    }> {
      const channel = createChannel();
      const connection = createConnection(channel);
      connectMock.mockResolvedValue(connection);
      const service = new RabbitmqService(defaultConfig());
      const handler = jest.fn().mockResolvedValue(undefined);
      service.subscribe('notification.ticket.created', 'ticket.created', handler);
      service.onModuleInit();
      await flush();
      return { service, channel, connection, handler };
    }

    it('вызывает обработчик с routing key и распарсенным payload, затем ack', async () => {
      const { channel, handler } = await connected();

      consumeCallback(channel)(amqpMessage('{"ticketId":"t-1"}'));

      expect(handler).toHaveBeenCalledWith({
        queue: 'notification.ticket.created',
        routingKey: 'ticket.created',
        payload: { ticketId: 't-1' },
      });
      await flush();
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('битый JSON подтверждается и отбрасывается (без вечного requeue)', async () => {
      const { channel, handler } = await connected();

      consumeCallback(channel)(amqpMessage('{не json'));

      expect(handler).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('некорректный JSON'));
    });

    it('ошибка обработчика → публикация в DLQ и ack (сообщение не теряется)', async () => {
      const { channel, handler } = await connected();
      handler.mockRejectedValue(new Error('упало'));

      consumeCallback(channel)(amqpMessage('{"ticketId":"t-1"}'));
      await flush();

      expect(channel.publish).toHaveBeenCalledWith(
        'cleaning-ops.events.dlq',
        'ticket.created',
        expect.anything(),
        expect.objectContaining({ persistent: true }),
      );
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('null-сообщение (отмена consumer-а) игнорируется', async () => {
      const { channel } = await connected();

      consumeCallback(channel)(null);

      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('ошибки соединения и канала логируются, а не бросаются', async () => {
      const { channel, connection } = await connected();

      listenerOf(connection, 'error')(new Error('socket hang up'));
      listenerOf(channel, 'error')(new Error('channel error'));

      expect(error).toHaveBeenCalledWith(expect.stringContaining('ошибка соединения'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('ошибка канала'));
    });
  });

  describe('остановка сервиса', () => {
    it('закрывает канал и соединение', async () => {
      const channel = createChannel();
      const connection = createConnection(channel);
      connectMock.mockResolvedValue(connection);
      const service = new RabbitmqService(defaultConfig());
      service.onModuleInit();
      await flush();

      await service.onModuleDestroy();

      expect(channel.close).toHaveBeenCalledTimes(1);
      expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('гасит запланированный ретрай и не переподключается после остановки', async () => {
      jest.useFakeTimers();
      connectMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new RabbitmqService(defaultConfig());
      service.onModuleInit();
      await flush();
      expect(connectMock).toHaveBeenCalledTimes(1);

      await service.onModuleDestroy();
      jest.advanceTimersByTime(60_000);
      await flush();

      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it('не падает, если соединение уже закрыто извне', async () => {
      const channel = createChannel();
      const connection = createConnection(channel);
      channel.close.mockRejectedValue(new Error('already closed'));
      connection.close.mockRejectedValue(new Error('already closed'));
      connectMock.mockResolvedValue(connection);
      const service = new RabbitmqService(defaultConfig());
      service.onModuleInit();
      await flush();

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('после остановки разрыв соединения не запускает ретрай', async () => {
      const channel = createChannel();
      const connection = createConnection(channel);
      connectMock.mockResolvedValue(connection);
      const service = new RabbitmqService(defaultConfig());
      service.onModuleInit();
      await flush();

      const onClose = listenerOf(connection, 'close');
      await service.onModuleDestroy();
      onClose();

      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it('остановка без активного соединения безопасна', async () => {
      const service = new RabbitmqService(configWith({ 'rabbitmq.enabled': false }));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
