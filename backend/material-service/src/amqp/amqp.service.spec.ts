import { ConfigService } from '@nestjs/config';
import { EVENTS_EXCHANGE, ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

// Тот же мок-модуль, что и в сервисе подключения: connect подменён фабрикой выше.
import * as amqp from 'amqplib';
import {
  AmqpConnectionService,
  describeError,
  safeHost,
} from './amqp-connection.service';
import { EventsPublisher } from './events.publisher';

const connectMock = amqp.connect as unknown as jest.Mock;

function createConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'rabbitmq.url': 'amqp://admin:secret@localhost:5672',
        'rabbitmq.timeoutMs': 1000,
        'rabbitmq.reconnectCooldownMs': 10_000,
        ...overrides,
      };
      return values[key];
    }),
  } as unknown as ConfigService;
}

function createConnection() {
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const channelListeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    // Настоящий канал amqplib — EventEmitter, и сервис слушает его `close`.
    on: jest.fn((event: string, callback: (arg?: unknown) => void): void => {
      channelListeners[event] = channelListeners[event] ?? [];
      channelListeners[event].push(callback);
    }),
  };
  const connection = {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, callback: (arg?: unknown) => void): void => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(callback);
    }),
  };
  return { connection, channel, listeners, channelListeners };
}

describe('AmqpConnectionService (М4.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ленивое подключение: до первого обращения connect не вызывается', async () => {
    const { connection, channel } = createConnection();
    connectMock.mockResolvedValue(connection);
    const service = new AmqpConnectionService(createConfig());

    expect(connectMock).not.toHaveBeenCalled();
    await expect(service.getChannel()).resolves.toBe(channel);
    expect(connectMock).toHaveBeenCalledWith('amqp://admin:secret@localhost:5672', { timeout: 1000 });
    expect(channel.assertExchange).toHaveBeenCalledWith(EVENTS_EXCHANGE, 'topic', { durable: true });

    await service.onModuleDestroy();
  });

  it('повторные вызовы переиспользуют канал', async () => {
    const { connection } = createConnection();
    connectMock.mockResolvedValue(connection);
    const service = new AmqpConnectionService(createConfig());

    await service.getChannel();
    await service.getChannel();

    expect(connectMock).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('недоступный брокер → null и пауза до следующей попытки (cooldown)', async () => {
    connectMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new AmqpConnectionService(createConfig());

    await expect(service.getChannel()).resolves.toBeNull();
    // Вторая попытка сразу — без обращения к сети (брокер недавно был недоступен).
    await expect(service.getChannel()).resolves.toBeNull();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('параллельные вызовы используют одно соединение', async () => {
    const { connection, channel } = createConnection();
    connectMock.mockResolvedValue(connection);
    const service = new AmqpConnectionService(createConfig());

    const [a, b] = await Promise.all([service.getChannel(), service.getChannel()]);
    expect(a).toBe(channel);
    expect(b).toBe(channel);
    expect(connectMock).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('ошибки соединения и закрытие сбрасывают канал (переподключение позже)', async () => {
    const { connection, channel, listeners } = createConnection();
    connectMock.mockResolvedValue(connection);
    const service = new AmqpConnectionService(createConfig());

    await service.getChannel();
    listeners.error?.[0]?.(new Error('socket error'));
    listeners.close?.[0]?.();

    // Канал сброшен — следующее обращение соединяется заново.
    connectMock.mockResolvedValue(createConnection().connection);
    await service.getChannel();
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(channel.close).toBeDefined();
    await service.onModuleDestroy();
  });

  it('reset закрывает канал и соединение, глотая ошибки закрытия', async () => {
    const { connection, channel } = createConnection();
    channel.close.mockRejectedValue(new Error('already closed'));
    connection.close.mockRejectedValue(new Error('already closed'));
    connectMock.mockResolvedValue(connection);
    const service = new AmqpConnectionService(createConfig());

    await service.getChannel();
    await expect(service.reset()).resolves.toBeUndefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('закрытие соединения и канала оповещает подписчиков (М7.3)', async () => {
    const connection1 = createConnection();
    connectMock.mockResolvedValue(connection1.connection);
    const service = new AmqpConnectionService(createConfig());
    const onLost = jest.fn();
    service.onChannelLost(onLost);

    await service.getChannel();
    connection1.listeners.close?.[0]?.();
    expect(onLost).toHaveBeenCalledTimes(1);

    // Канал может закрыться и сам, без закрытия соединения.
    const connection2 = createConnection();
    connectMock.mockResolvedValue(connection2.connection);
    await service.getChannel();
    connection2.channelListeners.close?.[0]?.();
    expect(onLost).toHaveBeenCalledTimes(2);

    // Собственный reset() потерей не считается — иначе консьюмер устраивал бы
    // лишний цикл перерегистрации на каждом сбросе.
    await service.reset();
    expect(onLost).toHaveBeenCalledTimes(2);

    await service.onModuleDestroy();
  });
});

describe('EventsPublisher (М4.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('публикует material.low с persistent-флагом', async () => {
    const { connection, channel } = createConnection();
    connectMock.mockResolvedValue(connection);
    const amqpService = new AmqpConnectionService(createConfig());
    const publisher = new EventsPublisher(amqpService);

    const payload = { materialId: 'mat-1', quantity: 1, threshold: 5 };
    await expect(publisher.publish(ROUTING_KEYS.MATERIAL_LOW, payload)).resolves.toBe(true);

    expect(channel.publish).toHaveBeenCalledWith(
      EVENTS_EXCHANGE,
      'material.low',
      Buffer.from(JSON.stringify(payload), 'utf8'),
      { contentType: 'application/json', persistent: true },
    );
    await amqpService.onModuleDestroy();
  });

  it('недоступный брокер → false без исключения', async () => {
    connectMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const amqpService = new AmqpConnectionService(createConfig());
    const publisher = new EventsPublisher(amqpService);

    await expect(publisher.publish(ROUTING_KEYS.MATERIAL_LOW, {})).resolves.toBe(false);
  });

  it('ошибка publish сбрасывает соединение и возвращает false', async () => {
    const { connection, channel } = createConnection();
    channel.publish.mockImplementation(() => {
      throw new Error('channel closed');
    });
    connectMock.mockResolvedValue(connection);
    const amqpService = new AmqpConnectionService(createConfig());
    const resetSpy = jest.spyOn(amqpService, 'reset');
    const publisher = new EventsPublisher(amqpService);

    await expect(publisher.publish(ROUTING_KEYS.MATERIAL_LOW, null)).resolves.toBe(false);
    expect(resetSpy).toHaveBeenCalled();
  });
});

describe('утилиты логов', () => {
  it('describeError и safeHost не раскрывают учётные данные', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('boom')).toBe('boom');
    expect(safeHost('amqp://admin:secret@localhost:5672')).toBe('localhost:5672');
    expect(safeHost('не url')).toBe('неизвестный хост');
  });
});
