import { ConfigService } from '@nestjs/config';
import { RabbitMqService } from './rabbitmq.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

import * as amqp from 'amqplib';

const connectMock = amqp.connect as unknown as jest.Mock;

interface ChannelMock {
  publish: jest.Mock;
  assertExchange: jest.Mock;
  close: jest.Mock;
}

interface ConnectionMock {
  createChannel: jest.Mock;
  close: jest.Mock;
  on: jest.Mock;
  emit: (event: string, payload?: unknown) => void;
}

function makeChannel(): ChannelMock {
  return {
    publish: jest.fn().mockReturnValue(true),
    assertExchange: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeConnection(channel: ChannelMock): ConnectionMock {
  const handlers = new Map<string, (payload?: unknown) => void>();
  return {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: (event, payload) => handlers.get(event)?.(payload),
  };
}

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'rabbitmq.url': 'amqp://admin:secret@localhost:5672',
    'rabbitmq.exchange': 'cleaning-ops.events',
    'rabbitmq.enabled': true,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('RabbitMqService (gps-service)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('публикует событие в общий topic-exchange с JSON-телом', async () => {
    const channel = makeChannel();
    const connection = makeConnection(channel);
    connectMock.mockResolvedValue(connection);
    const service = new RabbitMqService(makeConfig());

    const published = await service.publish('geofence.exit', { userId: 'u1' });

    expect(published).toBe(true);
    expect(channel.assertExchange).toHaveBeenCalledWith('cleaning-ops.events', 'topic', {
      durable: true,
    });
    expect(channel.publish).toHaveBeenCalledWith(
      'cleaning-ops.events',
      'geofence.exit',
      Buffer.from(JSON.stringify({ userId: 'u1' })),
      expect.objectContaining({ contentType: 'application/json', persistent: true }),
    );
  });

  it('переиспользует соединение между публикациями (подключение ленивое)', async () => {
    const channel = makeChannel();
    connectMock.mockResolvedValue(makeConnection(channel));
    const service = new RabbitMqService(makeConfig());

    await service.publish('geofence.exit', { n: 1 });
    await service.publish('geofence.exit', { n: 2 });

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(channel.publish).toHaveBeenCalledTimes(2);
  });

  it('параллельные публикации ждут одну попытку подключения', async () => {
    let resolveConnect: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveConnect = resolve;
    });
    connectMock.mockReturnValue(pending);
    const channel = makeChannel();
    const service = new RabbitMqService(makeConfig());

    const first = service.publish('geofence.exit', { n: 1 });
    const second = service.publish('geofence.exit', { n: 2 });
    resolveConnect(makeConnection(channel));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('backpressure канала (publish=false) не считается ошибкой', async () => {
    const channel = makeChannel();
    channel.publish.mockReturnValue(false);
    connectMock.mockResolvedValue(makeConnection(channel));
    const service = new RabbitMqService(makeConfig());

    await expect(service.publish('geofence.exit', {})).resolves.toBe(true);
  });

  it('ошибка publish → false и переподключение на следующей попытке', async () => {
    const channel = makeChannel();
    channel.publish.mockImplementationOnce(() => {
      throw new Error('channel closed');
    });
    connectMock.mockResolvedValue(makeConnection(channel));
    const service = new RabbitMqService(makeConfig());

    await expect(service.publish('geofence.exit', {})).resolves.toBe(false);
    await expect(service.publish('geofence.exit', {})).resolves.toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('не-Error исключение в publish обрабатывается как строка', async () => {
    const channel = makeChannel();
    channel.publish.mockImplementationOnce(() => {
      throw 'boom';
    });
    connectMock.mockResolvedValue(makeConnection(channel));
    const service = new RabbitMqService(makeConfig());

    await expect(service.publish('geofence.exit', {})).resolves.toBe(false);
  });

  it('недоступный брокер → false, исключение не пробрасывается', async () => {
    connectMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new RabbitMqService(makeConfig());

    await expect(service.publish('geofence.exit', {})).resolves.toBe(false);
  });

  it('без RABBITMQ_URL события не публикуются и соединение не открывается', async () => {
    const service = new RabbitMqService(makeConfig({ 'rabbitmq.url': '' }));

    await expect(service.publish('geofence.exit', {})).resolves.toBe(false);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('RABBITMQ_ENABLED=false выключает публикацию', async () => {
    const service = new RabbitMqService(makeConfig({ 'rabbitmq.enabled': false }));

    await expect(service.publish('geofence.exit', {})).resolves.toBe(false);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('использует exchange cleaning-ops.events, если конфиг его не задаёт', async () => {
    const channel = makeChannel();
    connectMock.mockResolvedValue(makeConnection(channel));
    const service = new RabbitMqService(
      makeConfig({ 'rabbitmq.exchange': undefined, 'rabbitmq.enabled': undefined }),
    );

    await expect(service.publish('geofence.exit', {})).resolves.toBe(true);
    expect(channel.assertExchange).toHaveBeenCalledWith('cleaning-ops.events', 'topic', {
      durable: true,
    });
  });

  it('пустой конфиг трактует публикацию как включённую, но без url не подключается', async () => {
    const service = new RabbitMqService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    await expect(service.publish('geofence.exit', {})).resolves.toBe(false);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('закрытие соединения брокером сбрасывает канал', async () => {
    const channel = makeChannel();
    const connection = makeConnection(channel);
    connectMock.mockResolvedValue(connection);
    const service = new RabbitMqService(makeConfig());

    await service.publish('geofence.exit', {});
    connection.emit('close');
    await service.publish('geofence.exit', {});
    connection.emit('error', new Error('socket hang up'));

    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('закрывает канал и соединение при остановке сервиса', async () => {
    const channel = makeChannel();
    const connection = makeConnection(channel);
    connectMock.mockResolvedValue(connection);
    const service = new RabbitMqService(makeConfig());

    await service.publish('geofence.exit', {});
    await service.onModuleDestroy();

    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('остановка без активного соединения не падает', async () => {
    const service = new RabbitMqService(makeConfig());

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('ошибки закрытия канала и соединения глушатся', async () => {
    const channel = makeChannel();
    channel.close.mockRejectedValue(new Error('already closed'));
    const connection = makeConnection(channel);
    connection.close.mockRejectedValue('nope');
    connectMock.mockResolvedValue(connection);
    const service = new RabbitMqService(makeConfig());

    await service.publish('geofence.exit', {});
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
