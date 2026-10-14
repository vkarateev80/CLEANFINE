import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addTicketComment } from '../../api/tickets';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorBanner, SoftWarning } from '../../components/ui/Feedback';
import { Textarea } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import {
  POINT_STATUS_LABELS,
  computePointViews,
  countDone,
  nextPendingPoint,
  type PointStatus,
  type PointView,
} from '../../domain/progress';
import {
  useEvent,
  useFloor,
  useRouteDetail,
  useTechCard,
  useTicketDetail,
} from '../../hooks/useRouteData';
import { FullscreenLayout } from '../../layouts/FullscreenLayout';
import { plural } from '../../lib/date';
import { isNetworkError, useNetStore } from '../../stores/netStore';
import { useProgressStore } from '../../stores/progressStore';
import { useQueueStore } from '../../stores/queueStore';
import { showToast } from '../../stores/uiStore';
import { FloorPlan } from './FloorPlan';

const STATUS_TONE: Record<PointStatus, Tone> = {
  pending: 'neutral',
  active: 'primary',
  done: 'success',
  skipped: 'warning',
};

/** Маршрут дня (route_map.md): план этажа, точки, текущая точка, пропуск, прогресс. */
export function RouteMapPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const event = useEvent(eventId);
  const route = useRouteDetail(event.data?.routeId);
  const floor = useFloor(route.data?.floorId);
  const ticket = useTicketDetail(event.data?.ticketId);
  const online = useNetStore((s) => s.online);

  const localPoints = useProgressStore((s) => s.points[eventId]);
  const localRooms = useProgressStore((s) => s.rooms);
  const localOperations = useProgressStore((s) => s.operations);
  const markPoint = useProgressStore((s) => s.markPoint);
  const enqueue = useQueueStore((s) => s.enqueue);

  const [selected, setSelected] = useState<PointView | null>(null);
  const [legend, setLegend] = useState(false);
  const [skipTarget, setSkipTarget] = useState<PointView | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [planFailed, setPlanFailed] = useState(false);

  const views = useMemo(
    () =>
      route.data
        ? computePointViews({
            route: route.data,
            ticket: ticket.data,
            localPoints,
            localRooms,
            localOperations,
            ticketId: event.data?.ticketId ?? null,
          })
        : [],
    [route.data, ticket.data, localPoints, localRooms, localOperations, event.data?.ticketId],
  );
  const done = countDone(views);
  const total = views.length;
  const active = views.find((view) => view.status === 'active') ?? null;
  const next = nextPendingPoint(views);
  const readOnly = event.data ? event.data.status !== 'CHECKED_IN' : false;

  function openChecklist(view: PointView) {
    navigate(`/route/${eventId}/room/${view.point.room.id}?pointId=${view.point.id}`);
  }

  async function confirmSkip() {
    const target = skipTarget;
    const reason = skipReason.trim();
    if (!target || reason.length < 3) return;
    markPoint(eventId, target.point.id, 'skipped', reason);
    setSkipTarget(null);
    setSkipReason('');
    setSelected(null);
    const ticketId = event.data?.ticketId;
    const text = `Пропущено: ${target.point.room.name} — ${reason}`;
    if (!ticketId) {
      showToast('Пропуск сохранён (заявки у смены нет)', 'info');
      return;
    }
    if (!online) {
      enqueue({
        kind: 'point_skip',
        payload: { ticketId, text },
        label: `Пропуск · ${target.point.room.name}`,
        idempotencyKey: `skip:${eventId}:${target.point.id}`,
      });
      showToast('Пропуск сохранится и уйдёт бригадиру', 'info');
      return;
    }
    try {
      await addTicketComment(ticketId, text);
      showToast('Пропуск сохранён и отправлен бригадиру', 'success');
    } catch (error) {
      if (isNetworkError(error)) {
        enqueue({
          kind: 'point_skip',
          payload: { ticketId, text },
          label: `Пропуск · ${target.point.room.name}`,
          idempotencyKey: `skip:${eventId}:${target.point.id}`,
        });
        showToast('Пропуск сохранится и уйдёт бригадиру', 'info');
      } else {
        showToast('Пропуск сохранён локально, комментарий не отправлен', 'error');
      }
    }
  }

  const title = floor.data
    ? `Маршрут · ${floor.data.name}`
    : route.data
      ? `Маршрут · ${route.data.floor.name}`
      : 'Маршрут';
  const subtitle =
    total > 0
      ? `Маршрут: ${done} из ${total} ${plural(total, 'помещение', 'помещения', 'помещений')}`
      : undefined;

  const body = (() => {
    if (event.isLoading || (event.data?.routeId && route.isLoading && !route.data)) {
      return (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="h-[48dvh] min-h-[260px] animate-pulse rounded-xl bg-neutral-200" />
          <div className="h-16 animate-pulse rounded-xl bg-neutral-200" />
        </div>
      );
    }
    if (event.isError && !event.data) {
      return (
        <ErrorBanner
          error={new Error('Не удалось загрузить смену')}
          onRetry={() => void event.refetch()}
        />
      );
    }
    if (event.data && !event.data.routeId) {
      return (
        <EmptyState
          title="Маршрут не назначен"
          hint="Обратитесь к бригадиру"
          action={
            <Button variant="secondary" className="min-h-[48px]" onClick={() => navigate('/today')}>
              Назад
            </Button>
          }
        />
      );
    }
    if (route.isError && !route.data) {
      return (
        <ErrorBanner
          error={new Error('Не удалось загрузить маршрут')}
          onRetry={() => void route.refetch()}
        />
      );
    }
    if (!route.data) return null;
    if (route.data.points.length === 0) {
      return <EmptyState title="Маршрут пуст" hint="Обратитесь к бригадиру" />;
    }

    const planUrl = floor.data?.planImageUrl ?? route.data.floor.planImageUrl;
    const planWidth = floor.data?.planWidth ?? null;
    const planHeight = floor.data?.planHeight ?? null;
    const showPlan = Boolean(planUrl) && !planFailed && planWidth && planHeight;

    return (
      <div className="flex flex-col gap-4">
        {readOnly && (
          <SoftWarning>Смена не открыта — маршрут доступен только для просмотра</SoftWarning>
        )}
        {showPlan ? (
          <FloorPlan
            planImageUrl={planUrl as string}
            planWidth={planWidth as number}
            planHeight={planHeight as number}
            views={views}
            onPointTap={setSelected}
            onLegend={() => setLegend(true)}
            onImageError={() => setPlanFailed(true)}
          />
        ) : (
          <SoftWarning>
            {planFailed
              ? 'План этажа недоступен'
              : planUrl
                ? 'Координаты помещений недоступны'
                : 'План этажа не загружен'}{' '}
            — точки показаны списком
          </SoftWarning>
        )}

        {active && (
          <section
            className="rounded-xl border border-primary-500 bg-white p-4 shadow-sm"
            data-testid="route_current_point_card"
          >
            <div className="text-xs text-neutral-500">
              Текущая точка: <span className="font-mono">{active.point.orderIndex + 1}</span> из{' '}
              <span className="font-mono">{total}</span>
            </div>
            <div className="mt-1 text-lg font-medium text-neutral-900">
              {active.point.room.name}
            </div>
            <div className="text-sm text-neutral-500">
              {route.data.floor.number} этаж
              {active.point.room.zone ? ` · ${active.point.room.zone}` : ''}
              {' · '}Операций: <span className="font-mono">{active.opsTotal}</span>
              {active.point.estimatedTimeMin ? (
                <>
                  {' '}
                  · ~<span className="font-mono">{active.point.estimatedTimeMin}</span> мин
                </>
              ) : null}
            </div>
          </section>
        )}
        {!active && total > 0 && (
          <div className="rounded-xl border border-success-500 bg-white p-4 text-sm text-success-600">
            Маршрут пройден
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">Точки маршрута</h2>
          <ol
            className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white"
            data-testid="route_points_list"
          >
            {views.map((view) => (
              <li key={view.point.id}>
                <button
                  type="button"
                  onClick={() => setSelected(view)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50"
                  data-testid={`route_point_tile_${view.point.id}`}
                >
                  <span
                    className={[
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                      view.status === 'active'
                        ? 'bg-primary-500'
                        : view.status === 'done'
                          ? 'bg-success-500'
                          : view.status === 'skipped'
                            ? 'bg-warning-500'
                            : 'bg-neutral-400',
                    ].join(' ')}
                  >
                    {view.point.orderIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-neutral-900">
                      {view.point.room.name}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {view.opsTotal > 0
                        ? `${view.opsDone} из ${view.opsTotal} операций`
                        : 'Техкарта не назначена'}
                      {view.skipReason ? ` · ${view.skipReason}` : ''}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[view.status]}>{POINT_STATUS_LABELS[view.status]}</Badge>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  })();

  return (
    <FullscreenLayout
      title={title}
      subtitle={subtitle}
      backTo="/today"
      offlineText="Нет соединения — план из кэша, статусы сохранятся локально"
      testId="route_map_page"
      bottom={
        route.data && route.data.points.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
              data-testid="route_progress_bar"
            >
              <div
                className="h-full bg-primary-500"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <Button
                variant="primary"
                className="min-h-[48px]"
                disabled={!next}
                onClick={() => next && openChecklist(next)}
                data-testid="route_next_button"
              >
                {next ? (readOnly ? 'Открыть чек-лист' : 'Следующая точка ▸') : 'Маршрут пройден'}
              </Button>
              <Button
                variant="secondary"
                className="min-h-[48px]"
                disabled={!next || readOnly}
                onClick={() => next && setSkipTarget(next)}
                data-testid="route_skip_button"
              >
                Пропустить
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {body}

      <PointSheet
        view={selected}
        floorNumber={route.data?.floor.number ?? null}
        readOnly={readOnly}
        onClose={() => setSelected(null)}
        onOpen={openChecklist}
        onSkip={(view) => setSkipTarget(view)}
      />

      <Sheet
        open={legend}
        title="Легенда"
        onClose={() => setLegend(false)}
        testId="route_legend_sheet"
      >
        <ul className="flex flex-col gap-3 text-sm text-neutral-900">
          <li className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-400 text-xs font-bold text-white">
              1
            </span>{' '}
            Порядок точки · Ожидает
          </li>
          <li className="flex items-center gap-3">
            <span className="h-7 w-7 rounded-full bg-primary-500" /> В работе (текущая точка)
          </li>
          <li className="flex items-center gap-3">
            <span className="h-7 w-7 rounded-full bg-success-500" /> Выполнено
          </li>
          <li className="flex items-center gap-3">
            <span className="h-7 w-7 rounded-full bg-warning-500" /> Пропущено
          </li>
          <li className="flex items-center gap-3">
            <span className="h-7 w-7 rounded-md border-2 border-primary-500 bg-primary-100" />{' '}
            Область помещения
          </li>
        </ul>
      </Sheet>

      <Sheet
        open={Boolean(skipTarget)}
        title="Пропустить точку"
        onClose={() => setSkipTarget(null)}
        testId="route_skip_sheet"
        footer={
          <Button
            variant="primary"
            className="min-h-[48px] w-full"
            disabled={skipReason.trim().length < 3}
            onClick={() => void confirmSkip()}
            data-testid="route_skip_confirm_button"
          >
            Пропустить точку
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="text-sm text-neutral-900">{skipTarget?.point.room.name}</div>
          <label className="flex flex-col gap-1 text-sm text-neutral-500">
            Причина пропуска
            <Textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Укажите причину (не короче 3 символов)"
              data-testid="route_skip_reason_field"
            />
          </label>
          <p className="text-xs text-neutral-500">Пропуск сохранится и уйдёт бригадиру</p>
        </div>
      </Sheet>
    </FullscreenLayout>
  );
}

function PointSheet({
  view,
  floorNumber,
  readOnly,
  onClose,
  onOpen,
  onSkip,
}: {
  view: PointView | null;
  floorNumber: number | null;
  readOnly: boolean;
  onClose: () => void;
  onOpen: (view: PointView) => void;
  onSkip: (view: PointView) => void;
}) {
  const techCard = useTechCard(view?.point.room.techCardId);
  return (
    <Sheet
      open={Boolean(view)}
      title={view ? `${view.point.orderIndex + 1}. ${view.point.room.name}` : ''}
      onClose={onClose}
      testId="route_point_sheet"
      footer={
        view && (
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <Button variant="primary" className="min-h-[48px]" onClick={() => onOpen(view)}>
              Открыть чек-лист
            </Button>
            <Button
              variant="secondary"
              className="min-h-[48px]"
              disabled={readOnly || view.status === 'done' || view.status === 'skipped'}
              onClick={() => onSkip(view)}
            >
              Пропустить
            </Button>
          </div>
        )
      }
    >
      {view && (
        <div className="flex flex-col gap-2 text-sm">
          <Badge tone={STATUS_TONE[view.status]}>{POINT_STATUS_LABELS[view.status]}</Badge>
          <div className="text-neutral-700">
            {floorNumber !== null ? `${floorNumber} этаж` : ''}
            {view.point.room.zone ? ` · ${view.point.room.zone}` : ''} ·{' '}
            <span className="font-mono">
              {view.point.room.areaM2.toLocaleString('ru-RU', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>{' '}
            м²
          </div>
          {techCard.data ? (
            <div className="text-neutral-700">
              Техкарта «{techCard.data.name}» · Операций:{' '}
              <span className="font-mono">{techCard.data.operations.length}</span> · ~
              <span className="font-mono">{techCard.data.totalEstimatedTimeMin}</span> мин
            </div>
          ) : view.point.room.techCardId ? (
            <div className="text-neutral-500">Техкарта загружается…</div>
          ) : (
            <div className="text-warning-600">Техкарта не назначена</div>
          )}
          {view.skipReason && (
            <div className="text-warning-600">Причина пропуска: {view.skipReason}</div>
          )}
        </div>
      )}
    </Sheet>
  );
}
