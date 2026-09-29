import { ConfigService } from '@nestjs/config';
import { EVENTS_EXCHANGE, ROUTING_KEYS } from '@cleaning-ops/shared/constants/events';
import { EventsPublisher } from './events.publisher';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

// Тот же mocked-модуль, что и в publisher: connect подменён фабрикой jest.mock выше.
import * as amqp from 'amqplib';

const connectMock = amqp.connect as unknown as jest.Mock;

function createConfig(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'rabbitmq.url') return 'amqp://admin:secret@localhost:5672';
      if (key === 'rabbitmq.timeoutMs') return 1000;
      return undefined;
    }),
  } as unknown as ConfigService;
}

/** Фейковое соединение amqplib: канал + перехват обработчиков error/close. */
function createConnection() {
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, callback: (arg?: unknown) => void): void => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(callback);
    }),
  };
  return { connection, channel, listeners };
}

describe('EventsPublisher (ticket-service)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('лениво подключается и публикует событие в exchange cleaning-ops.events', async () => {
    const { connection, channel } = createConnection();
    connectMock.mockResolvedValue(connection);
    const publisher = new EventsPublisher(createConfig());

    // До первой публикации соединения нет — сервис стартует без брокера.
    expect(connectMock).not.toHaveBeenCalled();

    const payload = { ticketId: 't-1', assigneeId: 'u-2', description: 'Уборка' };
    await expect(publisher.publish(ROUTING_KEYS.TICKET_CREATED, payload)).resolves.toBe(true);

    expect(connectMock).toHaveBeenCalledWith('amqp://admin:secret@localhost:5672', {
      timeout: 1000,
    });
    // Exchange объявлен durable: события не теряются при перезапуске брокера.
    expect(channel.assertExchange).toHaveBeenCalledWith(EVENTS_EXCHANGE, 'topic', {
      durable: true,
    });
    expect(channel.publish).toHaveBeenCalledWith(
      EVENTS_EXCHANGE,
      'ticket.created',
      Buffer.from(JSON.stringify(payload), 'utf8'),
      { contentType: 'application/json', persistent: true },
    );

    await publisher.onModuleDestroy();
  });

  it('переиспользует соединение для нескольких событий', async () => {
    const { connection, channel } = createConnection();
    connectMock.mockResolvedValue(connection);
    const publisher = new EventsPublisher(createConfig());

    await publisher.publish(ROUTING_KEYS.TICKET_ASSIGNED, { ticketId: 't-1', assigneeId: 'u-2' });
    await publisher.publish(ROUTING_KEYS.TICKET_OVERDUE, { ticketId: 't-1', minutesOverdue: 7 });

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(channel.publish).toHaveBeenCalledTimes(2);

    await publisher.onModuleDestroy();
  });

  it('не бросает исключение, если брокер недоступен (HTTP-запрос не падает)', async () => {
    connectMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5672'));
    const publisher = new EventsPublisher(createConfig());

    await expect(publisher.publish(ROUTING_KEYS.TICKET_CREATED, {})).resolves.toBe(false);

    // Повторная публикация в течение cooldown не ждёт таймаут сокета снова.
    await expect(publisher.publish(ROUTING_KEYS.TICKET_CREATED, {})).resolves.toBe(false);
    expect(connectMock).toHaveBeenCalledTimes(1);

    await publisher.onModuleDestroy();
  });

  it('после ошибки публикации сбрасывает соединение и переподключается в следующий раз', async () => {
    const first = createConnection();
    first.channel.publish.mockImplementation(() => {
      throw new Error('Channel closed');
    });
    const second = createConnection();
    connectMock.mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);

    const publisher = new EventsPublisher(createConfig());

    await expect(publisher.publish(ROUTING_KEYS.TICKET_CREATED, { a: 1 })).resolves.toBe(false);
    expect(first.channel.close).toHaveBeenCalled();
    expect(first.connection.close).toHaveBeenCalled();

    await expect(publisher.publish(ROUTING_KEYS.TICKET_CREATED, { a: 2 })).resolves.toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(2);

    await publisher.onModuleDestroy();
  });

  it('закрытие соединения брокером заставляет переподключиться', async () => {
    const first = createConnection();
    const second = createConnection();
    connectMock.mockResolvedValueOnce(first.connection).mockResolvedValueOnce(second.connection);
    const publisher = new EventsPublisher(createConfig());

    await publisher.publish(ROUTING_KEYS.TICKET_CREATED, {});
    // Обработчики error/close зарегистрированы на соединении.
    expect(first.listeners.close).toHaveLength(1);
    expect(first.listeners.error).toHaveLength(1);

    first.listeners.close[0]();
    first.listeners.error[0](new Error('socket hang up'));

    await publisher.publish(ROUTING_KEYS.TICKET_CREATED, {});
    expect(connectMock).toHaveBeenCalledTimes(2);

    await publisher.onModuleDestroy();
  });

  it('публикует пустой объект вместо undefined и молча закрывает уже мёртвое соединение', async () => {
    const { connection, channel } = createConnection();
    channel.close.mockRejectedValue(new Error('already closed'));
    connection.close.mockRejectedValue(new Error('already closed'));
    connectMock.mockResolvedValue(connection);
    const publisher = new EventsPublisher(createConfig());

    await expect(publisher.publish(ROUTING_KEYS.TICKET_EMERGENCY, undefined)).resolves.toBe(true);
    expect(channel.publish).toHaveBeenCalledWith(
      EVENTS_EXCHANGE,
      'ticket.emergency',
      Buffer.from('{}', 'utf8'),
      expect.anything(),
    );

    await expect(publisher.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('onModuleDestroy без соединения не падает', async () => {
    const publisher = new EventsPublisher(createConfig());

    await expect(publisher.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('нечитаемый RABBITMQ_URL и не-Error причина не ломают логирование', async () => {
    // Причина может быть строкой (не Error), а URL — невалидным: warning не должен падать.
    connectMock.mockRejectedValue('boom');
    const publisher = new EventsPublisher({
      get: jest.fn((key: string) => (key === 'rabbitmq.url' ? 'not-a-url' : undefined)),
    } as unknown as ConfigService);

    await expect(publisher.publish(ROUTING_KEYS.TICKET_CREATED, {})).resolves.toBe(false);
  });
});
