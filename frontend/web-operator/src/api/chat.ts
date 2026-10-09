import { apiClient } from './client';
import type { ChatDetail, ChatSummary, MessageView, MessagesPage } from '../types/chat';

/**
 * Клиент chat-service (:3009 через прокси `/api/chat`).
 *
 * Пути — из контроллера `chats.controller.ts` (М5.1/М5.2). Точка входа портала —
 * `listMyChats`: сервер отдаёт ТОЛЬКО чаты, где пользователь участник (id берётся
 * из JWT), поэтому чужие переписки через этот вызов недостижимы в принципе.
 *
 * Отправка сообщения идёт основным путём через WebSocket (`message:send`), а
 * `POST /chats/:id/messages` оставлен фолбэком: если сокет не поднялся (прокси
 * без поддержки WS), сообщение всё равно можно отправить (контракт М5.1 это
 * разрешает явно — «REST-фолбэк»).
 */

/** Чаты текущего пользователя, свежие выше. */
export function listMyChats(): Promise<ChatSummary[]> {
  return apiClient.get('/chat/chats').then((r) => r.data);
}

/**
 * Создать DIRECT-чат со вторым участником. Роль «менеджер» на бэкенде не
 * определена (открытый вопрос DS-004 п. 10.1), поэтому портал открывает переписку
 * с ADMIN из конфигурации `VITE_MANAGER_USER_ID`.
 *
 * Идемпотентно: повторный вызов для той же пары участников возвращает
 * существующий чат (уникальность пары проверяет `ChatsService.createDirectChat`).
 */
export function createDirectChat(participantId: string): Promise<ChatDetail> {
  return apiClient
    .post('/chat/chats', { type: 'direct', participantIds: [participantId] })
    .then((r) => r.data);
}

/** Первая (самая свежая) страница истории: `limit` ≤ 100. */
export function listMessages(chatId: string, limit = 50): Promise<MessagesPage> {
  return apiClient.get(`/chat/chats/${chatId}/messages`, { params: { limit } }).then((r) => r.data);
}

/** Подгрузка истории вверх по курсору `before` (createdAt самого старого сообщения страницы). */
export function listMessagesBefore(
  chatId: string,
  before: string,
  limit = 50,
): Promise<MessagesPage> {
  return apiClient
    .get(`/chat/chats/${chatId}/messages`, { params: { before, limit } })
    .then((r) => r.data);
}

/**
 * REST-фолбэк отправки. Основной путь — `message:send` по сокету; сюда попадаем,
 * если сокет не подключён или не ответил за таймаут. `clientMessageId` общий
 * с WS-попыткой (М6): если первая отправка дошла до сервера, фолбэк вернёт то же
 * сообщение, а не создаст дубль.
 */
export function sendMessageRest(
  chatId: string,
  text: string,
  clientMessageId?: string,
): Promise<MessageView> {
  return apiClient
    .post(`/chat/chats/${chatId}/messages`, {
      text,
      ...(clientMessageId ? { clientMessageId } : {}),
    })
    .then((r) => r.data);
}
