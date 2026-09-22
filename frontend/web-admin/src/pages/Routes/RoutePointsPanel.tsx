import type { ReactNode } from 'react';
import { Button, ErrorBanner, EmptyState, SortableList } from '../../components/ui';
import type { RoomEntity } from '../../types/core';
import type { RouteStatus } from '../../types/status';
import { zoneLabel } from './helpers';

/**
 * Колонка «Точки маршрута»: список точек с drag-and-drop и полем нормативного
 * времени.
 *
 * Порядок хранится локально (черновик) и уходит на сервер одним вызовом
 * `reorder` по кнопке «Сохранить» — спецификация экрана требует явного
 * сохранения: `@@unique([routeId, orderIndex])` и транзакционный `reorder`
 * не рассчитаны на поток запросов от каждого перетаскивания.
 */

export interface RoutePointDraft {
  /** id точки маршрута (`RoutePoint.id`) — он же id строки для `@dnd-kit`. */
  id: string;
  room: RoomEntity;
  /** Оценка времени как строка: поле должно уметь показать «пусто» (на сервере `null`). */
  estimatedTimeMin: string;
}

export interface RoutePointsPanelProps {
  points: RoutePointDraft[];
  /** Точка, выбранная на плане (подсветка строки). */
  selectedPointId: string | null;
  onSelectPoint: (pointId: string) => void;
  onChangeTime: (pointId: string, value: string) => void;
  onReorder: (ids: string[]) => void;
  onDeletePoint: (pointId: string) => void;
  onAddPoint: () => void;
  onSave: () => void;
  onDiscard: () => void;
  orderDirty: boolean;
  timeDirty: boolean;
  saving: boolean;
  /** Ошибка сохранения порядка (400/409/5xx) — показывается баннером с повтором. */
  saveError: unknown;
  /** Ошибка сохранения времени конкретной точки (точечная, под полем). */
  timeError: { pointId: string; error: unknown } | null;
  /** Ошибка удаления/добавления точки — текст уже человекочитаемый. */
  actionError: string | null;
  /** Серверная сумма времени: показываем рядом с локальной, если разошлись. */
  serverTotal: number;
  localTotal: number;
  status: RouteStatus;
  disabled: boolean;
  canEdit: boolean;
  /** Баннер активного маршрута и кнопки действий — от родителя. */
  headerActions?: ReactNode;
  className?: string;
}

