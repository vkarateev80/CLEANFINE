import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { useChatSocket } from '../../hooks/useChatSocket';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { localDate, localTime } from '../../lib/date';
import { isForbidden } from '../../lib/http';
import { useAuthStore } from '../../stores/authStore';
import { isNetworkError, useNetStore } from '../../stores/netStore';
import { useQueueStore } from '../../stores/queueStore';
import type { MessageView } from '../../types/chat';
import {
  chatTitle,
  useAutoScroll,
  useChatDetail,
  useChatHistory,
  useMyChats,
  useSendMessage,
} from './useChats';

const MAX_MESSAGE_LENGTH = 4000;

/** Переписка (chat.md §2.2): лента, статусы, composer; без сети — очередь. */
export function ChatThreadPage() {
  const { chatId = '' } = useParams();
  const me = useAuthStore((s) => s.user?.id);
  const online = useNetStore((s) => s.online);
  const queryClient = useQueryClient();
  const chats = useMyChats();
  const detail = useChatDetail(chatId);
  const history = useChatHistory(chatId);
  const socket = useChatSocket(Boolean(chatId) && !detail.isError);
  const sendMutation = useSendMessage(chatId);
  const enqueue = useQueueStore((s) => s.enqueue);
  const queued = useQueueStore((s) =>
    s.items.filter(
      (it) => it.kind === 'chat_message' && it.payload.chatId === chatId && it.status !== 'synced',
    ),
  );

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentLocally, setSentLocally] = useState<MessageView[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const DRAFT_KEY = `op-chat-draft:${chatId}`;
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      if (loadedRef.current !== DRAFT_KEY) {
        loadedRef.current = DRAFT_KEY;
        setDraft(window.localStorage.getItem(DRAFT_KEY) ?? '');
        return;
      }
      if (draft) window.localStorage.setItem(DRAFT_KEY, draft);
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* приватный режим */
    }
  }, [DRAFT_KEY, draft]);

  const summary = chats.data?.find((chat) => chat.id === chatId) ?? null;
  const title = summary ? chatTitle(summary) : detail.data ? chatTitle(detail.data) : 'Чат';

  const messages = useMemo(() => {
    const map = new Map<string, MessageView>();
    for (const message of [...history.items, ...socket.incoming, ...sentLocally]) {
      if (message.chatId === chatId) map.set(message.id, message);
    }
    return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [chatId, history.items, sentLocally, socket.incoming]);

  const { containerRef, hasNewBelow, scrollToBottom } = useAutoScroll(
    messages.length + queued.length || undefined,
  );

  // Прочтение: только входящие и только при видимой вкладке (chat.md §3.5).
  useEffect(() => {
    if (!chatId || document.visibilityState !== 'visible') return;
    const incoming = messages.filter((message) => message.authorId !== me);
    const last = incoming[incoming.length - 1];
    if (!last) return;
    socket.markRead(chatId, last.id);
  }, [chatId, messages.length, me]);

  // Новые входящие по сокету обновляют счётчики в списке чатов.
  useEffect(() => {
    if (socket.incoming.length > 0)
      void queryClient.invalidateQueries({ queryKey: ['chat', 'chats'] });
  }, [socket.incoming.length, queryClient]);

  const readIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of socket.reads) if (event.chatId === chatId) ids.add(event.messageId);
    return ids;
  }, [chatId, socket.reads]);

  const members = detail.data?.members.filter((member) => member.userId !== me) ?? [];
  const onlineCount = members.filter((member) => socket.onlineUsers.has(member.userId)).length;
  const subtitle =
    socket.status === 'connecting'
      ? 'соединение…'
      : socket.status === 'offline'
        ? 'нет соединения — переподключение…'
        : onlineCount > 0
          ? `в сети: ${onlineCount}`
          : members.length > 0
            ? `участников: ${members.length}`
            : undefined;

  async function handleSend() {
    const text = draft.trim();
    if (!chatId || text === '' || sendMutation.isPending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setSendError('Сообщение длиннее 4000 символов');
      return;
    }
    setSendError(null);
    const clientMessageId = crypto.randomUUID();
    if (!online) {
      enqueue({
        kind: 'chat_message',
        payload: { chatId, text, clientMessageId },
        label: `Сообщение в чат · «${text.slice(0, 40)}»`,
        idempotencyKey: `chat:${clientMessageId}`,
      });
      setDraft('');
      return;
    }
    try {
      const sent = await sendMutation.mutateAsync({
        text,
        clientMessageId,
        socketSend: (id) => socket.send(chatId, text, id),
      });
      setSentLocally((current) => [...current, sent]);
      setDraft('');
      void history.refetch();
      void queryClient.invalidateQueries({ queryKey: ['chat', 'chats'] });
    } catch (caught) {
      if (isNetworkError(caught)) {
        enqueue({
          kind: 'chat_message',
          payload: { chatId, text, clientMessageId },
          label: `Сообщение в чат · «${text.slice(0, 40)}»`,
          idempotencyKey: `chat:${clientMessageId}`,
        });
        setDraft('');
        return;
      }
      setSendError(errorMessage(caught));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && window.innerWidth >= 1024) {
      event.preventDefault();
      void handleSend();
    }
  }

  const forbidden = detail.isError && isForbidden(detail.error);

  return (
    <FullscreenLayout
      title={title}
      subtitle={subtitle}
      backTo="/chats"
      offlineText="Нет соединения — сообщения уйдут при подключении"
      testId="chat_thread_page"
    >
      {forbidden ? (
        <EmptyState title="Чат недоступен" hint="Вы не участник этого чата." />
      ) : (
        <div className="-mx-4 -mt-4 flex min-h-[calc(100dvh-6rem)] flex-col">
          {socket.status === 'offline' && online && (
            <div className="px-4 pt-3">
              <SoftWarning>Соединение потеряно — переподключение…</SoftWarning>
            </div>
          )}
          <div
            ref={containerRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
            aria-live="polite"
            data-testid="chat_messages_list"
          >
            {history.hasMore ? (
              <Button
                variant="ghost"
                size="sm"
                className="mx-auto"
                onClick={() => void history.loadOlder()}
              >
                Загрузить историю
              </Button>
            ) : messages.length > 0 ? (
              <div className="mx-auto text-xs text-neutral-400">Начало переписки</div>
            ) : null}

            {history.isError ? (
              <ErrorBanner
                error={new Error('Не удалось загрузить переписку')}
                onRetry={() => void history.refetch()}
              />
            ) : history.isLoading ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={[
                      'h-10 w-3/5 animate-pulse rounded-2xl bg-neutral-200',
                      i % 2 ? 'self-end' : 'self-start',
                    ].join(' ')}
                  />
                ))}
              </div>
            ) : messages.length === 0 && queued.length === 0 ? (
              <EmptyState
                title="Напишите первое сообщение"
                hint="Опишите вопрос — ответ придёт в это окно"
              />
            ) : (
              messages.map((message, index) => {
                const previous = messages[index - 1];
                const newDay =
                  !previous || previous.createdAt.slice(0, 10) !== message.createdAt.slice(0, 10);
                return (
                  <div key={message.id} className="flex flex-col gap-2">
                    {newDay && (
                      <div className="mx-auto rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                        {localDate(message.createdAt)}
                      </div>
                    )}
                    <Bubble
                      message={message}
                      mine={message.authorId === me}
                      read={readIds.has(message.id)}
                      delivered={message.deliveredAt !== null}
                    />
                  </div>
                );
              })
            )}
            {queued.map((item) => (
              <div
                key={item.id}
                className="flex justify-end"
                data-testid={`chat_message_pending_${item.id}`}
              >
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-dashed border-primary-500 bg-white px-3 py-2 text-sm text-neutral-900">
                  {String(item.payload.text)}
                  <span className="ml-2 font-mono text-[10px] text-neutral-400">
                    {item.status === 'failed'
                      ? `Не отправлено · ${item.lastError ?? ''}`
                      : 'Отправляется…'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {hasNewBelow && (
            <div className="sticky bottom-20 flex justify-center">
              <Button variant="primary" size="sm" onClick={() => scrollToBottom('smooth')}>
                ↓ Новое сообщение
              </Button>
            </div>
          )}

          <div className="op-bottom-bar sticky bottom-0 border-t border-neutral-200 bg-white px-3 pt-2">
            {sendError && <p className="mb-1 text-xs text-danger-600">{sendError}</p>}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Напишите сообщение…"
                value={draft}
                disabled={sendMutation.isPending || forbidden}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="chat_input_field"
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
                aria-label="Отправить сообщение"
                onClick={() => void handleSend()}
                disabled={draft.trim() === '' || sendMutation.isPending || forbidden}
                data-testid="chat_send_button"
              >
                ➤
              </button>
            </div>
            {draft.length >= 3800 && (
              <p className="mt-1 text-right font-mono text-[10px] text-neutral-400">
                {draft.length} / {MAX_MESSAGE_LENGTH}
              </p>
            )}
          </div>
        </div>
      )}
    </FullscreenLayout>
  );
}

