import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createObject, deleteObject, listObjects, updateObject } from '../../api/core';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  ObjectStatusBadge,
  PageHeader,
  Pagination,
  ResponsiveTable,
  Select,
  SoftWarning,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import { listUsers } from '../../api/users';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useCanEdit, useIsAdmin } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import type { SessionUser } from '../../types';
import type { CreateObjectPayload, ObjectEntity } from '../../types/core';
import {
  OBJECT_ALLOWED_TRANSITIONS,
  OBJECT_STATUSES,
  OBJECT_STATUS_LABELS,
  type ObjectStatus,
} from '../../types/status';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
import { ObjectForm } from './ObjectForm';
import { apiStatus, formatInteger, formatNumber, ownerClientCell } from './utils';

/** Лимит API на выдачу списка пользователей (`take <= 100`). */
const CLIENT_ACCOUNTS_TAKE = 100;

/**
 * Ячейка «Клиент» в списке объектов: подпись берётся из привязанного аккаунта,
 * если он резолвится, иначе — из ручных `clientName`/`clientContact` с меткой
 * состояния (см. `ownerClientCell`).
 */
function ClientCell({
  object,
  clientsById,
}: {
  object: ObjectEntity;
  clientsById: Map<string, SessionUser>;
}) {
  const cell = ownerClientCell(object, clientsById);
  return (
    <>
      <div className="text-sm text-neutral-800">{cell.primary}</div>
      {cell.secondary ? <div className="text-xs text-neutral-400">{cell.secondary}</div> : null}
      {cell.hint ? <div className="text-xs text-warning-600">{cell.hint}</div> : null}
    </>
  );
}

type SortKey = 'name' | 'totalArea';
type SortOrder = 'asc' | 'desc';

const TAKE = 50;

/**
 * Пустая страница списка: в таблице текст рисует `TableMessageRow` (отступы и
 * центрирование задаёт ячейка), а в карточном режиме строка выводится как есть —
 * без рамки она выглядела бы «оторванным» текстом. Все классы — `max-md:`, чтобы
 * на планшете и desktop разметка осталась прежней.
 */
const PHONE_EMPTY =
  'max-md:block max-md:rounded-xl max-md:border max-md:border-dashed max-md:border-neutral-300 max-md:bg-white max-md:px-4 max-md:py-8 max-md:text-center max-md:text-sm max-md:text-neutral-400';

/** Модалки экрана взаимоисключающие — одно состояние вместо пяти флагов. */
type ListModal =
  | { kind: 'create' }
  | { kind: 'edit'; object: ObjectEntity }
  | { kind: 'archive'; object: ObjectEntity }
  | { kind: 'delete'; object: ObjectEntity }
  | null;

const STATUS_ACTIONS: Array<{ to: ObjectStatus; label: string }> = [
  { to: 'ACTIVE', label: 'Возобновить' },
  { to: 'PAUSED', label: 'Приостановить' },
  { to: 'ARCHIVED', label: 'Архивировать' },
];

