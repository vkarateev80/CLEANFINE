import { ConfigService } from '@nestjs/config';
import { NtfyPushSender } from './ntfy-push.sender';
import type { PushMessage } from './push-sender';

describe('NtfyPushSender', () => {
  const config = {
    get: (key: string) => (key === 'push.ntfyUrl' ? 'http://ntfy:8080/' : undefined),
  } as unknown as ConfigService;

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function message(overrides: Partial<PushMessage> = {}): PushMessage {
    return {
      userId: 'u1',
      template: 'CHAT_MESSAGE',
      title: 'Сообщение',
      body: 'Привет',
      priority: 'high',
      tokens: ['cf-abc123'],
      data: { type: 'CHAT_MESSAGE', chatId: 'c1' },
      ...overrides,
    };
  }

  it('публикует конверт {v,t,b,d} текстом с Priority-заголовком 5', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const sender = new NtfyPushSender(config);
    const result = await sender.send(message());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://ntfy:8080/cf-abc123',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Priority: '5' }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({
      v: 1,
      t: 'Сообщение',
      b: 'Привет',
      d: { type: 'CHAT_MESSAGE', chatId: 'c1' },
    });
    expect(result).toEqual({ successCount: 1, failureCount: 0, invalidTokens: [] });
  });

  it('normal-приоритет — 3', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    global.fetch = fetchMock as unknown as typeof fetch;

    await new NtfyPushSender(config).send(message({ priority: 'normal' }));

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Priority: '3' } });
  });

  it('ошибка доставки уходит в failureCount, invalidTokens пуст (ntfy их не знает)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const result = await new NtfyPushSender(config).send(message({ tokens: ['cf-a', 'cf-b'] }));

    expect(result).toEqual({ successCount: 0, failureCount: 2, invalidTokens: [] });
  });

  it('HTTP 5xx от ntfy тоже отказ', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'oops',
    }) as unknown as typeof fetch;

    const result = await new NtfyPushSender(config).send(message());
    expect(result.failureCount).toBe(1);
  });
});
