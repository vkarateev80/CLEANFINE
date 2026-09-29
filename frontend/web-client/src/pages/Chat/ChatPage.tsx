import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useAuthStore } from '../../stores/authStore';
import { useAutoScroll, useChatHistory, useChatResolution, useSendMessage } from './useChat';
import { formatDate, formatTime } from '../../lib/format';
import type { MessageView } from '../../types/chat';

/**
 * Экран «Чат с менеджером» (DS-004, `chat.md`).
 *
 * Переписка ведётся только в DIRECT-чате: `OBJECT`/`TICKET`-чаты клиенту не
 * показываются — в объектный чат пишут все сотрудники, для клиента это шум.
 *
 * Если chat-service недоступен, экран переходит в режим «только история» с
 * предупреждением и остаётся ссылка на «Заявки»: клиент не должен остаться без
 * способа сообщить о проблеме (chat.md п. 6).
 */
export function ChatPage() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const resolution = useChatResolution();
  const chatId = resolution.chatId;
  const history = useChatHistory(chatId);
  const socket = useChatSocket(Boolean(chatId) && !resolution.isError);
  const sendMutation = useSendMessage(chatId);

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  /**
   * Сообщения, отправленные через REST-фолбэк.
   *
   * При WS-отправке сервер сам присылает `message:new`, но фолбэк — обычный HTTP:
   * сообщение сохраняется, а в ленте клиента не появляется, пока история не
   * перезапросится. Без этого буфера клиент видел бы «сообщение не ушло» после
   * успешной отправки. Дедупликация по `id` ниже убирает дубль, когда история
   * всё-таки обновится.
   */
  const [sentLocally, setSentLocally] = useState<MessageView[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const DRAFT_KEY = `chat-draft:${chatId ?? 'none'}`;

  /**
   * Черновик переживает закрытие вкладки/клавиатуры: на телефоне набранный текст
   * терять нельзя (chat.md п. 4.3).
   *
   * Загрузка и сохранение — в ОДНОМ эффекте, и `loadedRef` отличает «сменилась
   * переписка» от «пользователь набрал текст». Два отдельных эффекта здесь
   * опасны: эффект сохранения успел бы записать пустое состояние (`draft` ещё не
   * загружен) в ключ новой переписки и стереть её черновик.
   */
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
      /* приватный режим браузера — черновик просто не сохранится */
    }
  }, [DRAFT_KEY, draft]);

  /**
   * Лента = история + оптимистичные сообщения из сокета. `message:new` приходит
   * и на чужие, и на свои сообщения-с-другого-устройства, поэтому дедупликация по
   * `id` обязательна: без неё сообщение показывалось бы дважды.
   */
  const messages = useMemo(() => {
    const map = new Map<string, MessageView>();
    for (const message of [...history.items, ...socket.incoming, ...sentLocally]) {
      if (message.chatId === chatId) map.set(message.id, message);
    }
    return Array.from(map.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }, [chatId, history.items, sentLocally, socket.incoming]);

  const { containerRef, hasNewBelow, scrollToBottom } = useAutoScroll(messages.length || undefined);

  // Отметка прочтения: только для входящих, только когда окно активно. Иначе
  // телефон в кармане «прочитал» бы сообщения, и менеджер получил ложный сигнал.
  useEffect(() => {
    if (!chatId || document.visibilityState !== 'visible') return;
    const incoming = messages.filter((message) => message.authorId !== currentUserId);
    const lastIncoming = incoming[incoming.length - 1];
    if (!lastIncoming) return;
    socket.markRead(chatId, lastIncoming.id);
  }, [chatId, messages.length, currentUserId]);

  // Галочки `✓` → `✓✓` для своих сообщений: сервер уведомляет автора событием.
  const readMessageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of socket.reads) {
      if (event.chatId === chatId) ids.add(event.messageId);
    }
    return ids;
  }, [chatId, socket.reads]);

  const managerName = useMemo(() => {
    const chat = resolution.chats.find((item) => item.id === chatId);
    if (chat?.title) return chat.title;
    return 'Менеджер';
  }, [chatId, resolution.chats]);

  const managerId = useMemo(() => {
    const chat = resolution.chats.find((item) => item.id === chatId);
    const other = chat?.lastMessage?.authorId;
    if (other && other !== currentUserId) return other;
    return null;
  }, [chatId, currentUserId, resolution.chats]);

  const managerOnline = Boolean(managerId && socket.onlineUsers.has(managerId));

  async function handleSend() {
    const text = draft.trim();
    if (!chatId || text === '' || sendMutation.isPending) return;
    setSendError(null);
    try {
      const sent = await sendMutation.mutateAsync({
        text,
        socketSend: (clientMessageId) => socket.send(chatId, text, clientMessageId),
      });
      // Буфер фолбэка наполняется всегда: при WS-отправке сервер вернёт то же
      // сообщение (по id), и дедупликация в `messages` оставит одну копию.
      setSentLocally((current) => [...current, sent]);
      setDraft('');
      // История перезапрашивается, чтобы после перезагрузки страницы лента была
      // полной и в правильном порядке.
      void history.refetch();
    } catch (caught) {
      setSendError(errorMessage(caught));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // На телефоне Enter — перенос строки (отправка кнопкой); на десктопе
    // (`lg:`) Enter отправляет, Shift+Enter переносит (chat.md п. 4.3).
    if (event.key === 'Enter' && !event.shiftKey && window.innerWidth >= 1024) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (resolution.isLoading) {
    return <ChatSkeleton />;
  }

  // Сервис чата недоступен: режим «только история» + выход в заявки.
  if (resolution.isError || resolution.unavailableReason) {
    return (
      <div className="flex flex-col gap-3" data-testid="portal-chat-thread">
        <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">Чат с менеджером</h1>
        {resolution.isError ? (
          <ErrorBanner error={resolution.error} onRetry={resolution.refetch} />
        ) : (
          <SoftWarning>{resolution.unavailableReason}</SoftWarning>
        )}
        <EmptyState
          title="Чат временно недоступен"
          hint="Сообщить о проблеме можно заявкой — менеджер получит её сразу."
          action={
            <Link to="/tickets?new=1">
              <Button variant="primary" className="min-h-[44px]">
                Создать заявку
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (!chatId) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">Чат с менеджером</h1>
        <EmptyState
          title="Переписка не найдена"
          hint="Обратитесь к менеджеру — он откроет чат с вами."
          action={
            <Link to="/tickets?new=1">
              <Button variant="primary" className="min-h-[44px]">
                Создать заявку
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="-m-4 flex flex-col" data-testid="portal-chat">
      {/* Шапка переписки */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-neutral-900">{managerName}</h1>
            <p className="text-xs text-neutral-500" data-testid="portal-chat-status">
              {socket.status === 'connecting' && 'соединение…'}
              {socket.status === 'offline' && 'нет соединения — переподключение…'}
              {socket.status === 'online' &&
                (managerOnline ? (
                  <span className="flex items-center gap-1 text-success-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
                    онлайн
                  </span>
                ) : (
                  'менеджер не в сети'
                ))}
            </p>
          </div>

          {/* Переключатель переписок: если менеджер сменился, истории не сливаем. */}
          {resolution.chats.length > 1 && (
            <select
              className="max-w-[10rem] rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700"
              value={chatId}
              onChange={(event) => resolution.selectChat(event.target.value)}
              aria-label="Выбрать переписку"
            >
              {resolution.chats.map((chat, index) => (
                <option key={chat.id} value={chat.id}>
                  {chat.title ?? `Менеджер ${index + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {socket.status === 'offline' && (
        <div className="px-4 pt-3">
          <SoftWarning>Соединение потеряно — переподключение…</SoftWarning>
        </div>
      )}

      {/* Лента сообщений */}
      <div
        ref={containerRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
        aria-live="polite"
        data-testid="portal-chat-thread"
      >
        {history.hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="mx-auto"
            onClick={() => void history.loadOlder()}
          >
            Загрузить историю
          </Button>
        )}

        {history.isError ? (
          <ErrorBanner error={history.error} onRetry={() => void history.refetch()} />
        ) : history.isLoading ? (
          <ChatSkeleton inline />
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-2 py-6">
            <EmptyState
              title="Напишите менеджеру"
              hint="Опишите вопрос — ответ придёт в это окно."
            />
            <div className="flex justify-center gap-2">
              {['Уточнить по заявке', 'Согласовать доступ'].map((hint) => (
                <button
                  key={hint}
                  type="button"
                  className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700"
                  onClick={() => {
                    setDraft(hint);
                    inputRef.current?.focus();
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay =
              !previous || previous.createdAt.slice(0, 10) !== message.createdAt.slice(0, 10);
            return (
              <div key={message.id} className="flex flex-col gap-2">
                {newDay && (
                  <div className="mx-auto rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                    {formatDate(message.createdAt)}
                  </div>
                )}
                <MessageBubble
                  message={message}
                  mine={message.authorId === currentUserId}
                  read={readMessageIds.has(message.id)}
                  delivered={message.deliveredAt !== null}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {hasNewBelow && (
        <div className="portal-chat-new-pill sticky flex justify-center">
          <Button variant="primary" size="sm" onClick={() => scrollToBottom('smooth')}>
            ↓ Новое сообщение
          </Button>
        </div>
      )}

      {/* Composer. `portal-chat-composer` держит его НАД таб-баром: иначе кнопка
          отправки уходит под фиксированную навигацию и не принимает тапы. */}
      <div className="portal-chat-composer sticky border-t border-neutral-200 bg-white px-3 py-2">
        {sendError && <p className="mb-1 text-xs text-danger-600">{sendError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Написать сообщение…"
            value={draft}
            disabled={sendMutation.isPending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="portal-chat-input"
          />
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
            aria-label="Отправить сообщение"
            onClick={() => void handleSend()}
            disabled={draft.trim() === '' || sendMutation.isPending}
            data-testid="portal-chat-send"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

/** Пузырь сообщения: входящее слева, исходящее справа (`chat.md` п. 4.2). */
function MessageBubble({
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
  // Три состояния (как в мобильном, chat.md §4): ✓ — отправлено,
  // ✓✓ — доставлено (серверный deliveredAt), ✓✓ жирным — прочитано
  // (живое событие message:read, оно же выше по приоритету).
  const statusLabel = read ? 'Прочитано' : delivered ? 'Доставлено' : 'Отправлено';
  return (
    <div className={['flex', mine ? 'justify-end' : 'justify-start'].join(' ')}>
      <div
        className={[
          'max-w-[80%] whitespace-pre-wrap px-3 py-2 text-sm shadow-sm',
          mine
            ? 'rounded-2xl rounded-br-md bg-primary-500 text-white'
            : 'rounded-2xl rounded-bl-md border border-neutral-200 bg-white text-neutral-900',
        ].join(' ')}
      >
        {message.text}
        <span
          className={[
            'ml-2 font-mono text-[10px]',
            mine ? 'text-white/70' : 'text-neutral-400',
          ].join(' ')}
        >
          {formatTime(message.createdAt)}
          {mine && (
            <span
              title={statusLabel}
              aria-label={statusLabel}
              data-testid={`message-status-${message.id}`}
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

/** Скелетон ленты: 4 пузыря с чередованием сторон — высота не «прыгает». */
export function ChatSkeleton({ inline }: { inline?: boolean }) {
  const content = (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className={[
            'h-10 w-3/5 animate-pulse rounded-2xl bg-neutral-200',
            index % 2 === 0 ? 'self-start' : 'self-end',
          ].join(' ')}
        />
      ))}
    </div>
  );
  if (inline) return content;
  return (
    <div className="flex flex-col gap-3" data-testid="portal-chat-thread">
      <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-200" />
      {content}
    </div>
  );
}
