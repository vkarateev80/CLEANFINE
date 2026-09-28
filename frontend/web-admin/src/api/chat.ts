import { apiClient } from './client';
import type {
  ChatDetail,
  ChatMessage,
  ChatMessagesPage,
  ChatReadResult,
  ChatSearchResult,
  ChatSummary,
  CreateChatPayload,
  SendMessagePayload,
} from '../types/chat';

/**
 * Клиент chat-service (:3009 через прокси `/api/chat`). Пути собраны в одном
 * модуле: страницы не должны знать про `/chats/:id/messages`, иначе путь
 * размножится по компонентам и разойдётся с контроллером.
 *
 * Здесь только REST. Основной путь доставки — WebSocket (`useChatSocket`), а
 * эти вызовы остаются фолбэком, когда сокет недоступен, а также для чтения
 * списка чатов и истории (их WebSocket-контракт не покрывает).
 */

/** Чаты текущего пользователя, отсортированные сервисом по последнему сообщению. */
export function listMyChats(): Promise<ChatSummary[]> {
  return apiClient.get('/chat/chats').then((r) => r.data);
}

/** Деталь чата с участниками (нужна, чтобы показать состав и `lastReadAt`). */
export function getChat(id: string): Promise<ChatDetail> {
  return apiClient.get(`/chat/chats/${id}`).then((r) => r.data);
}

/**
 * Создание чата. Для `ticket`/`object` повторный вызов возвращает существующий
 * чат (идемпотентность на бэкенде), поэтому карточки заявки и объекта вызывают
 * этот метод при каждом открытии.
 */
export function createChat(payload: CreateChatPayload): Promise<ChatDetail> {
  return apiClient.post('/chat/chats', payload).then((r) => r.data);
}

/** История сообщений: `before` — курсор `nextBefore` предыдущей страницы. */
export function listChatMessages(
  chatId: string,
  query: { before?: string; limit?: number } = {},
): Promise<ChatMessagesPage> {
  return apiClient.get(`/chat/chats/${chatId}/messages`, { params: query }).then((r) => r.data);
}

/** REST-фолбэк отправки: сохраняет сообщение и рассылает `message:new` онлайн-участникам. */
export function sendChatMessage(chatId: string, payload: SendMessagePayload): Promise<ChatMessage> {
  return apiClient.post(`/chat/chats/${chatId}/messages`, payload).then((r) => r.data);
}

/**
 * Отметка прочтения. `lastReadAt` участника = `createdAt` указанного сообщения
 * (не «сейчас»), повторный вызов идемпотентен — «назад» отметка не откатывается.
 */
export function markChatRead(chatId: string, lastMessageId: string): Promise<ChatReadResult> {
  return apiClient.post(`/chat/chats/${chatId}/read`, { lastMessageId }).then((r) => r.data);
}

/** Поиск по тексту только по своим чатам (ILIKE на бэкенде). */
export function searchChatMessages(query: {
  q: string;
  chatId?: string;
  limit?: number;
}): Promise<ChatSearchResult> {
  return apiClient.get('/chat/messages/search', { params: query }).then((r) => r.data);
}
