import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { markChatRead, sendChatMessage } from '../api/chat';
import { useAuthStore } from '../stores/authStore';
import type { ChatAck, ChatMessage, ChatMessageReadEvent, SendMessagePayload } from '../types/chat';

/**
 * WebSocket-канал чата (М5.3) поверх chat-service: namespace `/chat`
 * (`backend/chat-service/README.md`, раздел «WebSocket-контракт»).
 *
 * Почему хук, а не клиент в `api/chat.ts`. У сокета есть жизненный цикл
 * (подключение по токену, переподключение, снятие слушателей), который обязан
 * совпадать с жизнью компонента: React-хук — единственное место, где это можно
 * гарантировать через `useEffect`-cleanup. REST-функции остаются в `api/chat.ts`
 * и используются здесь как фолбэк.
 *
 * Адрес. Vite-прокси админки знает только `/api/chat` (HTTP), для `/socket.io`
 * записи нет, а `vite.config.ts` — файл главной сессии. Поэтому в dev ходим на
 * chat-service напрямую (`http://<host>:3009`), а в прод-сборке — на origin
 * страницы (там `?token`/`auth` и путь `/socket.io` маршрутизирует reverse-proxy).
 * Явный `VITE_CHAT_WS_URL` перекрывает оба варианта.
 */

/** Размер порции истории; 50 — дефолт сервиса, больше в один запрос не просим. */
export const CHAT_PAGE_LIMIT = 50;

/** Сколько ждать ack на `message:send`/`message:read`, прежде чем считать сокет мёртвым. */
const ACK_TIMEOUT_MS = 8_000;

/**
 * Ручные повторы подключения после `io server disconnect`: socket.io сам
 * НЕ переподключается, когда соединение разорвал сервер (так он отклоняет
 * невалидный/истёкший JWT). Ограничиваем число попыток, чтобы просроченный токен
 * не превратился в бесконечный цикл — после них остаётся честный статус «нет
 * соединения» и REST-фолбэк отправки.
 */
const MANUAL_RETRY_LIMIT = 5;
const MANUAL_RETRY_DELAY_MS = 5_000;

export type ChatConnectionStatus = 'connecting' | 'online' | 'offline';

export interface ChatSocketHandlers {
  /** Пришло новое сообщение (отправителю своё сообщение не приходит — только ack). */
  onMessageNew?: (message: ChatMessage) => void;
  /** Собеседник прочитал сообщение (событие приходит автору прочитанного). */
  onMessageRead?: (event: ChatMessageReadEvent) => void;
}

export interface ChatSocketApi {
  status: ChatConnectionStatus;
  /** Отправка: сокет при живом соединении, иначе REST-фолбэк. */
  sendMessage: (chatId: string, payload: SendMessagePayload) => Promise<ChatMessage>;
  /** Отметка прочтения: сокет при живом соединении, иначе REST-фолбэк. */
  markRead: (chatId: string, lastMessageId: string) => Promise<void>;
}

function resolveSocketUrl(): string {
  const configured = import.meta.env.VITE_CHAT_WS_URL;
  if (configured) return configured;
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3009`;
  }
  return window.location.origin;
}

export function useChatSocket(handlers: ChatSocketHandlers = {}): ChatSocketApi {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [status, setStatus] = useState<ChatConnectionStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);

  /**
   * Слушатели живут в ref: обработчики страницы пересоздаются на каждом рендере
   * (замыкание на текущий чат и кэш), а пересобирать соединение на каждый рендер
   * нельзя — сокет отваливался бы и переподключался на каждом нажатии клавиши.
   */
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!accessToken) {
      setStatus('offline');
      return undefined;
    }

    let disposed = false;
    let manualRetries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const socket = io(`${resolveSocketUrl()}/chat`, {
      // Основной путь авторизации — `auth.token` (query-строка попадает в логи
      // прокси и сервера, см. README), `transports` — websocket с фолбэком на polling.
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 8_000,
    });
    socketRef.current = socket;

    const onConnect = () => {
      manualRetries = 0;
      setStatus('online');
    };
    const onDisconnect = (reason: string) => {
      if (disposed) return;
      setStatus('offline');
      // Сервер разорвал соединение сам (невалидный токен) — socket.io такое
      // соединение не восстанавливает, повторяем вручную ограниченное число раз.
      if (reason === 'io server disconnect' && manualRetries < MANUAL_RETRY_LIMIT) {
        manualRetries += 1;
        retryTimer = setTimeout(() => {
          if (!disposed) {
            setStatus('connecting');
            socket.connect();
          }
        }, MANUAL_RETRY_DELAY_MS);
      }
    };
    const onConnectError = () => {
      if (!disposed) setStatus('offline');
    };
    const onReconnectAttempt = () => {
      if (!disposed) setStatus('connecting');
    };
    const onMessageNew = (message: ChatMessage) => handlersRef.current.onMessageNew?.(message);
    const onMessageRead = (event: ChatMessageReadEvent) =>
      handlersRef.current.onMessageRead?.(event);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('message:new', onMessageNew);
    socket.on('message:read', onMessageRead);

    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('message:new', onMessageNew);
      socket.off('message:read', onMessageRead);
      // `disconnect()`, а не `close()`: соединение снимается полностью, иначе
      // после размонтирования остался бы живой менеджер с авто-переподключением.
      socket.disconnect();
      socketRef.current = null;
    };
    // Зависимость — только токен: смена обработчиков не должна рвать соединение.
  }, [accessToken]);

  const sendMessage = useCallback(
    async (chatId: string, payload: SendMessagePayload): Promise<ChatMessage> => {
      const socket = socketRef.current;
      if (socket?.connected) {
        // Ack таймаутится только при мёртвом соединении. В этом случае НЕ уходим в
        // REST-фолбэк: сообщение могло уже сохраниться на сервере, и повторный
        // POST создал бы дубль. Фолбэк — только для честно разорванного сокета.
        const ack = (await socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck('message:send', { chatId, ...payload })) as unknown as ChatAck<{
          message: ChatMessage;
        }>;
        if (ack && ack.ok) return ack.message;
        throw new Error(ack?.error ?? 'Не удалось отправить сообщение');
      }
      return sendChatMessage(chatId, payload);
    },
    [],
  );

  const markRead = useCallback(async (chatId: string, lastMessageId: string): Promise<void> => {
    const socket = socketRef.current;
    if (socket?.connected) {
      const ack = (await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('message:read', { chatId, lastMessageId })) as unknown as ChatAck<{
        readAt: string;
      }>;
      if (ack && ack.ok) return;
      throw new Error(ack?.error ?? 'Не удалось отметить прочтение');
    }
    await markChatRead(chatId, lastMessageId);
  }, []);

  return { status, sendMessage, markRead };
}
