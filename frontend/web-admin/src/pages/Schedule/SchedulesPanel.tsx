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
  SoftWarning,
  Table,
  TableMessageRow,
  TBody,
  Td,
  Th,
  THead,
  Tr,
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
            <Table>
              <THead>
                <Th className="min-w-[220px]">Название</Th>
                <Th className="min-w-[200px]">Объект</Th>
                <Th className="min-w-[190px]">Повторение</Th>
                <Th className="min-w-[200px]">Исполнители</Th>
                <Th className="w-[90px]" align="right">
                  Смен
                </Th>
                <Th className="w-[120px]">Активность</Th>
                <Th className="w-[190px]" align="right">
                  Действия
                </Th>
              </THead>
              <TBody>
                {items.map((schedule) => {
                  const name = objectName(objects, schedule.objectId);
                  return (
                    <Tr
                      key={schedule.id}
                      testId={`schedule-row-${schedule.id}`}
                      className={isFetching ? 'opacity-60' : ''}
                    >
                      <Td>
                        <span className="block text-neutral-900">{schedule.name}</span>
                        {schedule.routeId && (
                          <span className="font-mono text-xs text-neutral-400">
                            маршрут {shortId(schedule.routeId)}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {name ?? (
                          <span className="text-neutral-400">
                            {schedule.objectId ? shortId(schedule.objectId) : 'без объекта'}
                          </span>
                        )}
                      </Td>
                      <Td mono>{describeRecurrence(schedule.recurrence)}</Td>
                      <Td>{assigneeNames(users, schedule.assignees)}</Td>
                      <Td mono align="right">
                        {schedule.eventsCount}
                      </Td>
                      <Td>
                        {schedule.isActive ? (
                          <span className="text-neutral-800">Активен</span>
                        ) : (
                          <span className="text-neutral-400">Выключен</span>
                        )}
                      </Td>
                      <Td align="right">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              data-testid={`schedule-edit-${schedule.id}`}
                              onClick={() => {
                                setDeleteError(null);
                                setForm({ schedule });
                              }}
                            >
                              Изменить
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`schedule-delete-${schedule.id}`}
                              onClick={() => {
                                setDeleteError(null);
                                setDeleting(schedule);
                              }}
                            >
                              Удалить
                            </Button>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  );
                })}

                {items.length === 0 && <TableMessageRow colSpan={7}>Графиков нет</TableMessageRow>}
              </TBody>
            </Table>
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
