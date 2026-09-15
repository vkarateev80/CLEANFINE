import { NotificationPushClient } from './notification-push.client';
import type { ServiceTokenProvider } from './service-token.provider';
import type { ConfigService } from '@nestjs/config';

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
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
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
    // Сервисный токен уходит в Authorization.
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer service-token',
    });
  });

  it('404 (эндпоинта chat-message нет) — это не ошибка доставки сообщения', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
  });

  it('прочие ошибки notification-service не бросают исключение', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
  });

  it('недоступный notification-service не ломает отправку сообщения', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const { client } = buildClient();

    await expect(
      client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} }),
    ).resolves.toBe(0);
  });

  it('по умолчанию push включён', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { client } = buildClient();

    await client.notifyOffline({ userIds: ['u-1'], title: 't', body: 'b', data: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