export function ObjectsListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const skip = Number(params.get('skip') ?? '0') || 0;
  const take = Number(params.get('take') ?? String(TAKE)) || TAKE;
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({
    key: 'name',
    order: 'asc',
  });
  const [modal, setModal] = useState<ListModal>(null);
  const [formKey, setFormKey] = useState(0);
  const [formDirty, setFormDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<unknown>(null);

  const filtersActive = search !== '' || status !== '' || type !== '';
  const activeFilterCount = [search, status, type].filter((value) => value !== '').length;

  /**
   * Обновление query-строки отбрасывает `skip`: результат другого отбора — другая
   * страница. Функциональная форма `setParams` берёт актуальные параметры: между
   * вводом поиска и применением debounce пользователь может сменить фильтр.
   */
  function updateParams(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  // Обратная навигация браузера меняет query-строку, а контрол поиска — локальное
  // состояние: без синхронизации в поле остался бы прежний запрос. Проверка
  // `search !== debouncedSearch` не даёт эффекту затирать ввод: пока debounce не
  // догнал URL, значения расходятся штатно.
  useEffect(() => {
    if (search !== debouncedSearch) setSearchInput(search);
  }, [search, debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === search) return;
    updateParams({ search: debouncedSearch === '' ? null : debouncedSearch, skip: null });
    // updateParams читает параметры через функциональную форму setParams, поэтому
    // в зависимостях достаточно отложенного значения поиска.
  }, [debouncedSearch]);

  const query = useQuery({
    queryKey: ['objects', { skip, take, status, type, search }],
    queryFn: () =>
      listObjects({
        skip,
        take,
        ...(status === '' ? {} : { status }),
        ...(type === '' ? {} : { type }),
        ...(search === '' ? {} : { search }),
      }),
    placeholderData: keepPreviousData,
  });

  const objects = useMemo(() => query.data?.items ?? [], [query.data]);
  const total = query.data?.total ?? 0;
  const forbidden = apiStatus(query.error) === 403;

  /**
   * Справочник CLIENT-аккаунтов для колонки «Клиент». Загружаем один раз на
   * страницу (включая деактивированных): нужно отличать «аккаунт деактивирован»
   * от «аккаунт недоступен» (FR-13). Ошибка справочника не ломает список — в этом
   * случае резолв просто не сработает и колонка покажет `clientName`.
   */
  const clientsQuery = useQuery({
    queryKey: ['users', 'clients'],
    queryFn: async () => (await listUsers({ role: 'CLIENT', take: CLIENT_ACCOUNTS_TAKE })).items,
    staleTime: 30_000,
  });
  const clientsById = useMemo(
    () => new Map((clientsQuery.data ?? []).map((user) => [user.id, user])),
    [clientsQuery.data],
  );

  // Сортировка на клиенте: core-service отдаёт список фиксированным порядком
  // `createdAt desc`, параметров `sort`/`order` в API нет.
  const sortedObjects = useMemo(() => {
    const direction = sort.order === 'asc' ? 1 : -1;
    return [...objects].sort((left, right) => {
      if (sort.key === 'totalArea') return (left.totalArea - right.totalArea) * direction;
      return left.name.localeCompare(right.name, 'ru') * direction;
    });
  }, [objects, sort]);

  /** Опции фильтра «Тип»: значения текущей выдачи + активный фильтр (справочника нет). */
  const typeOptions = useMemo(() => {
    const values = new Set(objects.map((object) => object.type).filter((value) => value !== ''));
    if (type !== '') values.add(type);
    return [...values].sort((left, right) => left.localeCompare(right, 'ru'));
  }, [objects, type]);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['objects'] });

  const saveMutation = useMutation({
    mutationFn: (payload: CreateObjectPayload) =>
      modal?.kind === 'edit'
        ? updateObject(modal.object.id, payload)
        : createObject(payload),
    onSuccess: async () => {
      if (modal?.kind === 'edit') {
        await queryClient.invalidateQueries({ queryKey: ['object', modal.object.id] });
      }
      await invalidateList();
      if (modal?.kind === 'create') {
        setParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.delete('skip');
            return next;
          },
          { replace: true },
        );
      }
      setModal(null);
      setFormDirty(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ object, next }: { object: ObjectEntity; next: ObjectStatus }) =>
      updateObject(object.id, { status: next }),
    onSuccess: async () => {
      await invalidateList();
      setModal(null);
      setArchiveError(null);
    },
    onError: (error) => setArchiveError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: (object: ObjectEntity) => deleteObject(object.id),
    onSuccess: async () => {
      await invalidateList();
      setModal(null);
    },
  });

  function requestCloseForm() {
    if (formDirty) setDiscardOpen(true);
    else setModal(null);
  }

  function openCreate() {
    saveMutation.reset();
    setFormDirty(false);
    setFormKey((value) => value + 1);
    setModal({ kind: 'create' });
  }

  function openEdit(object: ObjectEntity) {
    saveMutation.reset();
    setFormDirty(false);
    setFormKey((value) => value + 1);
    setModal({ kind: 'edit', object });
  }

  function openArchive(object: ObjectEntity) {
    statusMutation.reset();
    setArchiveError(null);
    setModal({ kind: 'archive', object });
  }

  function openDelete(object: ObjectEntity) {
    deleteMutation.reset();
    setModal({ kind: 'delete', object });
  }

  function applyStatus(object: ObjectEntity, next: ObjectStatus) {
    if (next === 'ARCHIVED') {
      openArchive(object);
      return;
    }
    statusMutation.mutate({ object, next });
  }

  function rowItems(object: ObjectEntity): ActionMenuItem[] {
    const items: ActionMenuItem[] = [
      { label: 'Открыть', onSelect: () => navigate(ROUTES.object(object.id)) },
    ];

    if (canEdit) {
      items.push({ label: 'Редактировать', onSelect: () => openEdit(object) });
      for (const transition of STATUS_ACTIONS) {
        if (OBJECT_ALLOWED_TRANSITIONS[object.status].includes(transition.to)) {
          items.push({
            label: transition.label,
            onSelect: () => applyStatus(object, transition.to),
          });
        }
      }
    }

    if (isAdmin) {
      items.push({ label: 'Удалить', tone: 'danger', onSelect: () => openDelete(object) });
    }

    return items;
  }

  const showSkeleton = query.isLoading;
  const rowOpacity = query.isFetching && !showSkeleton ? 'opacity-60' : '';

  /**
   * Колонки списка описаны один раз: `cell` — ячейка таблицы, `card` — роль в
   * карточке на телефоне (ADR-002). Ширины `thClassName` перенесены из прежних
   * `<Th>` без изменений, поэтому на планшете и desktop таблица прежняя.
   * Сортировка остаётся на экране — она живёт в `header`.
   */
  const columns: ResponsiveColumn<ObjectEntity>[] = [
    {
      key: 'name',
      header: (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 max-lg:min-h-[44px]"
          onClick={() =>
            setSort((current) => ({
              key: 'name',
              order: current.key === 'name' && current.order === 'asc' ? 'desc' : 'asc',
            }))
          }
        >
          Название {sort.key === 'name' ? (sort.order === 'asc' ? '▲' : '▼') : ''}
        </button>
      ),
      thClassName: 'min-w-[220px]',
      cell: (object) => (
        <TableOnlyTestId id={`object-row-${object.id}`}>
          <span>{object.name}</span>
        </TableOnlyTestId>
      ),
      cellClassName: 'text-sm font-medium text-neutral-900',
      card: 'title',
    },
    {
      key: 'address',
      header: 'Адрес',
      thClassName: 'min-w-[240px]',
      cell: (object) => <span title={object.address}>{object.address}</span>,
      cellClassName: 'max-w-[320px] truncate text-neutral-500',
      card: 'subtitle',
    },
    {
      key: 'type',
      header: 'Тип',
      thClassName: 'w-[120px]',
      cell: (object) => (
        <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs text-neutral-700">
          {object.type}
        </span>
      ),
      card: 'field',
      cardLabel: 'Тип',
    },
    {
      key: 'totalArea',
      header: (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 max-lg:min-h-[44px]"
          onClick={() =>
            setSort((current) => ({
              key: 'totalArea',
              order: current.key === 'totalArea' && current.order === 'asc' ? 'desc' : 'asc',
            }))
          }
        >
          Площадь, м² {sort.key === 'totalArea' ? (sort.order === 'asc' ? '▲' : '▼') : ''}
        </button>
      ),
      thClassName: 'w-[120px]',
      align: 'right',
      mono: true,
      cell: (object) => formatNumber(object.totalArea),
      card: 'field',
      cardLabel: 'Площадь, м²',
    },
    {
      key: 'floorsCount',
      header: 'Этажей',
      thClassName: 'w-[90px]',
      align: 'right',
      mono: true,
      cell: (object) => formatInteger(object.floorsCount),
      card: 'field',
      cardLabel: 'Этажей',
    },
    {
      key: 'client',
      header: 'Клиент',
      thClassName: 'w-[200px]',
      cell: (object) => <ClientCell object={object} clientsById={clientsById} />,
      card: 'field',
      cardLabel: 'Клиент',
    },
    {
      key: 'status',
      header: 'Статус',
      thClassName: 'w-[130px]',
      cell: (object) => <ObjectStatusBadge status={object.status} />,
      card: 'badge',
    },
    {
      key: 'actions',
      header: ' ',
      thClassName: 'w-[56px]',
      // Клик в колонке действий не должен уводить в карточку объекта — правило
      // работает и в строке таблицы, и в карточке телефона.
      cell: (object) => (
        <div onClick={(event) => event.stopPropagation()}>
          <ActionMenu label={`Действия: ${object.name}`} items={rowItems(object)} />
        </div>
      ),
      cellClassName: 'text-right',
      card: 'actions',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={total > 0 ? `Объекты · ${formatInteger(total)}` : 'Объекты'}
        actions={
          canEdit ? (
            // `Button size="md"` даёт ~40 px; на телефоне главное действие списка
            // растягивается на строку и добирает высоту до тач-таргета.
            <Button
              variant="primary"
              data-testid="object-create-button"
              className="max-md:w-full max-lg:min-h-[44px]"
              onClick={openCreate}
            >
              Создать объект
            </Button>
          ) : null
        }
      />

      {/* 403 на чтение: отдельный текст, потому что «Не удалось загрузить объекты» не объясняет причину. */}
      {query.isError && forbidden && (
        <ErrorBanner
          error={new Error('Недостаточно прав для просмотра объектов')}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isError && !forbidden && (
        <ErrorBanner error={query.error} onRetry={() => void query.refetch()} />
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* На телефоне фильтры занимают строку целиком: `flex-1` с `min-w-[240px]`
              на 360 px либо распирал карточку, либо сжимал поле до нечитаемого. */}
          <div className="min-w-[240px] flex-1 max-md:min-w-0 max-md:w-full">
            <Input
              type="search"
              data-testid="objects-search"
              placeholder="Название или адрес"
              aria-label="Поиск по названию или адресу"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <Select
            data-testid="objects-status-filter"
            aria-label="Фильтр по статусу"
            value={status}
            className="w-48 max-md:w-full"
            onChange={(event) => updateParams({ status: event.target.value, skip: null })}
          >
            <option value="">Все статусы</option>
            {OBJECT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {OBJECT_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Фильтр по типу"
            value={type}
            className="w-48 max-md:w-full"
            onChange={(event) => updateParams({ type: event.target.value, skip: null })}
          >
            <option value="">Все типы</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>

          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateParams({ search: null, status: null, type: null, skip: null })
              }
            >
              Сбросить
              <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                {activeFilterCount}
              </span>
            </Button>
          )}
        </div>

        {query.isFetching && !query.isLoading && (
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-500" />
          </div>
        )}
      </Card>

      {query.isError && (
        <ErrorBanner error={query.error} onRetry={() => void query.refetch()} />
      )}

      {/*
        Частичный успех: сохранение прошло, а список не обновился (например, упал refetch).
        Пользователь должен видеть, что данные на экране могут быть устаревшими.
      */}
      {!query.isError && query.isRefetchError && (
        <SoftWarning>Список может быть неактуален — обновите страницу.</SoftWarning>
      )}

      {statusMutation.isError && modal === null && (
        <ErrorBanner error={statusMutation.error} onRetry={() => statusMutation.reset()} />
      )}

      {!query.isError &&
        (total === 0 && !showSkeleton ? (
          filtersActive ? (
            <EmptyState
              title="Ничего не найдено"
              hint="Измените условия поиска"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    updateParams({ search: null, status: null, type: null, skip: null })
                  }
                >
                  Сбросить фильтры
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Объектов пока нет"
              hint="Создайте первый объект обслуживания"
              action={
                canEdit ? (
                  <Button variant="primary" className="max-lg:min-h-[44px]" onClick={openCreate}>
                    Создать объект
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <Card padded={false}>
            {/*
              Один список на два представления: `<table>` на `md+` — прежние
              8 колонок, карточки на телефоне. `onRowClick` — переход в карточку
              объекта, к которому привыкли и мышь, и e2e; прежний `data-testid`
              строки (`object-row-<id>`) ставит `TableOnlyTestId` в ячейке названия —
              так он остаётся в DOM ровно один раз (примитив держит и таблицу, и
              карточки одновременно, см. `components/ui/TableOnlyTestId.tsx`).
            */}
            <ResponsiveTable
              items={sortedObjects}
              getKey={(object) => object.id}
              rowClassName={() => rowOpacity}
              onRowClick={(object) => navigate(ROUTES.object(object.id))}
              loading={showSkeleton}
              empty={<span className={PHONE_EMPTY}>Объектов на этой странице нет</span>}
              columns={columns}
            />

            <Pagination
              total={total}
              skip={skip}
              take={take}
              disabled={query.isFetching}
              onChange={({ skip: nextSkip, take: nextTake }) =>
                updateParams({ skip: String(nextSkip), take: String(nextTake) })
              }
            />
          </Card>
        ))}

      <Modal
        open={modal?.kind === 'create' || modal?.kind === 'edit'}
        title={modal?.kind === 'edit' ? 'Редактирование объекта' : 'Новый объект'}
        size="lg"
        busy={saveMutation.isPending}
        onClose={requestCloseForm}
      >
        {modal?.kind === 'create' || modal?.kind === 'edit' ? (
          <ObjectForm
            key={formKey}
            object={modal.kind === 'edit' ? modal.object : undefined}
            saving={saveMutation.isPending}
            error={saveMutation.error}
            onDirtyChange={setFormDirty}
            onCancel={requestCloseForm}
            onSubmit={(payload) => saveMutation.mutate(payload)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={discardOpen}
        title="Отменить изменения?"
        message="Введённые данные не сохранятся."
        confirmLabel="Отменить изменения"
        cancelLabel="Продолжить редактирование"
        busy={false}
        onConfirm={() => {
          setDiscardOpen(false);
          setFormDirty(false);
          setModal(null);
        }}
        onCancel={() => setDiscardOpen(false)}
      />

      <ConfirmDialog
        open={modal?.kind === 'archive'}
        title="Архивировать объект?"
        message={
          modal?.kind === 'archive' ? (
            <div className="flex flex-col gap-3">
              <span>
                Объект «{modal.object.name}» перейдёт в статус «В архиве» и перестанет попадать в
                планирование. Этажи, помещения и маршруты сохранятся.
              </span>
              {archiveError ? <ErrorBanner error={archiveError} /> : null}
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Архивировать"
        busy={statusMutation.isPending}
        onConfirm={() => {
          if (modal?.kind === 'archive') {
            statusMutation.mutate({ object: modal.object, next: 'ARCHIVED' });
          }
        }}
        onCancel={() => {
          setModal(null);
          setArchiveError(null);
        }}
      />

      <ConfirmDialog
        open={modal?.kind === 'delete'}
        title="Удалить объект?"
        message={
          modal?.kind === 'delete' ? (
            <div className="flex flex-col gap-3">
              <span>
                Объект «{modal.object.name}» будет удалён вместе с этажами, помещениями и
                маршрутами. Действие необратимо.
              </span>
              <span className="text-xs text-neutral-500">
                Если у объекта есть активные маршруты, удаление запрещено — сначала переведите их в
                архив.
              </span>
              {deleteMutation.error ? <ErrorBanner error={deleteMutation.error} /> : null}
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Удалить"
        busy={deleteMutation.isPending}
        onConfirm={() => {
          if (modal?.kind === 'delete') deleteMutation.mutate(modal.object);
        }}
        onCancel={() => {
          setModal(null);
          deleteMutation.reset();
        }}
      />
    </div>
  );
}
