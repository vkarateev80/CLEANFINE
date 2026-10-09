import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getChat,
  listMessages,
  listMessagesBefore,
  listMyChats,
  sendMessageRest,
} from '../../api/chat';
import { useAuthStore } from '../../stores/authStore';
import type { ChatSummary, MessageView } from '../../types/chat';

/** Заголовок чата по правилу chat.md §3.1. */
export function chatTitle(chat: Pick<ChatSummary, 'type' | 'title'>): string {
  if (chat.title) return chat.title;
  switch (chat.type) {
    case 'ticket':
      return 'Чат заявки';
    case 'object':
      return 'Чат объекта';
    case 'direct':
      return 'Личные сообщения';
    case 'system':
      return 'Системные уведомления';
    default:
      return 'Чат';
  }
}

export const CHAT_TYPE_ICON: Record<string, string> = {
  object: '🏢',
  ticket: '🎫',
  direct: '👤',
  system: '📣',
};

export function useMyChats() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['chat', 'chats'],
    queryFn: listMyChats,
    enabled: Boolean(accessToken),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useChatDetail(chatId: string | null) {
  return useQuery({
    queryKey: ['chat', 'detail', chatId],
    queryFn: () => getChat(chatId as string),
    enabled: Boolean(chatId),
    staleTime: 60_000,
    retry: false,
  });
}

/** История с подгрузкой вверх по курсору `before` (порт из портала). */
export function useChatHistory(chatId: string | null) {
  const first = useQuery({
    queryKey: ['chat', 'messages', chatId],
    queryFn: () => listMessages(chatId as string, 30),
    enabled: Boolean(chatId),
    staleTime: 10_000,
    retry: false,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const [older, setOlder] = useState<{
    chatId: string | null;
    items: MessageView[];
    cursor: string | null;
    hasMore: boolean;
  }>({
    chatId: null,
    items: [],
    cursor: null,
    hasMore: false,
  });

  useEffect(() => {
    setOlder({ chatId, items: [], cursor: null, hasMore: false });
  }, [chatId]);

  const loadOlder = useCallback(async () => {
    const cursor = older.cursor ?? first.data?.nextBefore ?? null;
    const hasMore = older.cursor ? older.hasMore : (first.data?.hasMore ?? false);
    if (!chatId || !cursor || !hasMore) return;
    const page = await listMessagesBefore(chatId, cursor, 30);
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

/** Отправка: WS → REST-фолбэк с тем же clientMessageId (идемпотентно на сервере). */
export function useSendMessage(chatId: string | null) {
  return useMutation({
    mutationFn: async ({
      text,
      clientMessageId,
      socketSend,
    }: {
      text: string;
      clientMessageId: string;
      socketSend: (id: string) => Promise<MessageView>;
    }) => {
      try {
        return await socketSend(clientMessageId);
      } catch {
        return await sendMessageRest(chatId as string, text, clientMessageId);
      }
    },
  });
}

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
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (atBottom) scrollToBottom();
    else setHasNewBelow(true);
  }, [dependency, scrollToBottom]);

  return { containerRef, hasNewBelow, scrollToBottom };
}
