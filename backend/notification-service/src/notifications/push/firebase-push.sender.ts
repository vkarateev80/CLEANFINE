import { Logger } from '@nestjs/common';
import type { FirebaseCredentials } from '../../config/configuration';
import { errorMessage } from '../../common/error.util';
import type { PushMessage, PushResult, PushSender } from './push-sender';

/** Минимальная форма ответа FCM, нужная сервису (без типов firebase-admin). */
export interface FirebaseMulticastResponse {
  responses: Array<{ success: boolean; error?: { code?: string } }>;
}

export interface FirebaseMessaging {
  sendEachForMulticast(message: Record<string, unknown>): Promise<FirebaseMulticastResponse>;
}

export interface FirebaseAdminLike {
  initializeApp(options: Record<string, unknown>): unknown;
  credential: { cert(credentials: Record<string, unknown>): unknown };
  messaging(): FirebaseMessaging;
}

export type FirebaseAdminLoader = () => FirebaseAdminLike;

/** Коды FCM, означающие мёртвый токен: устройство надо деактивировать. */
export const INVALID_TOKEN_ERROR_CODES: readonly string[] = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
];

/**
 * require, а не import: firebase-admin — опциональная зависимость.
 * В dev (пустые FIREBASE_*) используется MockPushSender, поэтому пакет
 * может отсутствовать, и это не должно ломать сборку и запуск сервиса.
 */
export function defaultFirebaseLoader(): FirebaseAdminLike {
  return require('firebase-admin') as FirebaseAdminLike;
}

/**
 * Реальная отправка через FCM (docs/agents/BACKEND_NOTIFICATIONS.md, п.2).
 * Инициализация ленивая: приложение поднимается без обращения к Firebase,
 * первый send инициализирует SDK и переиспользует messaging дальше.
 */
export class FirebasePushSender implements PushSender {
  readonly name = 'firebase';

  private readonly logger = new Logger(FirebasePushSender.name);
  private messaging: FirebaseMessaging | null = null;

  constructor(
    private readonly credentials: FirebaseCredentials,
    private readonly loadAdmin: FirebaseAdminLoader = defaultFirebaseLoader,
  ) {}

  private getMessaging(): FirebaseMessaging {
    if (this.messaging === null) {
      const admin = this.loadAdmin();
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.credentials.projectId,
          clientEmail: this.credentials.clientEmail,
          privateKey: this.credentials.privateKey,
        }),
      });
      this.messaging = admin.messaging();
    }
    return this.messaging;
  }

  async send(message: PushMessage): Promise<PushResult> {
    let response: FirebaseMulticastResponse;
    try {
      response = await this.getMessaging().sendEachForMulticast({
        tokens: message.tokens,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
          priority: message.priority === 'high' ? 'high' : 'normal',
          // Канал уведомления на Android соответствует типу уведомления.
          notification: { sound: 'default', channelId: message.template },
        },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (error) {
      // Транспортная ошибка FCM: не роняем событие — in-app запись сохранит сервис.
      this.logger.error(`FCM недоступен для user=${message.userId}: ${errorMessage(error)}`);
      return { successCount: 0, failureCount: message.tokens.length, invalidTokens: [] };
    }

    const invalidTokens: string[] = [];
    let successCount = 0;
    response.responses.forEach((result, index) => {
      if (result.success) {
        successCount += 1;
        return;
      }
      const code = result.error?.code ?? '';
      if (INVALID_TOKEN_ERROR_CODES.includes(code)) {
        invalidTokens.push(message.tokens[index]);
      }
      this.logger.warn(`FCM не доставил user=${message.userId} code=${code}`);
    });

    return {
      successCount,
      failureCount: message.tokens.length - successCount,
      invalidTokens,
    };
  }
}
