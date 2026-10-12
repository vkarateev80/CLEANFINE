import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { WS_PATH, WS_URL } from '../api/config';
import type { MessageReadEvent, MessageView, WsAck } from '../types/chat';

/**
 * Соединение чата (DS-004, `chat.md` п. 7.1). Приём взят из
 * `docs/agents/FRONTEND_WEB.md` → `useWebSocket` без изменения контракта:
 * namespace `/chat`, JWT в `auth.token` соединения, события
 * `message:send` / `message:read` / `message:new` / `message:read`.
 *
 * Отличия от каркаса в документации — ровно те, что нужны рабочему экрану:
 *  • `transports: ['websocket']` — без опроса (polling) на мобильной сети;
 *  • `reconnection` с задержками 1→2→5→10 с: телефон теряет сеть в лифте и
 *    подвале, и «навсегда разорванный» сокет оставил бы чат без новых сообщений;
 *  • размонтирование экрана закрывает соединение — иначе после нескольких
 *    переходов на сервере оставался бы лишний сокет и статус «онлайн» врал бы;
 *  • при `connect_error` пересоздаём сокет с обновлённым access-токеном: если
 *    токен истёк, socket.io не восстановит соединение сам.
 */

export interface UseChatSocketResult {
  status: 'connecting' | 'online' | 'offline';
  /** Отправка сообщения с подтверждением сервера (ack) либо ошибкой. */
  send: (
    chatId: string,
    text: string,
    clientMessageId?: string,
    attachmentIds?: string[],
  ) => Promise<MessageView>;
  /** Отметка прочтения: `lastMessageId` — последнее видимое сообщение чата. */
  markRead: (chatId: string, lastMessageId: string) => void;
  /** Новые сообщения из сокета (экран решает, к какому чату они относятся). */
  incoming: MessageView[];
  /** События прочтения: нужны для галочек `✓` → `✓✓`. */
  reads: MessageReadEvent[];
  /** Онлайн-статус собеседника по `user:status`. */
  onlineUsers: Set<string>;
  /** Очистить накопленные события после обработки. */
  consumeIncoming: () => void;
}

export function useChatSocket(enabled: boolean): UseChatSocketResult {
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [incoming, setIncoming] = useState<MessageView[]>([]);
  const [reads, setReads] = useState<MessageReadEvent[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !accessToken) return undefined;

    const socket = io(`${WS_URL}/chat`, {
      auth: { token: accessToken },
      // Путь до сервера socket.io: в dev — `/ws-chat` (WS-прокси Vite), в прод —
      // штатный `/socket.io`. Namespace `/chat` socket.io добавляет сам.
      path: WS_PATH,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;
    setStatus('connecting');

    socket.on('connect', () => setStatus('online'));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));
    socket.on('message:new', (message: MessageView) => {
      setIncoming((current) => [...current, message]);
    });
    socket.on('message:read', (event: MessageReadEvent) => {
      setReads((current) => [...current, event]);
    });
    socket.on('user:status', (event: { userId: string; online: boolean }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        if (event.online) next.add(event.userId);
        else next.delete(event.userId);
        return next;
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, accessToken]);

  const send = useCallback(
    (
      chatId: string,
      text: string,
      clientMessageId?: string,
      attachmentIds: string[] = [],
    ): Promise<MessageView> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          reject(new Error('Нет соединения с сервером чата'));
          return;
        }
        socket.timeout(10_000).emit(
          'message:send',
          // clientMessageId — ключ идемпотентности (М6): фолбэк на REST после
          // таймаута с тем же ключом не создаёт дубль.
          {
            chatId,
            text,
            ...(clientMessageId ? { clientMessageId } : {}),
            ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
          },
          (timeoutError: Error | null, response: WsAck<{ message: MessageView }>) => {
            if (timeoutError) {
              reject(new Error('Сервер не подтвердил отправку сообщения'));
              return;
            }
            if (!response || response.ok !== true) {
              reject(new Error(response?.error ?? 'Не удалось отправить сообщение'));
              return;
            }
            resolve(response.message);
          },
        );
      });
    },
    [],
  );

  const markRead = useCallback((chatId: string, lastMessageId: string) => {
    const socket = socketRef.current;
    // Отметка прочтения не критична: если сокет отвалился, история всё равно
    // подтянется при следующем заходе, а падать из-за неё экран не должен.
    if (!socket || !socket.connected) return;
    socket.emit('message:read', { chatId, lastMessageId });
  }, []);

  const consumeIncoming = useCallback(() => setIncoming([]), []);

  return { status, send, markRead, incoming, reads, onlineUsers, consumeIncoming };
}
