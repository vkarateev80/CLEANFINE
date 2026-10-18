import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { attachFile, uploadChatFile } from '../../api/files';
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_MAX_COUNT,
  MessageAttachments,
  attachmentError,
  attachmentIcon,
  formatBytes,
} from '../../components/chat/MessageAttachments';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, SoftWarning, errorMessage } from '../../components/ui/Feedback';
import { useChatSocket } from '../../hooks/useChatSocket';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { alertUser } from '../../lib/alerts';
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
import { t } from '../../i18n';

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
  // Вложения (12.10.2026): фото/видео копятся до отправки; без сети не уходят —
  // файл нельзя положить в localStorage-очередь, а IndexedDB-очередь фото
  // заточена под операции. Онлайн: upload по одному → сообщение с id.
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<{ index: number; percent: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const title = summary ? chatTitle(summary) : detail.data ? chatTitle(detail.data) : t('Чат');

  const messages = useMemo(() => {
    const removed = new Set(
      socket.deleted.filter((event) => event.chatId === chatId).map((event) => event.messageId),
    );
    const map = new Map<string, MessageView>();
    for (const message of [...history.items, ...socket.incoming, ...sentLocally]) {
      if (message.chatId === chatId && !removed.has(message.id)) map.set(message.id, message);
    }
    return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [chatId, history.items, sentLocally, socket.incoming, socket.deleted]);

  // Удаление админом (14.10.2026): кэш истории и превью списка чатов — заново.
  useEffect(() => {
    if (socket.deleted.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', chatId] });
    void queryClient.invalidateQueries({ queryKey: ['chat', 'chats'] });
  }, [socket.deleted.length, queryClient, chatId]);

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

  // Новые входящие по сокету обновляют счётчики в списке чатов и дают
  // короткую вибрацию (12.10.2026) — экран открыт, push на него не приходит.
  useEffect(() => {
    if (socket.incoming.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: ['chat', 'chats'] });
    const last = socket.incoming[socket.incoming.length - 1];
    if (last && last.authorId !== me) alertUser({ vibrate: [80], silent: true });
  }, [socket.incoming.length, queryClient, me]);

  const readIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of socket.reads) if (event.chatId === chatId) ids.add(event.messageId);
    return ids;
  }, [chatId, socket.reads]);

  const members = detail.data?.members.filter((member) => member.userId !== me) ?? [];
  const onlineCount = members.filter((member) => socket.onlineUsers.has(member.userId)).length;
  const subtitle =
    socket.status === 'connecting'
      ? t('соединение…')
      : socket.status === 'offline'
        ? t('нет соединения — переподключение…')
        : onlineCount > 0
          ? t('в сети: {onlineCount}', { onlineCount })
          : members.length > 0
            ? t('участников: {length}', { length: members.length })
            : undefined;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const file of Array.from(list)) {
      const error = attachmentError(file);
      if (error) {
        setSendError(error);
        return;
      }
      next.push(file);
    }
    setSendError(null);
    setFiles((current) => [...current, ...next].slice(0, CHAT_ATTACHMENT_MAX_COUNT));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    const text = draft.trim();
    if (!chatId || (text === '' && files.length === 0) || sendMutation.isPending || uploading)
      return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setSendError(t('Сообщение длиннее 4000 символов'));
      return;
    }
    setSendError(null);
    const clientMessageId = crypto.randomUUID();
    if (!online && files.length > 0) {
      setSendError(t('Нет соединения — фото и видео можно отправить только онлайн'));
      return;
    }
    if (!online) {
      enqueue({
        kind: 'chat_message',
        payload: { chatId, text, clientMessageId },
        label: t('Сообщение в чат · «{text}»', { text: text.slice(0, 40) }),
        idempotencyKey: `chat:${clientMessageId}`,
      });
      setDraft('');
      return;
    }
    const attachmentIds: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        setUploading({ index, percent: 0 });
        const uploaded = await uploadChatFile(files[index], (percent) =>
          setUploading({ index, percent }),
        );
        attachmentIds.push(uploaded.id);
      }
    } catch (caught) {
      setUploading(null);
      setSendError(
        t('Не удалось загрузить «{name}»: {errorMessage}', { name: files[attachmentIds.length]?.name ?? t('файл'), errorMessage: errorMessage(caught) }),
      );
      return;
    }
    setUploading(null);
    try {
      const sent = await sendMutation.mutateAsync({
        text,
        clientMessageId,
        attachmentIds,
        socketSend: (id) => socket.send(chatId, text, id, attachmentIds),
      });
      // Привязка файлов к сообщению — не критична: id вложений уже в сообщении.
      for (const fileId of attachmentIds) {
        attachFile(fileId, 'CHAT_MESSAGE', sent.id).catch(() => undefined);
      }
      setSentLocally((current) => [...current, sent]);
      setDraft('');
      setFiles([]);
      void history.refetch();
      void queryClient.invalidateQueries({ queryKey: ['chat', 'chats'] });
    } catch (caught) {
      if (isNetworkError(caught)) {
        enqueue({
          kind: 'chat_message',
          payload: { chatId, text, clientMessageId },
          label: t('Сообщение в чат · «{text}»', { text: text.slice(0, 40) }),
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
      offlineText={t('Нет соединения — сообщения уйдут при подключении')}
      testId="chat_thread_page"
    >
      {forbidden ? (
        <EmptyState title={t('Чат недоступен')} hint={t('Вы не участник этого чата.')} />
      ) : (
        <div className="-mx-4 -mt-4 flex min-h-[calc(100dvh-6rem)] flex-col">
          {socket.status === 'offline' && online && (
            <div className="px-4 pt-3">
              <SoftWarning>{t('Соединение потеряно — переподключение…')}</SoftWarning>
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
                {t('Загрузить историю')}
              </Button>
            ) : messages.length > 0 ? (
              <div className="mx-auto text-xs text-neutral-400">{t('Начало переписки')}</div>
            ) : null}

            {history.isError ? (
              <ErrorBanner
                error={new Error(t('Не удалось загрузить переписку'))}
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
                title={t('Напишите первое сообщение')}
                hint={t('Опишите вопрос — ответ придёт в это окно')}
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
                      ? t('Не отправлено · {lastError}', { lastError: item.lastError ?? '' })
                      : t('Отправляется…')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {hasNewBelow && (
            <div className="sticky bottom-20 flex justify-center">
              <Button variant="primary" size="sm" onClick={() => scrollToBottom('smooth')}>
                {t('↓ Новое сообщение')}
              </Button>
            </div>
          )}

          <div className="op-bottom-bar sticky bottom-0 border-t border-neutral-200 bg-white px-3 pt-2">
            {sendError && <p className="mb-1 text-xs text-danger-600">{sendError}</p>}
            {files.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-2" data-testid="chat_pending_attachments">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700"
                  >
                    {attachmentIcon(file)}
                    <span className="max-w-[40vw] truncate">{file.name}</span>
                    <span className="text-neutral-400">{formatBytes(file.size)}</span>
                    {uploading && uploading.index === index ? (
                      <span className="text-primary-600">{uploading.percent} %</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={t('Убрать {name}', { name: file.name })}
                        className="min-h-[28px] min-w-[28px] text-neutral-400"
                        disabled={Boolean(uploading)}
                        onClick={() =>
                          setFiles((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                multiple
                className="sr-only"
                data-testid="chat_attach_input"
                onChange={(event) => addFiles(event.target.files)}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-xl text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
                aria-label={t('Прикрепить фото или видео')}
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(uploading) || sendMutation.isPending || forbidden}
                data-testid="chat_attach_button"
              >
                📎
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('Напишите сообщение…')}
                value={draft}
                disabled={sendMutation.isPending || forbidden}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="chat_input_field"
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
                aria-label={t('Отправить сообщение')}
                onClick={() => void handleSend()}
                disabled={
                  (draft.trim() === '' && files.length === 0) ||
                  sendMutation.isPending ||
                  Boolean(uploading) ||
                  forbidden
                }
                data-testid="chat_send_button"
              >
                {uploading ? '…' : '➤'}
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
  const statusLabel = read ? t('Прочитано') : delivered ? t('Доставлено') : t('Отправлено');
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
        <MessageAttachments ids={message.attachmentIds} mine={mine} />
        {message.text}
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
