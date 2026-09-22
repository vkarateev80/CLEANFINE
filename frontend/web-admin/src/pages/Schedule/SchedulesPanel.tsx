import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteSchedule } from '../../api/schedule';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  ResponsiveTable,
  SoftWarning,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import { useCanManageSchedule } from '../../hooks/usePermissions';
import type { SessionUser } from '../../types';
import type { ObjectEntity } from '../../types/core';
import type { ScheduleEntity } from '../../types/schedule';
import { ScheduleFormModal } from './ScheduleFormModal';
import { apiStatus, describeRecurrence, shortId } from './scheduleHelpers';

/**
 * Вкладка «Графики»: таблица правил повторения с созданием, правкой и удалением.
 *
 * Список отдаётся сервисом целиком (пагинации в `GET /api/schedule` нет), поэтому
 * клиентской страничности здесь нет — она создавала бы вид пагинации, которой API
 * не умеет. Число смен приходит готовым полем `eventsCount`, экран его не считает.
 *
 * Права: создание/правка/удаление — ADMIN/SUPERVISOR (`@Roles` контроллера).
 * Кнопки показываются по `useCanManageSchedule`, а 403 из API всё равно
 * выводится текстом — роль могла измениться на сервере.
 */

/** Имя объекта: у графиков хранится только id (FK между сервисами нет). */
function objectName(objects: ObjectEntity[], id: string | null): string | null {
  if (!id) return null;
  return objects.find((object) => object.id === id)?.name ?? null;
}

/** Имена исполнителей строкой: уволенный сотрудник остаётся в графике по id. */
function assigneeNames(users: SessionUser[], ids: string[]): string {
  if (ids.length === 0) return '—';
  return ids
    .map((id) => users.find((user) => user.id === id)?.fullName ?? shortId(id))
    .join(', ');
}

