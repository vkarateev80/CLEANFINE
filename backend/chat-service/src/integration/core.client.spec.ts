import { CoreClient } from './core.client';
import type { ServiceTokenProvider } from './service-token.provider';
import type { ConfigService } from '@nestjs/config';

function build(token: string | null = 'service-token') {
  const config = {
    get: jest.fn((key: string) =>
      key === 'coreService.baseUrl' ? 'http://localhost:3003' : 1_000,
    ),
  } as unknown as ConfigService;
  const tokens = { getToken: jest.fn(async () => token) } as unknown as ServiceTokenProvider;
  return new CoreClient(config, tokens);
}

describe('CoreClient (chat-service)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('подтверждает существующий объект', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
    await expect(build().objectExists('o-1')).resolves.toBe(true);
  });

  it('404 означает, что объекта нет', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(build().objectExists('ghost')).resolves.toBe(false);
  });

  it('прочие ошибки core-service — неизвестность (null), а не отказ', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(build().objectExists('o-1')).resolves.toBeNull();
  });

  it('недоступность core-service — null и без исключения', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(build().objectExists('o-1')).resolves.toBeNull();
  });

  it('без сервисного токена проверка пропускается', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(build(null).objectExists('o-1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
