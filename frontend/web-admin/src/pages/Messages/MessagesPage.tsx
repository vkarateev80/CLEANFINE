import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  SoftWarning,
} from '../../components/ui';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useCanAssignTicket } from '../../hooks/usePermissions';
import { useAuthStore } from '../../stores/authStore';
import { CHAT_TYPES, chatDisplayTitle, chatTypeLabel, type ChatType } from '../../types/chat';
import { formatDateTime, shortId } from '../Tickets/ticketHelpers';
import { ChatThread } from './ChatThread';
import {
  appendMessageToCache,
  bumpChatList,
  chatUserName,
  useChatDetail,
  useChatRoom,
  useChatUserNames,
  useCreateChat,
  useMyChats,
} from './useChats';

/**
 * Экран «Сообщения» (М5.3) — инбокс чатов текущего пользователя: список слева,
 * переписка справа. Тип чата и открытый чат живут в query-строке
 * (`?type=direct&chat=<id>`), как на экранах «Материалы» и «Уведомления»:
 * ссылку на конкретный диалог можно передать коллеге, а «назад» восстанавливает
 * состояние экрана.
 *
 * Реальное время — `useChatSocket` (namespace `/chat`): `message:new` обновляет и
 * переписку, и список (превью + счётчик непрочитанных), `message:read` даёт
 * подпись «прочитано» у своих сообщений. REST остаётся фолбэком отправки и
 * отметки прочтения, когда соединения нет; статус соединения показан в шапке
 * переписки дословно («Нет соединения…»).
 */

/** Значение фильтра «все типы» — не тип чата, поэтому отдельная константа. */
const ALL_TYPES = 'all';