export function SchedulesPanel({
  schedules,
  isLoading,
  error,
  isFetching,
  isRefetchError,
  onRetry,
  objects,
  users,
}: {
  /** `undefined` — данные ещё не пришли; пустой массив — графиков нет. */
  schedules: ScheduleEntity[] | undefined;
  isLoading: boolean;
  error: unknown;
  isFetching: boolean;
  isRefetchError: boolean;
  onRetry: () => void;
  objects: ObjectEntity[];
  users: SessionUser[];
}) {
  const canManage = useCanManageSchedule();
  const queryClient = useQueryClient();

  /** Открытая модалка: `{ schedule: null }` — создание, иначе правка. */
  const [form, setForm] = useState<{ schedule: ScheduleEntity | null } | null>(null);
  const [deleting, setDeleting] = useState<ScheduleEntity | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: async () => {
      setDeleting(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
    onError: (mutationError) => setDeleteError(mutationError),
  });

  const items = schedules ?? [];
  const forbidden = apiStatus(error) === 403;

  /**
   * Колонки списка графиков: `cell` — прежняя ячейка таблицы, `card` — роль в
   * карточке телефона (сущность — название графика, статус — «Активен/Выключен»).
   *
   * `rowTestId` не передан: `schedule-row-<id>` существующий e2e считает строго
   * (`toHaveCount(1)`), а примитив держит в DOM и таблицу, и карточки — дубль id
   * сломал бы подсчёт (см. `TableOnlyTestId` в UI-ките). Хук строки остаётся
   * в табличной ячейке, карточка получает канонический `data-testid="card"`.
   */
  const columns: ResponsiveColumn<ScheduleEntity>[] = [
    {
      key: 'name',
      header: 'Название',
      thClassName: 'min-w-[220px]',
      card: 'title',
      cell: (schedule) => (
        <>
          <TableOnlyTestId id={`schedule-row-${schedule.id}`}>
            <span className="block text-neutral-900">{schedule.name}</span>
          </TableOnlyTestId>
          {schedule.routeId && (
            <span className="block font-mono text-xs font-normal text-neutral-400">
              маршрут {shortId(schedule.routeId)}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'object',
      header: 'Объект',
      thClassName: 'min-w-[200px]',
      card: 'field',
      cardLabel: 'Объект',
      cell: (schedule) => {
        const name = objectName(objects, schedule.objectId);
        return (
          name ?? (
            <span className="text-neutral-400">
              {schedule.objectId ? shortId(schedule.objectId) : 'без объекта'}
            </span>
          )
        );
      },
    },
    {
      key: 'recurrence',
      header: 'Повторение',
      thClassName: 'min-w-[190px]',
      mono: true,
      card: 'field',
      cardLabel: 'Повторение',
      cell: (schedule) => describeRecurrence(schedule.recurrence),
    },
    {
      key: 'assignees',
      header: 'Исполнители',
      thClassName: 'min-w-[200px]',
      card: 'field',
      cardLabel: 'Исполнители',
      cell: (schedule) => assigneeNames(users, schedule.assignees),
    },
    {
      key: 'events',
      header: 'Смен',
      thClassName: 'w-[90px]',
      align: 'right',
      mono: true,
      card: 'field',
      cardLabel: 'Смен',
      cell: (schedule) => schedule.eventsCount,
    },
    {
      key: 'active',
      header: 'Активность',
      thClassName: 'w-[120px]',
      card: 'badge',
      cell: (schedule) =>
        schedule.isActive ? (
          <span className="text-neutral-800">Активен</span>
        ) : (
          <span className="text-neutral-400">Выключен</span>
        ),
    },
    {
      key: 'actions',
      header: 'Действия',
      thClassName: 'w-[190px]',
      align: 'right',
      card: 'actions',
      cell: (schedule) =>
        canManage && (
          <div className="flex justify-end gap-2">
            <TableOnlyTestId id={`schedule-edit-${schedule.id}`}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setForm({ schedule });
                }}
              >
                Изменить
              </Button>
            </TableOnlyTestId>
            <TableOnlyTestId id={`schedule-delete-${schedule.id}`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(schedule);
                }}
              >
                Удалить
              </Button>
            </TableOnlyTestId>
          </div>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-500">
          {items.length === 0 ? 'Графиков нет' : `Всего графиков: ${items.length}`}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {canManage && (
            <Button
              variant="primary"
              data-testid="schedule-create-button"
              // Главное действие вкладки: на телефоне и планшете таргет ≥44 px.
              className="max-lg:min-h-[44px] max-md:w-full"
              onClick={() => setForm({ schedule: null })}
            >
              Создать график
            </Button>
          )}
        </div>
      </Card>

      {error ? (
        <ErrorBanner
          error={
            forbidden
              ? new Error('Недостаточно прав: список графиков недоступен для вашей роли')
              : error
          }
          onRetry={onRetry}
        />
      ) : null}

      {deleteError ? (
        <ErrorBanner error={deleteError} onRetry={() => setDeleteError(null)} />
      ) : null}

      {!error && isRefetchError && (
        <SoftWarning>Список графиков может быть неактуален — обновите страницу.</SoftWarning>
      )}

      {!error &&
        (isLoading ? (
          <LoadingBlock label="Читаем графики…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="Графиков пока нет"
            hint="График задаёт правило повторения: частоту, время начала в UTC и исполнителей. По активным графикам генерируются смены и плановые заявки."
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setForm({ schedule: null })}>
                  Создать график
                </Button>
              ) : null
            }
          />
        ) : (
          <Card padded={false}>
            <ResponsiveTable<ScheduleEntity>
              items={items}
              getKey={(schedule) => schedule.id}
              columns={columns}
              rowClassName={() => (isFetching ? 'opacity-60' : '')}
              empty="Графиков нет"
            />
          </Card>
        ))}

      {/*
        Модалка монтируется заново на каждое открытие (`key`): иначе форма
        сохранила бы состояние прошлого вызова — с прежним графиком и днями.
      */}
      {form && (
        <ScheduleFormModal
          key={form.schedule ? `edit-${form.schedule.id}` : 'create'}
          open
          schedule={form.schedule}
          objects={objects}
          users={users}
          onClose={() => setForm(null)}
          onSaved={() => setForm(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить график?"
        message={
          <>
            График «{deleting?.name}» будет удалён вместе со сменами по нему
            {deleting && deleting.eventsCount > 0 ? ` (${deleting.eventsCount} шт.)` : ''}.
            Действие необратимо.
          </>
        }
        busy={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
