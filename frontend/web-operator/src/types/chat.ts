import type { ChatType } from '@cleaning-ops/shared/types/chat';

/**
 * Типы ответов chat-service (М5.1–М5.2). Поля повторяют вьюхи
 * `ChatsService` (`ChatSummary`, `ChatDetail`, `MessageView`, `MessagesPage`),
 * а не prisma-модели: сервис не отдаёт наружу `Message` напрямую.
 *
 * Даты — строки: axios разбирает JSON, где `Date` уже сериализован в ISO 8601
 * (то же решение, что в `types/tickets.ts`).
 *
 * Словарь типов чата НЕ дублируется: `CHAT_TYPES`/`CHAT_TYPE_LABELS` живут в
 * `@cleaning-ops/shared/types/chat` — оттуда их берёт и бэкенд.
 */

export { CHAT_TYPES, CHAT_TYPE_LABELS } from '@cleaning-ops/shared/types/chat';
export type { ChatType } from '@cleaning-ops/shared/types/chat';

/** Превью последнего сообщения в списке чатов (`LastMessagePreview`). */
export interface LastMessagePreview {
  id: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
}

/** Элемент `GET /api/chat/chats` (`ChatSummary`). */
export interface ChatSummary {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  lastMessage: LastMessagePreview | null;
  unreadCount: number;
}

/** Участник чата (`ChatMemberView`) — по нему определяется «менеджер». */
export interface ChatMemberView {
  userId: string;
  role: string | null;
  joinedAt: string;
  lastReadAt: string | null;
}

/** `GET /api/chat/chats/:id` (`ChatDetail`). */
export interface ChatDetail {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  members: ChatMemberView[];
}

/** Сообщение (`MessageView`) — то же, что приходит событием `message:new`. */
export interface MessageView {
  id: string;
  chatId: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
  /** Когда сообщение получил хотя бы один получатель; null — только отправлено. */
  deliveredAt: string | null;
}

/**
 * Страница истории (`MessagesPage`). `items` идут от СТАРЫХ к НОВЫМ (как рисует
 * лента), `nextBefore` — курсор для подгрузки выше.
 */
export interface MessagesPage {
  items: MessageView[];
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
}

/** События WebSocket-шлюза (namespace `chat`, см. `chat.gateway.ts`). */
export interface MessageReadEvent {
  chatId: string;
  messageId: string;
  readBy: string;
  readAt: string;
}

/** `message:deleted` (14.10.2026): админ удалил сообщение — убрать из ленты. */
export interface MessageDeletedEvent {
  chatId: string;
  messageId: string;
  deletedBy: string;
}

export interface UserStatusEvent {
  userId: string;
  online: boolean;
}

/** Ack на `message:send`/`message:read` — `{ ok: true, … }` либо `{ ok: false, error }`. */
export type WsAck<T> = ({ ok: true } & T) | { ok: false; error: string; status?: number };

/** Подписи статусов прочтения исходящего сообщения (галочки у пузыря). */
export const READ_MARK_SENT = '✓';
export const READ_MARK_READ = '✓✓';
