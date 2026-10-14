import { CHAT_TYPES, type ChatType } from '@cleaning-ops/shared/types/chat';

/**
 * Типы ответов chat-service (М5.1–М5.2). Поля повторяют
 * `backend/chat-service/src/chats/chats.service.ts`, но даты — строки: axios
 * отдаёт JSON, в котором `Date` уже сериализован в ISO 8601 (то же решение,
 * что в `src/types/notifications.ts`).
 *
 * Словарь типов НЕ дублируется: `CHAT_TYPES` приходит из
 * `@cleaning-ops/shared/types/chat` — того же модуля, что использует бэкенд
 * (в `ChatType` shared). Локально объявлены только короткие подписи интерфейса:
 * в shared подписи длинные («Чат объекта (все сотрудники)») и годятся для
 * подсказки, а не для бейджа в списке.
 */

export { CHAT_TYPES };
export type { ChatType };

/** Короткие подписи типов для бейджей, фильтра и заголовков-заглушек. */
export const CHAT_TYPE_SHORT_LABELS: Record<ChatType, string> = {
  object: 'Объект',
  ticket: 'Заявка',
  direct: 'Личный',
  system: 'Система',
};

/** Строка, а не union: бэкенд может добавить тип чата раньше, чем админка. */
export function chatTypeLabel(type: string): string {
  return (CHAT_TYPE_SHORT_LABELS as Record<string, string>)[type] ?? type;
}

/**
 * Ограничения сообщения — те же, что в `SendMessageDto` chat-service
 * (`MAX_MESSAGE_LENGTH`), плюс лимит вложений. Нужны интерфейсу, чтобы
 * `maxLength` поля ввода совпадал с серверной проверкой, а не расходился с ней.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const MAX_CHAT_ATTACHMENTS = 20;

/** `GET /api/chat/chats` — элемент списка чатов пользователя. */
export interface ChatSummary {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  /** Превью последнего сообщения (уже обрезано сервисом до 120 символов). */
  lastMessage: ChatLastMessage | null;
  unreadCount: number;
}

export interface ChatLastMessage {
  id: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
}

/** `GET /api/chat/chats/:id` — деталь чата с участниками. */
export interface ChatDetail {
  id: string;
  type: ChatType;
  title: string | null;
  objectId: string | null;
  ticketId: string | null;
  createdAt: string;
  members: ChatMember[];
}

export interface ChatMember {
  userId: string;
  role: string | null;
  joinedAt: string;
  lastReadAt: string | null;
}

/** Сообщение: тот же объект приходит в истории, в ack и в `message:new`. */
export interface ChatMessage {
  id: string;
  chatId: string;
  authorId: string;
  text: string;
  attachmentIds: string[];
  createdAt: string;
}

/**
 * Страница истории. `items` идут от СТАРЫХ к новым (контракт М5.1), поэтому
 * страница рисуется без переворота массива; `nextBefore` — курсор для
 * подгрузки ещё выше по истории.
 */
export interface ChatMessagesPage {
  items: ChatMessage[];
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
}

export interface ChatSearchResult {
  items: ChatMessage[];
  total: number;
}

/** `POST /api/chat/chats` — non-idempotent только для direct/system. */
export interface CreateChatPayload {
  type: ChatType;
  /** Для direct — ровно один второй участник; для остальных — дополнительные. */
  participantIds?: string[];
  objectId?: string;
  ticketId?: string;
  title?: string;
}

export interface SendMessagePayload {
  text: string;
  /** id вложений file-service (bucket documents), максимум 20. */
  attachmentIds?: string[];
}

/** Ответ `POST /api/chat/chats/:id/read` (и ack `message:read`). */
export interface ChatReadResult {
  chatId: string;
  userId: string;
  lastMessageId: string;
  readAt: string;
}

/** Событие `message:read`: приходит автору прочитанного сообщения. */
export interface ChatMessageReadEvent {
  chatId: string;
  messageId: string;
  readBy: string;
  readAt: string;
}

/** Событие `message:deleted` (14.10.2026): админ удалил сообщение — убрать из ленты. */
export interface ChatMessageDeletedEvent {
  chatId: string;
  messageId: string;
  deletedBy: string;
}

/** Ack `message:send`/`message:read` из `chat.gateway.ts`. */
export type ChatAck<T> = ({ ok: true } & T) | { ok: false; error: string; status?: number };

/**
 * Заголовок чата для списка. У ticket/object-чатов `title` обычно пуст (имя
 * объекта/номер заявки живёт в других сервисах), поэтому подставляем тип и
 * короткий id — иначе строка списка выглядела бы безымянной.
 */
export function chatDisplayTitle(chat: Pick<ChatSummary, 'id' | 'type' | 'title'>): string {
  if (chat.title && chat.title.trim() !== '') return chat.title;
  return `${chatTypeLabel(chat.type)} · ${chat.id.slice(0, 8)}`;
}
