import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDirectChat, listMessages, listMessagesBefore, listMyChats } from '../../api/chat';
import { sendMessageRest } from '../../api/chat';
import type { ChatSummary, MessageView } from '../../types/chat';

/**
 * Переписка клиента с менеджером (DS-004, `chat.md`).
 *
 * Кто такой «менеджер»: правила привязки нет ни в контракте М5.1, ни в ПЛАН
 * (открытый вопрос `chat.md` п. 10.1). Портал выбирает детерминированно:
 *   1. если у пользователя уже есть DIRECT-чат — открываем его (самый свежий,
 *      сервер сортирует список по последнему сообщению);
 *   2. если переписок несколько — показываем переключатель, а не «склеенную»
 *      ленту: история разных менеджеров не должна сливаться;
 *   3. если DIRECT-чата нет — создаём его с сотрудником из
 *      `VITE_MANAGER_USER_ID` (идемпотентно на бэкенде).
 *
 * Справочник `/api/users` закрыт для роли CLIENT, поэтому id менеджера приходит
 * конфигурацией, а не запросом: без него портал честно сообщает, что чат
 * недоступен, вместо выдуманного собеседника (см. README, «Ограничения»).
 */

const CHAT_ID_STORAGE_KEY = 'cleaning-ops-portal-chat-id';

export function readStoredChatId(): string | null {
  try {
    return window.localStorage.getItem(CHAT_ID_STORAGE_KEY);
  } catch {
    // Приватный режим браузера может запрещать localStorage — портал не должен
    // падать из-за кэша подсказки.
    return null;
  }
}

export function storeChatId(chatId: string): void {
  try {
    window.localStorage.setItem(CHAT_ID_STORAGE_KEY, chatId);
  } catch {
    /* см. readStoredChatId */
  }
}

