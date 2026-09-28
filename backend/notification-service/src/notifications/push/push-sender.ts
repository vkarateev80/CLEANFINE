import type { NotificationPriority, NotificationType } from '../notification-types';

/** Токен DI: реализация PushSender (mock в dev, FCM при наличии кредов). */
export const PUSH_SENDER = 'PUSH_SENDER';

/** Сообщение на отправку: адресат, готовый текст, приоритет и токены устройств. */
export interface PushMessage {
  userId: string;
  template: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  tokens: string[];
  /** data-секция push (только строки — требование FCM). */
  data: Record<string, string>;
}

export interface PushResult {
  successCount: number;
  failureCount: number;
  /**
   * Токены, которые провайдер признал недействительными.
   * Вызывающий обязан деактивировать соответствующие устройства.
   */
  invalidTokens: string[];
}

/**
 * Адаптер доставки push. Единственная точка знания о провайдере:
 * реализация в проекте одна — MockPushSender (Firebase исключён, 27.09.2026).
 */
export interface PushSender {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}

/**
 * FCM-токен — длинная строка из base64url/двоеточий/дефисов.
 * Мок считает «невалидным» всё, что на неё не похоже (например 'bad-token');
 * реальный FCM сообщает об этом кодами UNREGISTERED/INVALID_ARGUMENT,
 * поэтому бизнес-логика деактивации устройства от реализации не зависит.
 */
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{20,}$/;

export function isWellFormedToken(token: string): boolean {
  return FCM_TOKEN_PATTERN.test(token);
}

/** data-секция push: FCM принимает только строковые значения. */
export function toPushData(payload: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) {
      continue;
    }
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return data;
}