function Bubble({
  message,
  mine,
  read,
  delivered,
}: {
  message: MessageView;
  mine: boolean;
  read: boolean;
  delivered: boolean;
}) {
  const statusLabel = read ? 'Прочитано' : delivered ? 'Доставлено' : 'Отправлено';
  return (
    <div
      className={['flex', mine ? 'justify-end' : 'justify-start'].join(' ')}
      data-testid={`chat_message_bubble_${message.id}`}
    >
      <div
        className={[
          'max-w-[80%] whitespace-pre-wrap px-3 py-2 text-sm shadow-sm',
          mine
            ? 'rounded-2xl rounded-br-md bg-primary-500 text-white'
            : 'rounded-2xl rounded-bl-md border border-neutral-200 bg-white text-neutral-900',
        ].join(' ')}
      >
        {message.text}
        {message.attachmentIds.length > 0 && (
          <span className="ml-1 text-xs opacity-80">📎 {message.attachmentIds.length}</span>
        )}
        <span
          className={[
            'ml-2 font-mono text-[10px]',
            mine ? 'text-white/70' : 'text-neutral-400',
          ].join(' ')}
        >
          {localTime(message.createdAt)}
          {mine && (
            <span
              title={statusLabel}
              aria-label={statusLabel}
              data-testid={`chat_message_status_${message.id}`}
              className={read ? 'ml-0.5 font-semibold' : undefined}
            >
              {read || delivered ? ' ✓✓' : ' ✓'}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
