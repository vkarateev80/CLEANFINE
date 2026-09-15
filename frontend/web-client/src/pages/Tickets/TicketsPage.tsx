import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner } from '../../components/ui/Feedback';
import { TicketCard } from '../../components/tickets/TicketBadges';
import { TicketCreateSheet } from '../../components/tickets/TicketCreateSheet';
import { useObjectScopeContext } from '../../components/object/ObjectScopeContext';
import {
  TICKET_FILTERS,
  TICKET_FILTER_LABELS,
  useTicketsFeed,
  type TicketFilterKey,
} from './useTicketsFeed';

/**
 * Экран «Заявки» (DS-004, `tickets.md`): список заявок объекта и создание
 * обычной заявки шторкой.
 *
 * Клиент не управляет заявкой: он не меняет статус, не назначает исполнителя и
 * не отклоняет её. Кнопки с такими действиями на экране отсутствуют, а не
 * выключены — `disabled` намекал бы, что право можно получить (`overview.md` п. 2).
 *
 * Фильтр живёт в query-строке (`?status=open`), открытие шторки — в `?new=1`:
 * «назад» браузера возвращает прежний отбор, а ссылку «создать заявку» можно
 * дать из другого экрана (главная, пустое состояние списка).
 */
export function TicketsPage() {
  const scope = useObjectScopeContext();
  const objectId = scope.object?.id;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const filter = (params.get('status') as TicketFilterKey | null) ?? 'all';
  const sheetOpen = params.get('new') === '1';
  const feed = useTicketsFeed(objectId, filter in TICKET_FILTERS ? filter : 'all');

  // Подсвеченная карточка после создания: фокус переводится на заголовок списка,
  // чтобы скринридер объявил результат (tickets.md п. 6, состояние «Создано»).
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!createdId) return undefined;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 4000);
    return () => window.clearTimeout(timer);
  }, [createdId]);

  function setFilter(next: TicketFilterKey) {
    setParams(
      (current) => {
        const paramsNext = new URLSearchParams(current);
        if (next === 'all') paramsNext.delete('status');
        else paramsNext.set('status', next);
        return paramsNext;
      },
      { replace: true },
    );
  }

  function openSheet() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('new', '1');
        return next;
      },
      { replace: true },
    );
  }

  function closeSheet() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('new');
        return next;
      },
      { replace: true },
    );
  }

  const emptyAll = feed.total === 0 && filter === 'all' && !feed.isLoading;

  return (
    <div className="flex flex-col gap-4" data-testid="portal-ticket-list">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">Заявки</h1>
          <span className="text-sm text-neutral-500" data-testid="portal-ticket-total">
            {feed.total}
          </span>
        </div>
        <Button
          variant="primary"
          className="min-h-[44px]"
          onClick={openSheet}
          data-testid="portal-ticket-create"
        >
          <span className="sm:hidden" aria-hidden="true">
            +
          </span>
          <span className="hidden sm:inline">Создать</span>
          <span className="sr-only sm:hidden">Создать заявку</span>
        </Button>
      </div>

      {/* Фильтр-чипы: значение синхронизировано с query-строкой (tickets.md п. 4.2). */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(Object.keys(TICKET_FILTERS) as TicketFilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm',
              filter === key
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-neutral-200 bg-white text-neutral-700',
            ].join(' ')}
          >
            {TICKET_FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {feed.isError ? (
        <ErrorBanner error={feed.error} onRetry={feed.refetch} />
      ) : feed.isLoading ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-neutral-200" />
          ))}
        </div>
      ) : feed.items.length === 0 ? (
        emptyAll ? (
          <EmptyState
            title="Заявок пока нет"
            hint="Опишите проблему — менеджер получит заявку сразу."
            action={
              <Button variant="primary" className="min-h-[44px]" onClick={openSheet}>
                Создать заявку
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Ничего не найдено"
            hint="В этом фильтре заявок нет."
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                Показать все
              </Button>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {feed.items.map((ticket) => (
            <div
              key={ticket.id}
              className={
                flash && ticket.id === createdId ? 'rounded-xl ring-2 ring-primary-500' : undefined
              }
            >
              <TicketCard ticket={ticket} />
            </div>
          ))}
        </div>
      )}

      {feed.hasMore && (
        <Button
          variant="secondary"
          className="min-h-[44px] w-full"
          loading={feed.isFetchingMore}
          onClick={feed.loadMore}
        >
          Показать ещё
        </Button>
      )}

      {!feed.hasMore && feed.items.length > 0 && (
        <p className="text-center text-xs text-neutral-400">
          Показано все {feed.total} заявок
        </p>
      )}

      {/* Шторка создания. `objectId` — всегда объект клиента из сессии. */}
      {objectId && (
        <TicketCreateSheet
          open={sheetOpen}
          objectId={objectId}
          onClose={closeSheet}
          onCreated={(id) => {
            setCreatedId(id);
            // Одним переходом: убрать `?new=1` и снять фильтр. Свежесозданная
            // заявка имеет статус «Новая» и в фильтре «Выполненные» была бы не видна,
            // а клиент должен увидеть результат своего действия сразу.
            navigate('/tickets', { replace: true });
          }}
        />
      )}
    </div>
  );
}
