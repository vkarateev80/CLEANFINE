import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { createChat, getChat, listChatMessages, listMyChats } from '../../api/chat';
import { listUsers } from '../../api/users';
import { CHAT_PAGE_LIMIT, type ChatSocketApi } from '../../hooks/useChatSocket';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import { useAuthStore } from '../../stores/authStore';
import type { SessionUser } from '../../types';
import type {
  ChatDetail,
  ChatMessage,
  ChatMessagesPage,
  ChatSummary,
  CreateChatPayload,
} from '../../types/chat';

/**
 * Данные чатов (М5.3): список, история, отправка, отметка прочтения.
 *
 * Ключи запросов и правки кэша собраны здесь, а не в компонентах: сообщение
 * приходит и по REST (первая страница), и по WebSocket (`message:new`), и оба
 * пути обязаны класть его в ОДИН кэш — иначе переписка показала бы дубль или
 * потеряла бы строку.
 */

export const CHAT_CHATS_KEY = ['chat-chats'] as const;
export const chatMessagesKey = (chatId: string) => ['chat-messages', chatId] as const;
export const chatDetailKey = (chatId: string) => ['chat-detail', chatId] as const;

/** Список чатов текущего пользователя (сортировка — на бэкенде, по последнему сообщению). */
export function useMyChats() {
  return useQuery({
    queryKey: CHAT_CHATS_KEY,
    queryFn: listMyChats,
    refetchOnWindowFocus: false,
  });
}

/**
 * История чата страницами вверх (`before` = `nextBefore` предыдущей страницы).
 * `useInfiniteQuery`, а не ручной `before` в состоянии: react-query сам хранит
 * уже загруженные страницы, и подгрузка вверх не сбрасывает переписку.
 */
export function useChatMessages(chatId: string | null) {
  return useInfiniteQuery({
    queryKey: ['chat-messages', chatId],
    enabled: Boolean(chatId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listChatMessages(chatId as string, {
        limit: CHAT_PAGE_LIMIT,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    getNextPageParam: (last: ChatMessagesPage) =>
      last.hasMore && last.nextBefore ? last.nextBefore : undefined,
    // Переписка живёт в реальном времени: фоновая перезагрузка сбрасывала бы
    // прокрутку вверх, поэтому обновляем только по явному действию.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/**
 * Плоский список сообщений: страницы приходят «свежая первой», а внутри
 * страницы — от старых к новым, поэтому разворачиваем САМИ страницы, а не
 * сообщения (иначе переписка перемешалась бы).
 */
export function flattenMessages(
  data: InfiniteData<ChatMessagesPage> | undefined,
): ChatMessage[] {
  if (!data) return [];
  const list: ChatMessage[] = [];
  for (let index = data.pages.length - 1; index >= 0; index -= 1) {
    for (const item of data.pages[index].items) list.push(item);
  }
  return list;
}

/** Дописывает сообщение в самый свежий край кэша, если его там ещё нет (идемпотентно). */
export function appendMessageToCache(
  queryClient: QueryClient,
  message: ChatMessage,
): void {
  queryClient.setQueryData<InfiniteData<ChatMessagesPage>>(
    chatMessagesKey(message.chatId),
    (data) => {
      // Кэша нет — чат ещё не открывали: создавать пустую запись не нужно,
      // первую страницу всё равно загрузит сама страница переписки.
      if (!data || data.pages.length === 0) return data;
      const newest = data.pages[0];
      if (newest.items.some((item) => item.id === message.id)) return data;
      const pages = [...data.pages];
      pages[0] = { ...newest, items: [...newest.items, message] };
      return { ...data, pages };
    },
  );
}

/** Обновляет превью и счётчик непрочитанных в списке чатов по входящему сообщению. */
export function bumpChatList(
  queryClient: QueryClient,
  message: ChatMessage,
  openChatId: string | null,
  currentUserId: string | null,
): void {
  const chats = queryClient.getQueryData<ChatSummary[]>(CHAT_CHATS_KEY);
  if (!chats) return;
  const known = chats.some((chat) => chat.id === message.chatId);
  if (!known) {
    // Чат появился впервые (нас добавили участником) — список нужно перезапросить.
    void queryClient.invalidateQueries({ queryKey: CHAT_CHATS_KEY });
    return;
  }
  queryClient.setQueryData<ChatSummary[]>(
    CHAT_CHATS_KEY,
    chats.map((chat) => {
      if (chat.id !== message.chatId) return chat;
      const fromMe = currentUserId !== null && message.authorId === currentUserId;
      const isOpen = chat.id === openChatId;
      return {
        ...chat,
        lastMessage: {
          id: message.id,
          authorId: message.authorId,
          text: message.text,
          attachmentIds: message.attachmentIds,
          createdAt: message.createdAt,
        },
        // Открытый чат считается прочитанным сразу: его сообщения пользователь
        // видит на экране, и «+1» на нём выглядело бы ошибкой.
        unreadCount: fromMe || isOpen ? chat.unreadCount : chat.unreadCount + 1,
      };
    }),
  );
}

/** Сбрасывает счётчик непрочитанных чата после отметки прочтения. */
function clearUnread(queryClient: QueryClient, chatId: string): void {
  queryClient.setQueryData<ChatSummary[]>(CHAT_CHATS_KEY, (chats) =>
    chats?.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)),
  );
}

/**
 * Справочник сотрудников для имён авторов сообщений. В админке чат показывают
 * роли ADMIN/SUPERVISOR (у `GET /api/users` стоит `@Roles`), у остальных имён нет —
 * карточка покажет короткий id вместо пустого места.
 */
export function useChatUserNames(): SessionUser[] | undefined {
  const allowed = useCanAssignTicket();
  const query = useQuery({
    queryKey: ['chat-users'],
    enabled: allowed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await listUsers({ take: 100 })).items,
  });
  return query.data;
}

/** Имя сотрудника по id; null — если справочник недоступен (роль без прав). */
export function chatUserName(
  users: SessionUser[] | undefined,
  id: string,
): string | null {
  return users?.find((user) => user.id === id)?.fullName ?? null;
}

/** Создание чата: список чатов после успеха перезапрашиваем, новый чат в списке. */
export function useCreateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateChatPayload) => createChat(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAT_CHATS_KEY });
    },
  });
}

