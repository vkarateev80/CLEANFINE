import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PageHeader,
  Pagination,
  SoftWarning,
} from '../../components/ui';
import { ROUTES } from '../../router/routes';
import {
  NOTIFICATION_TYPES,
  notificationTypeIcon,
  notificationTypeLabel,
  ticketIdFromPayload,
  type NotificationType,
} from '../../types/notifications';
import { formatDateTime } from '../Tickets/ticketHelpers';
import {
  useMarkNotificationRead,
  useNotificationSettings,
  useNotifications,
  useUpdateNotificationSettings,
} from './useNotifications';

/**
 * Страница «Уведомления»: полный список in-app уведомлений пользователя,
 * отметка прочитанного и настройки подписок (`GET/PATCH /api/notifications/settings`).
 *
 * Пагинация уведомлений — страницами (`page`/`limit`), а не skip/take: так устроен
 * `ListNotificationsQueryDto`. Общий компонент `Pagination` работает с skip/take,
 * поэтому страница переводит одно в другое (limit фиксирован — 25).
 */

const LIMIT = 25;

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const unreadOnly = params.get('unreadOnly') === 'true';
  const [settingsOpen, setSettingsOpen] = useState(false);

  const query = useNotifications({ page, limit: LIMIT, unreadOnly });
  const settings = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const markRead = useMarkNotificationRead();

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const unreadCount = query.data?.unreadCount ?? 0;

  function setPage(nextPage: number) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextPage <= 1) next.delete('page');
        else next.set('page', String(nextPage));
        return next;
      },
      { replace: true },
    );
  }

  function toggleUnreadOnly() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (unreadOnly) next.delete('unreadOnly');
        else next.set('unreadOnly', 'true');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function toggleType(type: NotificationType) {
    // PATCH принимает только известные типы (`@IsIn(NOTIFICATION_TYPES)`), поэтому
    // собираем новый список явно, а не фильтруем ответ бэкенда (он приходит как string[]).
    const disabled = settings.data?.disabledTypes ?? [];
    const next: NotificationType[] = [];
    for (const item of NOTIFICATION_TYPES) {
      if (item === type) {
        if (disabled.includes(item)) next.push(item);
      } else if (disabled.includes(item)) {
        next.push(item);
      }
    }
    updateSettings.mutate(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={total > 0 ? `Уведомления · ${total}` : 'Уведомления'}
        subtitle={
          unreadCount > 0
            ? `Непрочитанных: ${unreadCount}. Счётчик обновляется каждые 30 секунд.`
            : 'Все уведомления прочитаны'
        }
        actions={
          <>
            <Checkbox
              label="Только непрочитанные"
              checked={unreadOnly}
              data-testid="notifications-unread-toggle"
              onChange={toggleUnreadOnly}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen((value) => !value)}
            >
              {settingsOpen ? 'Скрыть настройки' : 'Настройки подписок'}
            </Button>
          </>
        }
      />

      {settingsOpen && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-900">Типы уведомлений</h2>
          <p className="text-xs text-neutral-500">
            Снимите галочку, чтобы отказаться от типа: уведомление не попадёт ни в интерфейс, ни
            в push.
          </p>
          {settings.isLoading ? (
            <LoadingBlock label="Загрузка настроек…" />
          ) : settings.isError ? (
            <ErrorBanner error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {NOTIFICATION_TYPES.map((type) => {
                const enabled = !(settings.data?.disabledTypes ?? []).includes(type);
                return (
                  <Checkbox
                    key={type}
                    label={`${notificationTypeIcon(type)} ${notificationTypeLabel(type)}`}
                    checked={enabled}
                    disabled={updateSettings.isPending}
                    onChange={() => toggleType(type)}
                  />
                );
              })}
            </div>
          )}
          {updateSettings.isError && <ErrorBanner error={updateSettings.error} />}
          {updateSettings.isSuccess && !updateSettings.isPending && (
            <span className="text-xs text-success-600" role="status">
              Настройки сохранены
            </span>
          )}
        </Card>
      )}

      {query.isError && <ErrorBanner error={query.error} onRetry={() => void query.refetch()} />}
      {!query.isError && query.isRefetchError && (
        <SoftWarning>Список может быть неактуален — обновите страницу.</SoftWarning>
      )}

      {query.isLoading ? (
        <LoadingBlock label="Загрузка уведомлений…" />
      ) : !query.isError && items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'Непрочитанных уведомлений нет' : 'Уведомлений пока нет'}
          hint="Сюда приходят события заявок: создание, SOS, просрочки и выходы за периметр."
          action={
            unreadOnly ? (
              <Button variant="secondary" size="sm" onClick={toggleUnreadOnly}>
                Показать все
              </Button>
            ) : null
          }
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <ul>
            {items.map((item) => {
              const ticketId = ticketIdFromPayload(item);
              return (
                <li
                  key={item.id}
                  data-testid={`notification-row-${item.id}`}
                  className={[
                    'flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0',
                    item.readAt ? 'bg-white' : 'bg-primary-50',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs text-neutral-500">
                      {notificationTypeIcon(item.type)} {notificationTypeLabel(item.type)} ·{' '}
                      {formatDateTime(item.createdAt)}
                    </span>
                    <span className="text-sm font-medium text-neutral-900">{item.title}</span>
                    <span className="text-sm text-neutral-700">{item.body}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {ticketId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          markRead.mutate(item.id);
                          navigate(ROUTES.ticket(ticketId));
                        }}
                      >
                        Открыть заявку
                      </Button>
                    )}
                    {item.readAt ? (
                      <span className="text-xs text-neutral-400">
                        прочитано {formatDateTime(item.readAt)}
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-testid={`notification-read-${item.id}`}
                        loading={markRead.isPending && markRead.variables === item.id}
                        onClick={() => markRead.mutate(item.id)}
                      >
                        Прочитано
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            total={total}
            skip={(page - 1) * LIMIT}
            take={LIMIT}
            disabled={query.isFetching}
            onChange={({ skip }) => setPage(Math.floor(skip / LIMIT) + 1)}
          />
        </Card>
      )}

      {markRead.isError && <ErrorBanner error={markRead.error} />}
    </div>
  );
}
