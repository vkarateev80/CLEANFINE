import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebasePushSender } from './firebase-push.sender';
import { MockPushSender } from './mock-push.sender';
import { createPushSender } from './push-sender.factory';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('createPushSender', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('dev (пустые FIREBASE_*) → MockPushSender', () => {
    const sender = createPushSender(
      configWith({ 'push.projectId': '', 'push.clientEmail': '', 'push.privateKey': '' }),
    );

    expect(sender).toBeInstanceOf(MockPushSender);
  });

  it('полные креды → FirebasePushSender (ленивая инициализация FCM)', () => {
    const loadAdmin = jest.fn(() => {
      throw new Error('SDK не должен загружаться при создании адаптера');
    });

    const sender = createPushSender(
      configWith({
        'push.projectId': 'cleaning-ops',
        'push.clientEmail': 'svc@cleaning-ops.iam.gserviceaccount.com',
        'push.privateKey': 'key',
      }),
      loadAdmin,
    );

    expect(sender).toBeInstanceOf(FirebasePushSender);
    expect(loadAdmin).not.toHaveBeenCalled();
  });

  it('отсутствующие в конфиге ключи не ломают выбор адаптера', () => {
    // ConfigService.get вернёт undefined, если .env не загружен вообще.
    expect(createPushSender(configWith({}))).toBeInstanceOf(MockPushSender);
  });
});