export interface ChatResolution {
  chats: ChatSummary[];
  chatId: string | null;
  /** Переключение на другую переписку (если менеджеров несколько). */
  selectChat: (chatId: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Причина недоступности: сервис чата не ответил или нет id менеджера. */
  unavailableReason: string | null;
  refetch: () => void;
}

export function useChatResolution(): ChatResolution {
  const managerId = import.meta.env.VITE_MANAGER_USER_ID;
  const [selected, setSelected] = useState<string | null>(() => readStoredChatId());
  const queryClient = useQueryClient();

  const chats = useQuery({
    queryKey: ['chat', 'chats'],
    queryFn: listMyChats,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  /**
   * Защита от двойного создания DIRECT-чата.
   *
   * `createDirectChat` идемпотентен по паре участников (README chat-service), но
   * проверка там — `findFirst` + `create` без транзакции и без уникального
   * индекса на пару, поэтому **два параллельных запроса создают два чата**.
   * Наблюдалось живьём: React StrictMode в dev вызывает эффект дважды, и портал
   * создавал дубль. Флаг ниже гасит второй вызов на клиенте; серверную гонку
   * клиент закрыть не может — это дефект chat-service (описан в отчёте М5.4).
   */
  const creatingRef = useRef(false);

  const directChats = useMemo(
    () => (chats.data ?? []).filter((chat) => chat.type === 'direct'),
    [chats.data],
  );

  /**
   * Создание DIRECT-чата, когда переписки ещё нет. `enabled` по условию «есть id
   * менеджера», поэтому при пустой конфигурации запрос не уходит вовсе.
   */
  const create = useMutation({
    mutationFn: (participantId: string) => createDirectChat(participantId),
    onSuccess: (chat) => {
      storeChatId(chat.id);
      setSelected(chat.id);
      void queryClient.invalidateQueries({ queryKey: ['chat', 'chats'] });
    },
  });

  useEffect(() => {
    if (!chats.isSuccess || directChats.length > 0 || !managerId) return;
    if (creatingRef.current || create.isPending || create.isSuccess) return;
    creatingRef.current = true;
    create.mutate(managerId, {
      // Снимаем флаг при ошибке/успехе: успешный чат придёт в списке, и повтор
      // не понадобится; при ошибке пользователь сможет повторить (например,
      // перезайдя на экран).
      onSettled: () => {
        creatingRef.current = false;
      },
    });
  }, [chats.isSuccess, directChats.length, managerId]);

  // Выбранным считается сохранённый чат, если он всё ещё среди своих; иначе —
  // самый свежий. Проверка по списку сервера обязательна: в localStorage мог
  // остаться чат, к которому у пользователя больше нет доступа, и открывать его
  // «на веру» нельзя (сервер ответит 403 — но лучше не делать запрос вообще).
  const chatId = useMemo(() => {
    if (directChats.length === 0) return create.data?.id ?? null;
    if (selected && directChats.some((chat) => chat.id === selected)) return selected;
    return directChats[0].id;
  }, [create.data?.id, directChats, selected]);

  const selectChat = useCallback((next: string) => {
    storeChatId(next);
    setSelected(next);
  }, []);

  const unavailableReason = chats.isError
    ? 'Чат временно недоступен. Данные заявок доступны в разделе «Заявки».'
    : chats.isSuccess && directChats.length === 0 && !managerId && !create.isPending
      ? 'Переписка ещё не создана, а менеджер не задан в настройках портала (VITE_MANAGER_USER_ID).'
      : null;

  return {
    chats: directChats,
    chatId,
    selectChat,
    isLoading: chats.isLoading || (create.isPending && directChats.length === 0),
    isError: chats.isError,
    error: chats.error,
    unavailableReason,
    refetch: () => void chats.refetch(),
  };
}

/** История переписки с подгрузкой вверх по курсору `before`. */
export function useChatHistory(chatId: string | null) {
  const first = useQuery({
    queryKey: ['chat', 'messages', chatId],
    queryFn: () => listMessages(chatId as string, 50),
    enabled: Boolean(chatId),
    staleTime: 10_000,
    retry: false,
  });

  // Догруженные вверх страницы: сервер отдаёт их от старых к новым, поэтому
  // список склеивается «старые + первая страница», без переворачивания.
  const [older, setOlder] = useState<{ chatId: string | null; items: MessageView[]; cursor: string | null; hasMore: boolean }>(
    { chatId: null, items: [], cursor: null, hasMore: false },
  );

  // Смена чата сбрасывает накопленную историю: «хвост» другой переписки в ленте
  // выглядел бы как чужие сообщения.
  useEffect(() => {
    setOlder({ chatId, items: [], cursor: null, hasMore: false });
  }, [chatId]);

  const loadOlder = useCallback(async () => {
    const cursor = older.cursor ?? first.data?.nextBefore ?? null;
    const hasMore = older.cursor ? older.hasMore : (first.data?.hasMore ?? false);
    if (!chatId || !cursor || !hasMore) return;
    const page = await listMessagesBefore(chatId, cursor, 50);
    setOlder((current) => ({
      chatId,
      items: [...page.items, ...current.items],
      cursor: page.nextBefore,
      hasMore: page.hasMore,
    }));
  }, [chatId, first.data?.hasMore, first.data?.nextBefore, older.cursor, older.hasMore]);

  const items = useMemo(
    () => [...(older.chatId === chatId ? older.items : []), ...(first.data?.items ?? [])],
    [chatId, first.data?.items, older.chatId, older.items],
  );

  return {
    items,
    isLoading: first.isLoading,
    isError: first.isError,
    error: first.error,
    hasMore: older.cursor ? older.hasMore : (first.data?.hasMore ?? false),
    loadOlder,
    refetch: first.refetch,
  };
}

/** Отправка с фолбэком на REST, если сокет не подключён (контракт М5.1). */
export function useSendMessage(chatId: string | null) {
  return useMutation({
    mutationFn: async ({ text, socketSend }: { text: string; socketSend: () => Promise<MessageView> }) => {
      try {
        return await socketSend();
      } catch {
        // Основной путь — WebSocket; REST-фолбэк спасает, когда WS-прокси нет
        // (корпоративный прокси, отключённые websocket-транспорты).
        return await sendMessageRest(chatId as string, text);
      }
    },
  });
}

/** Автоскролл к последнему сообщению, если пользователь у нижней границы ленты. */
export function useAutoScroll(dependency: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    setHasNewBelow(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Если пользователь читает историю выше, не «дёргаем» скролл: показываем
    // плашку «↓ Новое сообщение» (chat.md п. 4.2).
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (atBottom) scrollToBottom();
    else setHasNewBelow(true);
  }, [dependency, scrollToBottom]);

  return { containerRef, hasNewBelow, scrollToBottom };
}
