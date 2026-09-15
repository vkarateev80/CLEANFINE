import { Logger } from '@nestjs/common';
import {
  FirebasePushSender,
  defaultFirebaseLoader,
  type FirebaseAdminLoader,
  type FirebaseMulticastResponse,
} from './firebase-push.sender';
import type { PushMessage } from './push-sender';

/**
 * firebase-admin — опциональная зависимость (в dev работает MockPushSender),
 * поэтому модуль подменяется виртуальным моком: тест проверяет нашу логику,
 * а не SDK Google.
 */
jest.mock('firebase-admin', () => ({ initializeApp: jest.fn() }), { virtual: true });

const CREDENTIALS = {
  projectId: 'cleaning-ops',
  clientEmail: 'svc@cleaning-ops.iam.gserviceaccount.com',
  privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
};

function message(tokens: string[]): PushMessage {
  return {
    userId: 'u-1',
    template: 'EMERGENCY',
    title: 'АВАРИЯ',
    body: 'Затопление',
    priority: 'high',
    tokens,
    data: { ticketId: 't-1' },
  };
}

/** Ответ FCM зависит от переданных токенов — как в реальном multicast. */
type AdminResponder = (tokens: string[]) => FirebaseMulticastResponse | Error;

function buildAdmin(respond: AdminResponder): {
  loader: FirebaseAdminLoader;
  sendEachForMulticast: jest.Mock;
  initializeApp: jest.Mock;
  cert: jest.Mock;
} {
  const sendEachForMulticast = jest.fn(
    async (payload: { tokens: string[] }): Promise<FirebaseMulticastResponse> => {
      const response = respond(payload.tokens);
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
  );
  const initializeApp = jest.fn();
  const cert = jest.fn((credentials: Record<string, unknown>) => credentials);
  const messaging = jest.fn(() => ({ sendEachForMulticast }));
  const loader: FirebaseAdminLoader = () => ({
    initializeApp,
    credential: { cert },
    messaging,
  });

  return { loader, sendEachForMulticast, initializeApp, cert };
}

const allSucceed: AdminResponder = (tokens) => ({
  responses: tokens.map(() => ({ success: true })),
});

describe('defaultFirebaseLoader', () => {
  it('лениво загружает firebase-admin через require', () => {
    // Модуль не импортируется на старте: без FIREBASE_* он даже не установлен.
    expect(defaultFirebaseLoader()).toHaveProperty('initializeApp');
  });
});

describe('FirebasePushSender (FCM)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('инициализирует SDK один раз и отправляет multicast', async () => {
    const admin = buildAdmin(allSucceed);
    const sender = new FirebasePushSender(CREDENTIALS, admin.loader);

    const first = await sender.send(message(['token-a', 'token-b']));
    const second = await sender.send(message(['token-a']));

    expect(sender.name).toBe('firebase');
    expect(first).toEqual({ successCount: 2, failureCount: 0, invalidTokens: [] });
    expect(second.successCount).toBe(1);
    expect(admin.initializeApp).toHaveBeenCalledTimes(1);
    expect(admin.cert).toHaveBeenCalledWith(CREDENTIALS);

    const payload = admin.sendEachForMulticast.mock.calls[0][0] as Record<string, any>;
    expect(payload.tokens).toEqual(['token-a', 'token-b']);
    expect(payload.notification).toEqual({ title: 'АВАРИЯ', body: 'Затопление' });
    // Приоритет из шаблона управляет Android-каналом доставки.
    expect(payload.android.priority).toBe('high');
    expect(payload.android.notification.channelId).toBe('EMERGENCY');
    expect(payload.apns.payload.aps.sound).toBe('default');
  });

  it('понижает приоритет Android для normal-уведомлений', async () => {
    const admin = buildAdmin(allSucceed);
    const sender = new FirebasePushSender(CREDENTIALS, admin.loader);

    await sender.send({ ...message(['token-a']), priority: 'normal' });

    const payload = admin.sendEachForMulticast.mock.calls[0][0] as Record<string, any>;
    expect(payload.android.priority).toBe('normal');
  });

  it('возвращает мёртвые токены по кодам FCM', async () => {
    const admin = buildAdmin(() => ({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/invalid-argument' } },
        { success: false, error: {} },
      ],
    }));
    const sender = new FirebasePushSender(CREDENTIALS, admin.loader);

    const result = await sender.send(message(['ok', 'dead-1', 'dead-2', 'transient']));

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(3);
    // Транзиентная ошибка без кода не должна деактивировать устройство.
    expect(result.invalidTokens).toEqual(['dead-1', 'dead-2']);
  });

  it('транспортная ошибка FCM не роняет обработку события', async () => {
    const admin = buildAdmin(() => new Error('UNAVAILABLE'));
    const sender = new FirebasePushSender(CREDENTIALS, admin.loader);

    const result = await sender.send(message(['token-a']));

    // Устройства не деактивируются, in-app запись сохранит NotificationsService.
    expect(result).toEqual({ successCount: 0, failureCount: 1, invalidTokens: [] });
  });
});