export function RoutePointsPanel({
  points,
  selectedPointId,
  onSelectPoint,
  onChangeTime,
  onReorder,
  onDeletePoint,
  onAddPoint,
  onSave,
  onDiscard,
  orderDirty,
  timeDirty,
  saving,
  saveError,
  timeError,
  actionError,
  serverTotal,
  localTotal,
  status,
  disabled,
  canEdit,
  headerActions,
  className,
}: RoutePointsPanelProps) {
  const dirty = orderDirty || timeDirty;

  return (
    <section
      className={['flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white shadow-sm', className ?? ''].join(' ')}
    >
      <header className="flex flex-col gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-medium text-neutral-500">
            Точки маршрута
            <span className="font-mono text-neutral-700">{points.length}</span>
            {dirty && (
              <span className="flex items-center gap-1 text-warning-600">
                <span className="h-1.5 w-1.5 rounded-full bg-warning-500" aria-hidden="true" />
                Есть несохранённые изменения
              </span>
            )}
          </h2>
          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              data-testid="route-point-add"
              onClick={onAddPoint}
              disabled={disabled}
            >
              + Добавить помещение
            </Button>
          )}
        </div>
        {headerActions}
        {status === 'ACTIVE' && (
          <div className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-warning-600">
            Маршрут активен. Перед изменением порядка верните его в черновик — иначе порядок попадёт
            в уже назначенные смены.
          </div>
        )}
        {status === 'ARCHIVED' && (
          <div className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
            Маршрут в архиве: изменение точек и порядка недоступно.
          </div>
        )}
      </header>

      <div className={['min-h-0 flex-1 overflow-y-auto', saving ? 'pointer-events-none opacity-60' : ''].join(' ')}>
        {points.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="В маршруте нет точек"
              hint="Добавьте помещения этажа: они станут точками обхода в порядке добавления."
              action={
                canEdit ? (
                  <Button variant="primary" size="sm" onClick={onAddPoint} disabled={disabled}>
                    Добавить помещение
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          /**
           * Телефон (<768 px): точка — карточка. `SortableList` — общий примитив
           * UI-кита и рисует строку горизонтально (ручка, номер, содержимое,
           * кнопки ↑/↓), из-за чего на 360 px содержимому остаётся ~120 px.
           * Примитив не правим (он общий для маршрутов и техкарт), но его строку
           * перестраиваем снаружи — произвольными вариантами по потомкам,
           * строго в диапазоне `max-md:`:
           *   - `flex-wrap` + `basis-full` у блока кнопок переносят ↑/↓ на
           *     отдельную строку (это основной touch-путь перестановки — PRD §4.2);
           *   - содержимое получает всю ширину строки и рисуется карточкой.
           * На планшете и desktop правила не действуют: две панели и прежняя
           * плотная строка.
           */
          <div
            data-testid="route-points"
            className="max-md:[&>ul>li]:flex-wrap max-md:[&>ul>li]:gap-y-2 max-md:[&>ul>li>div:last-child]:basis-full max-md:[&>ul>li>div:last-child]:justify-end"
          >
            <SortableList
              items={points}
              getId={(point) => point.id}
              onReorder={onReorder}
              disabled={disabled}
              renderItem={(point) => {
                const selected = point.id === selectedPointId;
                const invalidTime = timeError?.pointId === point.id;
                return (
                  <div
                    data-testid={`route-point-row-${point.id}`}
                    className={[
                      'flex items-center gap-2 rounded-md px-1',
                      'max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:rounded-lg max-md:border max-md:border-neutral-200 max-md:bg-white max-md:p-3',
                      selected ? 'bg-primary-50' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPoint(point.id)}
                      className="min-w-0 flex-1 text-left max-md:w-full"
                      aria-pressed={selected}
                    >
                      <div className="flex items-center gap-1 truncate text-sm font-medium text-neutral-900">
                        {point.room.techCardId === null && (
                          <span className="text-warning-500" title="Помещение без техкарты" aria-hidden="true">
                            ⚠
                          </span>
                        )}
                        <span className="truncate">{point.room.name}</span>
                      </div>
                      <div className="truncate text-xs text-neutral-500">
                        {zoneLabel(point.room)}
                        {point.room.techCardId === null && ' · без техкарты'}
                      </div>
                      {invalidTime && <div className="text-xs text-danger-600">Не удалось сохранить время</div>}
                    </button>

                    {/* Время и удаление — одной строкой внутри карточки: на
                        телефоне поле крупное (≥44 px по высоте), на desktop —
                        прежний компактный `w-20`. */}
                    <div className="flex items-center gap-2 max-md:w-full max-md:justify-between">
                      <label className="flex shrink-0 items-center gap-1 max-md:flex-1">
                        <span className="sr-only">Нормативное время, мин, для {point.room.name}</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          data-testid={`route-point-time-${point.id}`}
                          value={point.estimatedTimeMin}
                          disabled={disabled}
                          onChange={(event) => onChangeTime(point.id, event.target.value)}
                          aria-invalid={invalidTime || undefined}
                          className={[
                            'w-20 rounded-md border px-2 py-1 text-right font-mono text-sm text-neutral-900',
                            // Поле — не из UI-кита, поэтому тач-высоту задаём здесь
                            // (в ките это делает `CONTROL`): `max-lg:` = телефон+планшет.
                            'max-lg:min-h-[44px] max-md:w-24',
                            'focus:outline-none focus:ring-2 focus:ring-offset-1',
                            invalidTime
                              ? 'border-danger-500 focus:ring-danger-500'
                              : 'border-neutral-200 focus:border-primary-500 focus:ring-primary-500',
                            'disabled:bg-neutral-100 disabled:text-neutral-500',
                          ].join(' ')}
                        />
                        <span className="text-xs text-neutral-500">мин</span>
                      </label>

                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600"
                          data-testid={`route-point-delete-${point.id}`}
                          aria-label={`Удалить точку ${point.room.name}`}
                          disabled={disabled}
                          onClick={() => onDeletePoint(point.id)}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-neutral-200 px-4 py-3">
        {saveError !== null && <ErrorBanner error={saveError} onRetry={onSave} />}
        {actionError !== null && (
          <div className="rounded-lg border border-danger-500 bg-white px-3 py-2 text-xs text-danger-600">
            {actionError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-mono text-sm text-neutral-900" data-testid="route-total-time">
              Итого: {localTotal} мин
            </span>
            {serverTotal !== localTotal && (
              <span className="text-xs text-neutral-400">
                Сохранено на сервере: {serverTotal} мин — изменится после сохранения
              </span>
            )}
          </div>

          {canEdit && (
            // На телефоне кнопки сохранения — столбиком во всю ширину: в строку
            // «Отменить изменения» + «Сохранить порядок» не помещаются в 296 px
            // контента и выдавили бы страницу по горизонтали.
            <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:gap-2">
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
                Отменить изменения
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                loading={saving}
                disabled={!dirty || disabled}
              >
                Сохранить порядок
              </Button>
            </div>
          )}
        </div>

        {dirty && (
          <div className="text-xs text-neutral-400">
            Порядок и время точек уходят на сервер одним сохранением:{' '}
            <span className="font-mono">PATCH /routes/:id/reorder</span> с полным списком id, затем —
            время изменённых точек.
          </div>
        )}
      </footer>
    </section>
  );
}
