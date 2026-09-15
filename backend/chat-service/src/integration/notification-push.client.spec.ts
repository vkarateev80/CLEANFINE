import { NotificationPushClient } from './notification-push.client';
import type { ServiceTokenProvider } from './service-token.provider';
import type { ConfigService } from '@nestjs/config';

/** Ответ notification-service: сводка `{ delivered }` (эндпоинт chat-message). */
function jsonResponse(body: unknown, status = 200): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function buildClient(options: { enabled?: boolean | undefined; token?: string | null } = {}) {
  const values: Record<string, unknown> = {
    'notificationService.baseUrl': 'http://localhost:3006',
    'notificationService.timeoutMs': 1_000,
  };
  if (options.enabled !== undefined) {
    values['notificationService.enabled'] = options.enabled;
  }
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  const tokens = {
    getToken: jest.fn(async () => (options.token === undefined ? 'service-token' : options.token)),
  } as unknown as ServiceTokenProvider;
  return { client: new NotificationPushClient(config, tokens), tokens };
}

describe('NotificationPushClient (chat-service)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('не делает запрос без получателей', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: [], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('выключенный push не делает запросов (CHAT_PUSH_ENABLED=false)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { client } = buildClient({ enabled: false });

    await expect(
      client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('без сервисного токена push пропускается', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { client } = buildClient({ token: null });

    await expect(
      client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('дедуплицирует получателей и отправляет их в notification-service', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ delivered: 2 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { client } = buildClient();

    const delivered = await client.notifyOffline({
      userIds: ['u-1', 'u-1', 'u-2', ''],
      title: 'Новое сообщение',
      body: 'привет',
      data: { chatId: 'c-1' },
    });

    expect(delivered).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3006/api/notifications/internal/chat-message');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.userIds).toEqual(['u-1', 'u-2']);
    expect(body.type).toBe('CHAT_MESSAGE');
    expect(body.title).toBe('Новое сообщение');
    expect(body.body).toBe('привет');
    expect(body.data).toEqual({ chatId: 'c-1' });
    // Сервисный токен уходит в Authorization.
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer service-token',
    });
  });

  it('возвращает число доставленных из сводки, а не размер списка получателей', async () => {
    // Часть получателей могла отключить тип CHAT_MESSAGE в настройках, поэтому
    // delivered меньше числа id в запросе — берём именно ответ сервиса.
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ delivered: 1 }),
    ) as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: ['u-1', 'u-2'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(1);
  });

  it('ответ без разбираемой сводки считает доставленными всех получателей', async () => {
    // Успешный (2xx) ответ без тела не должен занижать счётчик до нуля.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('пустое тело');
      },
    }) as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: ['u-1', 'u-2'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(2);
  });

  it.each([[404], [500]])(
    'ошибка notification-service (%i) не бросает исключение',
    async (status) => {
      // 404 больше не ожидаемое состояние (эндпоинт есть), но любой сбой push
      // не должен отменять отправку сообщения в чат.
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ message: 'error' }),
      }) as unknown as typeof fetch;
      const { client } = buildClient();

      await expect(
        client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
      ).resolves.toBe(0);
    },
  );

  it('недоступный notification-service не ломает отправку сообщения', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
  });

  it('по умолчанию push включён', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ delivered: 1 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { client } = buildClient();

    await client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
