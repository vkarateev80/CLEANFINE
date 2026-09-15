import { ConfigService } from '@nestjs/config';
import { ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { EventsPublisher } from './events.publisher';

/** Мок amqplib: тесты не поднимают брокер. */
const connect = jest.fn();

jest.mock('amqplib', () => ({
  connect: (...args: unknown[]) => connect(...args),
}));

function buildChannel(overrides: Record<string, unknown> = {}) {
  return {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildConnection(channel: unknown) {
  return {
    createChannel: jest.fn().mockResolvedValue(channel),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function build() {
  const map: Record<string, unknown> = {
    'rabbitmq.url': 'amqp://admin:secret@localhost:5672',
    'rabbitmq.timeoutMs': 5_000,
  };
  const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
  return new EventsPublisher(config);
}

describe('EventsPublisher', () => {
  beforeEach(() => {
    connect.mockReset();
  });

  it('публикует событие в exchange с persistent-флагом', async () => {
    const channel = buildChannel();
    connect.mockResolvedValue(buildConnection(channel));
    const publisher = build();

    const sent = await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {
      eventId: 'event-1',
    });

    expect(sent).toBe(true);
    expect(channel.assertExchange).toHaveBeenCalledWith('cleaning-ops.events', 'topic', {
      durable: true,
    });
    const [exchange, routingKey, body, options] = channel.publish.mock.calls[0];
    expect(exchange).toBe('cleaning-ops.events');
    expect(routingKey).toBe('schedule.missed_checkin');
    expect(JSON.parse((body as Buffer).toString('utf8'))).toEqual({ eventId: 'event-1' });
    expect(options).toMatchObject({ contentType: 'application/json', persistent: true });
  });

  it('переиспользует канал', async () => {
    const channel = buildChannel();
    connect.mockResolvedValue(buildConnection(channel));
    const publisher = build();

    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});
    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});

    expect(connect).toHaveBeenCalledTimes(1);
    expect(channel.publish).toHaveBeenCalledTimes(2);
  });

  it('пустой payload уходит как {}', async () => {
    const channel = buildChannel();
    connect.mockResolvedValue(buildConnection(channel));
    const publisher = build();

    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, null);

    expect((channel.publish.mock.calls[0][2] as Buffer).toString('utf8')).toBe('{}');
  });

  it('недоступный брокер → false, HTTP-запрос не падает', async () => {
    connect.mockRejectedValue(new Error('ECONNREFUSED'));
    const publisher = build();

    await expect(publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {})).resolves.toBe(false);
  });

  it('повторная публикация не ждёт таймаут (пауза переподключения)', async () => {
    connect.mockRejectedValue(new Error('ECONNREFUSED'));
    const publisher = build();

    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});
    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('ошибка publish → false и сброс соединения', async () => {
    const channel = buildChannel({
      publish: jest.fn(() => {
        throw new Error('channel closed');
      }),
    });
    const connection = buildConnection(channel);
    connect.mockResolvedValue(connection);
    const publisher = build();

    await expect(publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {})).resolves.toBe(false);
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('onModuleDestroy закрывает канал и соединение', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    connect.mockResolvedValue(connection);
    const publisher = build();

    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});
    await publisher.onModuleDestroy();

    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('ошибки закрытия не пробрасываются', async () => {
    const channel = buildChannel({
      close: jest.fn().mockRejectedValue(new Error('already closed')),
    });
    const connection = buildConnection(channel);
    connection.close = jest.fn().mockRejectedValue(new Error('already closed'));
    connect.mockResolvedValue(connection);
    const publisher = build();

    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});
    await expect(publisher.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('подписки на события соединения установлены (error/close)', async () => {
    const channel = buildChannel();
    const connection = buildConnection(channel);
    connect.mockResolvedValue(connection);
    const publisher = build();

    await publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {});

    const events = connection.on.mock.calls.map((call) => call[0]);
    expect(events).toEqual(expect.arrayContaining(['error', 'close']));

    // Вызов обработчиков не должен бросать: они только логируют и сбрасывают состояние.
    for (const [, handler] of connection.on.mock.calls) {
      expect(() => (handler as (arg: unknown) => void)(new Error('boom'))).not.toThrow();
    }
  });

  it('некорректный URL брокера не мешает публикации (хост скрывается)', async () => {
    connect.mockRejectedValue(new Error('bad url'));
    const map: Record<string, unknown> = {
      'rabbitmq.url': 'не-url',
      'rabbitmq.timeoutMs': 5_000,
    };
    const config = { get: jest.fn((key: string) => map[key]) } as unknown as ConfigService;
    const publisher = new EventsPublisher(config);

    await expect(publisher.publish(ROUTING_KEYS.SCHEDULE_MISSED_CHECKIN, {})).resolves.toBe(false);
  });
});
