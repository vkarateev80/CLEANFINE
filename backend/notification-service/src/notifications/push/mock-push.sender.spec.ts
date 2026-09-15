import { Logger } from '@nestjs/common';
import { MockPushSender } from './mock-push.sender';
import type { PushMessage } from './push-sender';

const VALID_TOKEN = 'fcm-token-abcdefghijklmnopqrstuvwxyz-0123456789';

function message(tokens: string[]): PushMessage {
  return {
    userId: 'u-1',
    template: 'EMERGENCY',
    title: '🚨 АВАРИЙНАЯ СИТУАЦИЯ',
    body: 'Затопление на объекте Офис, 3',
    priority: 'high',
    tokens,
    data: { ticketId: 't-1' },
  };
}

describe('MockPushSender (dev-адаптер, решение №3)', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('считает доставку успешной для валидных токенов', async () => {
    const sender = new MockPushSender();

    const result = await sender.send(message([VALID_TOKEN, VALID_TOKEN + '2']));

    expect(sender.name).toBe('mock');
    expect(result).toEqual({ successCount: 2, failureCount: 0, invalidTokens: [] });
  });

  it('логирует отправку: userId, токены и шаблон', async () => {
    const sender = new MockPushSender();

    await sender.send(message([VALID_TOKEN]));

    // Требование М3.3: мок-адаптер «отправляет» push записью в лог.
    expect(log).toHaveBeenCalledTimes(1);
    const logged = String(log.mock.calls[0][0]);
    expect(logged).toContain('[MOCK PUSH]');
    expect(logged).toContain('user=u-1');
    expect(logged).toContain('template=EMERGENCY');
    expect(logged).toContain('tokens=1');
  });

  it('сохраняет журнал отправок для диагностики', async () => {
    const sender = new MockPushSender();

    await sender.send(message([VALID_TOKEN]));

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].userId).toBe('u-1');
  });

  it('возвращает невалидные токены, чтобы сервис деактивировал устройства', async () => {
    const sender = new MockPushSender();

    const result = await sender.send(message([VALID_TOKEN, 'bad-token']));

    expect(result).toEqual({ successCount: 1, failureCount: 1, invalidTokens: ['bad-token'] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('невалидные токены: 1'));
  });
});
