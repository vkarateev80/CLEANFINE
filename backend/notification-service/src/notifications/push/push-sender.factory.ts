import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isFirebaseConfigured } from '../../config/configuration';
import {
  FirebasePushSender,
  defaultFirebaseLoader,
  type FirebaseAdminLoader,
} from './firebase-push.sender';
import { MockPushSender } from './mock-push.sender';
import type { PushSender } from './push-sender';

/**
 * Выбор реализации PushSender по наличию кредов Firebase.
 * Dev (пустые FIREBASE_*) → MockPushSender, prod → FirebasePushSender (FCM).
 */
export function createPushSender(
  config: ConfigService,
  loadAdmin: FirebaseAdminLoader = defaultFirebaseLoader,
): PushSender {
  const credentials = {
    projectId: config.get<string>('push.projectId') ?? '',
    clientEmail: config.get<string>('push.clientEmail') ?? '',
    privateKey: config.get<string>('push.privateKey') ?? '',
  };

  if (isFirebaseConfigured(credentials)) {
    new Logger('PushSenderFactory').log('Push-адаптер: Firebase Cloud Messaging');
    return new FirebasePushSender(credentials, loadAdmin);
  }

  new Logger('PushSenderFactory').log(
    'Push-адаптер: MockPushSender (FIREBASE_* не заданы — решение №3)',
  );
  return new MockPushSender();
}