function isChatType(value: string | null): value is ChatType {
  return value !== null && (CHAT_TYPES as readonly string[]).includes(value);
}

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const canManage = useCanAssignTicket();

  const chatsQuery = useMyChats();
  const users = useChatUserNames();
  const createChat = useCreateChat();

  const typeParam = params.get('type');
  const typeFilter: ChatType | typeof ALL_TYPES = isChatType(typeParam) ? typeParam : ALL_TYPES;
  const activeChatId = params.get('chat');

  const [readUntil, setReadUntil] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newParticipant, setNewParticipant] = useState('');

  /**
   * Обработчики сокета читают «какой чат открыт» из ref: хук хранит их в ref и не
   * пересобирает соединение при смене чата, поэтому замыкание не должно «застыть»
   * на первом выбранном чате.
   */
  const activeChatIdRef = useRef<string | null>(activeChatId);
  activeChatIdRef.current = activeChatId;

  const socket = useChatSocket({
    onMessageNew: (message) => {
      // Кэш открытой переписки (если она уже загружена) — без перезагрузки страницы.
      appendMessageToCache(queryClient, message);
      // Список чатов: превью и счётчик непрочитанных у закрытых чатов.
      bumpChatList(queryClient, message, activeChatIdRef.current, currentUser?.id ?? null);
    },
    onMessageRead: (event) => {
      setReadUntil((previous) => ({ ...previous, [event.chatId]: event.readAt }));
    },
  });

  const chats = chatsQuery.data ?? [];
  const filteredChats = chats.filter(
    (chat) => typeFilter === ALL_TYPES || chat.type === typeFilter,
  );
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  // Пока список грузится, открытый по ссылке чат ещё не известен — считаем, что
  // переписка открыта: иначе на мобильной ширине мигнул бы список чатов.
  const showThread = activeChatId !== null && (chatsQuery.isLoading || activeChat !== null);

  const room = useChatRoom(activeChat?.id ?? null, socket);
  const detail = useChatDetail(activeChat?.id ?? null);

  /** Общая сумма непрочитанных по всем чатам — подпись в шапке экрана. */
  const unreadTotal = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);

  function updateParams(patch: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  function openChat(chatId: string) {
    updateParams({ chat: chatId });
  }

  const participantOptions = (users ?? []).filter((user) => user.id !== currentUser?.id);
  /** Имена участников открытого чата (пусто, если справочник недоступен роли). */
  const memberNames = (detail.data?.members ?? [])
    .map((member) => chatUserName(users, member.userId))
    .filter((name): name is string => name !== null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Сообщения"
        subtitle={
          unreadTotal > 0 ? `Непрочитанных сообщений: ${unreadTotal}` : 'Все сообщения прочитаны'
        }
        actions={
          canManage ? (
            <Button
              variant="secondary"
              data-testid="messages-new-open"
              onClick={() => {
                createChat.reset();
                setNewParticipant('');
                setDialogOpen(true);
              }}
            >
              Новый диалог
            </Button>
          ) : null
        }
      />

      {chatsQuery.isError && (
        <ErrorBanner error={chatsQuery.error} onRetry={() => void chatsQuery.refetch()} />
      )}
      {!chatsQuery.isError && chatsQuery.isRefetchError && (
        <SoftWarning>Список чатов может быть неактуален — обновите страницу.</SoftWarning>
      )}

      <Card padded={false} className="overflow-hidden">
        {/*
          Высота панели. На ≥768 px — прежние `min-h-[560px]`: список и переписка
          стоят рядом, и панель не должна прыгать при смене чата. На телефоне
          фиксированный минимум вместе с шапкой (`4rem`) и нижней навигацией
          (`4.5rem`) давал лишнюю вертикальную прокрутку и уводил поле ввода за
          край экрана, поэтому высота считается от динамического вьюпорта
          (`dvh` — без учёта схлопывающейся адресной строки). Первое значение —
          фолбэк для браузеров без `dvh`; `min-h-0` снимает прежний минимум.
        */}
        <div className="grid min-h-[560px] grid-cols-1 max-md:h-[calc(100vh-4rem-4.5rem-2rem)] max-md:min-h-0 max-md:h-[calc(100dvh-4rem-4.5rem-2rem)] md:grid-cols-[320px_minmax(0,1fr)]">
          {/* ── Список чатов ─────────────────────────────────────────────── */}
          <div
            className={[
              // На телефоне панель ограничена высотой вьюпорта (см. комментарий выше),
              // поэтому длинный список чатов прокручивается внутри себя, а не растягивает
              // панель: `max-md:overflow-y-auto` + `max-md:min-h-0` (иначе флекс-элемент
              // не сжимается ниже своего содержимого). На ≥768 px колонка — как была.
              'flex-col border-b border-neutral-200 max-md:min-h-0 max-md:overflow-y-auto md:border-b-0 md:border-r',
              showThread ? 'hidden md:flex' : 'flex',
            ].join(' ')}
          >
            <div className="flex flex-col gap-2 border-b border-neutral-200 px-4 py-3">
              <label className="text-xs text-neutral-500" htmlFor="messages-type-filter">
                Тип чата
              </label>
              <Select
                id="messages-type-filter"
                data-testid="messages-type-filter"
                value={typeFilter}
                onChange={(event) => updateParams({ type: event.target.value })}
              >
                <option value={ALL_TYPES}>Все типы</option>
                {CHAT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {chatTypeLabel(type)}
                  </option>
                ))}
              </Select>
            </div>

            {chatsQuery.isLoading ? (
              <div className="p-4">
                <LoadingBlock label="Загрузка чатов…" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={typeFilter === ALL_TYPES ? 'Чатов пока нет' : 'Чатов этого типа нет'}
                  hint={
                    typeFilter === ALL_TYPES
                      ? 'Чат заявки открывается из её карточки, чат объекта — со страницы объекта.'
                      : 'Снимите фильтр по типу, чтобы увидеть остальные чаты.'
                  }
                  action={
                    typeFilter === ALL_TYPES ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateParams({ type: null })}
                      >
                        Показать все
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <ul data-testid="messages-chat-list" className="flex flex-col">
                {filteredChats.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const last = chat.lastMessage;
                  const fromMe = last !== null && last.authorId === currentUser?.id;
                  return (
                    <li key={chat.id} className="border-b border-neutral-200 last:border-b-0">
                      <button
                        type="button"
                        data-testid={`messages-chat-item-${chat.id}`}
                        aria-current={isActive}
                        onClick={() => openChat(chat.id)}
                        className={[
                          'flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors',
                          isActive ? 'bg-primary-50' : 'bg-white hover:bg-neutral-50',
                        ].join(' ')}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <Badge tone={chat.type === 'direct' ? 'info' : 'neutral'}>
                            {chatTypeLabel(chat.type)}
                          </Badge>
                          <span className="shrink-0 text-xs text-neutral-400">
                            {formatDateTime(last?.createdAt ?? chat.createdAt)}
                          </span>
                        </span>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-neutral-900">
                            {chatDisplayTitle(chat)}
                          </span>
                          {chat.unreadCount > 0 && (
                            <span
                              data-testid={`messages-unread-${chat.id}`}
                              className="shrink-0 rounded-full bg-primary-500 px-2 py-0.5 text-xs font-medium text-white"
                            >
                              {chat.unreadCount}
                            </span>
                          )}
                        </span>
                        <span className="w-full truncate text-xs text-neutral-500">
                          {last === null
                            ? 'Сообщений пока нет'
                            : `${fromMe ? 'Вы: ' : ''}${last.text}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── Переписка ────────────────────────────────────────────────── */}
          <div className={[showThread ? 'flex' : 'hidden md:flex', 'min-h-0 flex-col'].join(' ')}>
            {activeChat !== null ? (
              <ChatThread
                title={chatDisplayTitle(activeChat)}
                subtitle={
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{chatTypeLabel(activeChat.type)}</span>
                    <span className="font-mono">{shortId(activeChat.id)}</span>
                    {detail.data && (
                      <span>
                        участников: {detail.data.members.length}
                        {memberNames.length > 0 ? ` (${memberNames.join(', ')})` : ''}
                      </span>
                    )}
                  </span>
                }
                status={socket.status}
                room={room}
                readUntil={readUntil[activeChat.id] ?? null}
                onBack={() => updateParams({ chat: null })}
              />
            ) : activeChatId !== null && !chatsQuery.isLoading ? (
              <div className="flex flex-1 flex-col gap-3 p-4">
                <SoftWarning>
                  Чат <span className="font-mono">{shortId(activeChatId)}</span> не найден среди
                  ваших чатов.
                </SoftWarning>
                <div>
                  <Button variant="ghost" size="sm" onClick={() => updateParams({ chat: null })}>
                    ← К списку чатов
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  title="Выберите чат"
                  hint="Слева — ваши чаты: заявки, объекты и личные диалоги. Новые сообщения приходят без перезагрузки страницы."
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Modal
        open={dialogOpen}
        title="Новый диалог"
        busy={createChat.isPending}
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={createChat.isPending}
              onClick={() => setDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              data-testid="messages-new-submit"
              loading={createChat.isPending}
              disabled={newParticipant === ''}
              onClick={() => {
                createChat.mutate(
                  { type: 'direct', participantIds: [newParticipant] },
                  {
                    onSuccess: (chat) => {
                      setDialogOpen(false);
                      openChat(chat.id);
                    },
                  },
                );
              }}
            >
              Начать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3" data-testid="messages-new-dialog">
          {createChat.isError ? <ErrorBanner error={createChat.error} /> : null}
          {participantOptions.length === 0 ? (
            <SoftWarning>
              Справочник сотрудников доступен ролям ADMIN и SUPERVISOR — выбрать собеседника не из
              кого.
            </SoftWarning>
          ) : (
            <>
              <label className="text-sm text-neutral-500" htmlFor="messages-new-participant">
                Собеседник
              </label>
              <Select
                id="messages-new-participant"
                data-testid="messages-new-participant"
                value={newParticipant}
                onChange={(event) => setNewParticipant(event.target.value)}
              >
                <option value="">Выберите сотрудника</option>
                {participantOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} · {user.role}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-neutral-400">
                Повторный выбор того же собеседника откроет существующий диалог — сервис
                идемпотентен для пары участников.
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