/**
 * Чат заявки/объекта по ссылке (М5.3): «найди в своих или создай, если ещё нет».
 *
 * Почему не только `POST /chats`. Создавать `ticket`/`object`-чаты могут лишь
 * ADMIN/SUPERVISOR (`assertStaff` в chat-service). Оператору и заказчику чат
 * доступен только как участнику, поэтому для них сначала пробуем найти чат в
 * своём списке, а при отсутствии — честно говорим «чат ещё не создан», не
 * устраивая 403 на каждой загрузке карточки.
 */
export function useChatByReference(kind: 'ticket' | 'object', refId: string | undefined) {
  const canCreate = useCanAssignTicket();
  return useQuery({
    queryKey: ['chat-ref', kind, refId, canCreate],
    enabled: Boolean(refId),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ChatDetail | null> => {
      const chats = await listMyChats();
      const existing = chats.find((chat) =>
        kind === 'ticket' ? chat.ticketId === refId : chat.objectId === refId,
      );
      if (existing) return getChat(existing.id);
      if (!canCreate) return null;
      return createChat(
        kind === 'ticket' ? { type: 'ticket', ticketId: refId } : { type: 'object', objectId: refId },
      );
    },
  });
}

export interface ChatRoomData {
  chatId: string | null;
  messages: ChatMessage[];
  users: SessionUser[] | undefined;
  currentUserId: string | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  sending: boolean;
  sendError: unknown;
  send: (text: string) => Promise<void>;
}

/**
 * «Комната» чата: история + отправка + отметка прочтения. Сокет передаётся
 * снаружи (его слушатели должны быть зарегистрированы страницей целиком), а
 * здесь используются только его методы `sendMessage`/`markRead`.
 */
export function useChatRoom(chatId: string | null, socket: ChatSocketApi): ChatRoomData {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const users = useChatUserNames();
  const query = useChatMessages(chatId);

  const messages = useMemo(() => flattenMessages(query.data), [query.data]);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const { sendMessage, markRead } = socket;

  const send = useCallback(
    async (text: string): Promise<void> => {
      const target = chatId;
      if (!target) return;
      setSending(true);
      setSendError(null);
      try {
        const message = await sendMessage(target, { text });
        appendMessageToCache(queryClient, message);
        // Своё сообщение не увеличивает счётчик непрочитанных (открытый чат — прочитан).
        bumpChatList(queryClient, message, target, currentUserId);
      } catch (error) {
        setSendError(error);
        throw error;
      } finally {
        setSending(false);
      }
    },
    [chatId, queryClient, sendMessage, currentUserId],
  );

  /**
   * Отметка прочтения при открытии чата и на каждое новое сообщение в нём.
   * Повторный вызов на тот же id не отправляем (`markedRef`) — сервис
   * идемпотентен, но лишний трафик на каждый рендер не нужен.
   */
  const markedRef = useRef<Record<string, string>>({});
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!chatId || !lastMessageId) return;
    const last = messages[messages.length - 1];
    if (currentUserId !== null && last.authorId === currentUserId) return;
    if (markedRef.current[chatId] === lastMessageId) return;
    markedRef.current[chatId] = lastMessageId;
    markRead(chatId, lastMessageId)
      .then(() => clearUnread(queryClient, chatId))
      .catch(() => {
        // Отметка прочтения — не критичное действие: переписка уже видна,
        // а счётчик сбросится при следующем открытии чата.
      });
  }, [chatId, lastMessageId, messages, currentUserId, markRead, queryClient]);

  const loadOlder = useCallback(async (): Promise<void> => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  const refetch = useCallback((): void => {
    void query.refetch();
  }, [query]);

  return {
    chatId,
    messages,
    users,
    currentUserId,
    isLoading: query.isLoading,
    error: query.error,
    refetch,
    hasMore: query.hasNextPage,
    loadingOlder: query.isFetchingNextPage,
    loadOlder,
    sending,
    sendError,
    send,
  };
}

/** Кэш детали чата (участники и `lastReadAt`) — шапка переписки. */
export function useChatDetail(chatId: string | null) {
  return useQuery({
    queryKey: chatDetailKey(chatId as string),
    enabled: Boolean(chatId),
    staleTime: 60 * 1000,
    queryFn: () => getChat(chatId as string),
  });
}
