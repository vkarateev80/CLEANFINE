import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createFloor,
  deleteFloor,
  getObjectDetail,
  listFloors,
  listTechCards,
  updateFloor,
  updateObject,
  uploadFloorPlan,
} from '../../api/core';
import { listUsers } from '../../api/users';
import { roomColorZone } from '@cleaning-ops/shared/types/color-coding';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ColorZoneBadge,
  ConfirmDialog,
  DetailRow,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  Modal,
  ObjectStatusBadge,
  PageHeader,
  ResponsiveTable,
  RouteStatusBadge,
  TableOnlyTestId,
  type ResponsiveColumn,
} from '../../components/ui';
import { useCanEdit, useIsAdmin } from '../../hooks/usePermissions';
import { ChatPanel } from '../Messages/ChatPanel';
import { ROUTES } from '../../router/routes';
import type { SessionUser } from '../../types';
import type {
  CreateFloorPayload,
  CreateObjectPayload,
  FloorEntity,
  ObjectDetail,
  RoomEntity,
  RouteWithPoints,
} from '../../types/core';
import { OBJECT_ALLOWED_TRANSITIONS, type ObjectStatus } from '../../types/status';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
import { FloorForm } from './FloorForm';
import { ObjectForm } from './ObjectForm';
import { UploadPlanModal } from './UploadPlanModal';
import {
  apiStatus,
  contactLink,
  formatCoordinate,
  formatDateTime,
  formatInteger,
  formatNumber,
  formatScale,
  mapboxToken,
  ownerClientCell,
} from './utils';

/** Лимит API на выдачу списка пользователей (`take <= 100`). */
const CLIENT_ACCOUNTS_TAKE = 100;

/**
 * Пустое состояние вложенной таблицы: в таблице текст рисует `TableMessageRow`,
 * а в карточном режиме строка выводится как есть — без рамки она выглядела бы
 * «оторванной». Классы только `max-md:`, планшет и desktop не затрагиваются.
 */
const PHONE_EMPTY =
  'max-md:block max-md:rounded-xl max-md:border max-md:border-dashed max-md:border-neutral-300 max-md:bg-white max-md:px-4 max-md:py-8 max-md:text-center max-md:text-sm max-md:text-neutral-400';

type DetailTab = 'floors' | 'rooms' | 'routes';

type DetailModal =
  | { kind: 'object'; object: ObjectDetail }
  | { kind: 'floor'; floor?: FloorEntity }
  | { kind: 'plan'; floor: FloorEntity }
  | { kind: 'deleteFloor'; floor: FloorEntity }
  | { kind: 'archive' }
  | null;

const STATUS_ACTIONS: Array<{ to: ObjectStatus; label: string }> = [
  { to: 'ACTIVE', label: 'Возобновить' },
  { to: 'PAUSED', label: 'Приостановить' },
];

/** Счётчики помещений и маршрутов приходят вложенными в `GET /objects/:id/floors`. */
function floorRooms(floor: FloorEntity): unknown[] {
  const value = (floor as FloorEntity & { rooms?: unknown[] }).rooms;
  return Array.isArray(value) ? value : [];
}

function floorRoutes(floor: FloorEntity): unknown[] {
  const value = (floor as FloorEntity & { routes?: unknown[] }).routes;
  return Array.isArray(value) ? value : [];
}

/**
 * Строка «Аккаунт заказчика»: привязка (`ownerClientId`) — единственный признак
 * доступа заказчика к объекту, поэтому показываем её отдельно от legacy-текста
 * `clientName`/`clientContact`. Деактивированный/нерезолвящийся аккаунт помечается.
 */
function OwnerClientRow({
  detail,
  clientsById,
}: {
  detail: ObjectDetail;
  clientsById: Map<string, SessionUser>;
}) {
  const cell = ownerClientCell(detail, clientsById);
  return (
    <DetailRow label="Аккаунт заказчика">
      {cell.state === 'bound' || cell.state === 'deactivated' ? cell.primary : 'не привязан'}
      {cell.hint ? <span className="ml-2 text-xs text-warning-600">{cell.hint}</span> : null}
    </DetailRow>
  );
}

export function ObjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const [tab, setTab] = useState<DetailTab>('floors');
  const [modal, setModal] = useState<DetailModal>(null);
  const [formKey, setFormKey] = useState(0);
  const [formDirty, setFormDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['object', id],
    queryFn: () => getObjectDetail(id),
    enabled: id !== '',
  });

  const floorsQuery = useQuery({
    queryKey: ['floors', id],
    queryFn: () => listFloors(id),
    enabled: id !== '',
  });

  const detail: ObjectDetail | undefined = detailQuery.data;

  /**
   * Справочник CLIENT-аккаунтов для строки «Клиент»: по `ownerClientId` показываем
   * `fullName (email)`, включая деактивированных (метка FR-13). Без привязки —
   * ручной `clientName` + метка «Без привязки».
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
  const floors = useMemo(
    () => [...(floorsQuery.data ?? [])].sort((left, right) => left.number - right.number),
    [floorsQuery.data],
  );
  const archived = detail?.status === 'ARCHIVED';

  // Техкарты для колонки «Техкарта» сводки помещений: показываем название, а не
  // UUID (07.11.2026). Тот же ключ и размер выборки, что у плана этажа, — кэш общий.
  const techCardsQuery = useQuery({
    queryKey: ['tech-cards', { skip: 0, take: 100 }],
    queryFn: () => listTechCards({ skip: 0, take: 100 }),
    enabled: tab === 'rooms',
    staleTime: 60_000,
  });
  const techCardNames = useMemo(
    () => new Map((techCardsQuery.data?.items ?? []).map((card) => [card.id, card.name])),
    [techCardsQuery.data],
  );

  const allRooms = useMemo(
    () => (detail?.floors ?? []).flatMap((floor) => floor.rooms.map((room) => ({ floor, room }))),
    [detail],
  );
  const allRoutes = useMemo(
    () =>
      (detail?.floors ?? []).flatMap((floor) => floor.routes.map((route) => ({ floor, route }))),
    [detail],
  );

  // После мутаций этажей детали объекта тоже устаревают: в них вложены
  // помещения и маршруты, которые каскадно меняются вместе с этажом.
  function invalidateFloors() {
    void queryClient.invalidateQueries({ queryKey: ['floors', id] });
    void queryClient.invalidateQueries({ queryKey: ['object', id] });
    void queryClient.invalidateQueries({ queryKey: ['objects'] });
  }

  function invalidateObject() {
    void queryClient.invalidateQueries({ queryKey: ['object', id] });
    void queryClient.invalidateQueries({ queryKey: ['objects'] });
  }

  const objectMutation = useMutation({
    mutationFn: (payload: CreateObjectPayload) => updateObject(id, payload),
    onSuccess: () => {
      invalidateObject();
      setModal(null);
      setFormDirty(false);
    },
  });

  const floorMutation = useMutation({
    mutationFn: ({ floorId, payload }: { floorId?: string; payload: CreateFloorPayload }) =>
      floorId === undefined ? createFloor(id, payload) : updateFloor(floorId, payload),
    onSuccess: () => {
      invalidateFloors();
      setModal(null);
      setFormDirty(false);
    },
  });

  const [planProgress, setPlanProgress] = useState<number | null>(null);
  const planMutation = useMutation({
    mutationFn: ({
      floorId,
      file,
      planScale,
    }: {
      floorId: string;
      file: File;
      planScale?: number;
    }) => {
      setPlanProgress(0);
      return uploadFloorPlan(floorId, file, planScale, setPlanProgress);
    },
    onSuccess: () => {
      invalidateFloors();
      setModal(null);
    },
    onSettled: () => setPlanProgress(null),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (floorId: string) => deleteFloor(floorId),
    onSuccess: () => {
      invalidateFloors();
      setModal(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateObject(id, { status: 'ARCHIVED' }),
    onSuccess: () => {
      invalidateObject();
      setModal(null);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (next: ObjectStatus) => updateObject(id, { status: next }),
    onSuccess: () => invalidateObject(),
  });

  // Форма в модалке сбрасывает своё состояние по key: без этого после закрытия
  // остались бы данные прошлой правки. Сужаем тип явной проверкой: функция
  // объявлена до ранних возвратов по загрузке, где `detail` ещё может быть undefined.
  function openObject() {
    if (detail === undefined) return;
    objectMutation.reset();
    setFormDirty(false);
    setFormKey((value) => value + 1);
    setModal({ kind: 'object', object: detail });
  }

  function openFloor(floor?: FloorEntity) {
    floorMutation.reset();
    setFormDirty(false);
    setFormKey((value) => value + 1);
    setModal({ kind: 'floor', floor });
  }

  function openPlan(floor: FloorEntity) {
    planMutation.reset();
    setModal({ kind: 'plan', floor });
  }

  function requestCloseForm() {
    if (formDirty) setDiscardOpen(true);
    else setModal(null);
  }

  const status = apiStatus(detailQuery.error);
  const notFound = status === 404;

  if (id === '') {
    return (
      <EmptyState
        title="Объект не найден или удалён"
        action={
          <Button variant="secondary" onClick={() => navigate(ROUTES.objects)}>
            К списку объектов
          </Button>
        }
      />
    );
  }

  if (notFound) {
    return (
      <EmptyState
        title="Объект не найден или удалён"
        action={
          <Button variant="secondary" onClick={() => navigate(ROUTES.objects)}>
            К списку объектов
          </Button>
        }
      />
    );
  }

  if (status === 403) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={[{ label: 'Объекты', to: ROUTES.objects }, { label: 'Объект' }]} />
        <ErrorBanner
          error={new Error('Недостаточно прав для просмотра этого объекта')}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={[{ label: 'Объекты', to: ROUTES.objects }, { label: 'Объект' }]} />
        <ErrorBanner error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
      </div>
    );
  }

  if (detailQuery.isLoading || detail === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={[{ label: 'Объекты', to: ROUTES.objects }, { label: 'Загрузка…' }]} />
        <LoadingBlock label="Загрузка объекта…" />
      </div>
    );
  }

  const contact = contactLink(detail.clientContact);
  const token = mapboxToken();
  const declaredFloors = detail.floorsCount;
  const actualFloors = floors.length;
  const roomsTotal = floors.reduce<number>((sum, floor) => {
    const rooms = floorRooms(floor);
    return (
      sum +
      rooms.reduce<number>((roomSum, room) => {
        const area = (room as { areaM2?: unknown }).areaM2;
        return roomSum + (typeof area === 'number' ? area : 0);
      }, 0)
    );
  }, 0);

  const headerActions = (
    // На телефоне три кнопки в строку не помещаются и сжимались бы ниже тач-таргета:
    // действия уезжают второй строкой шапки (`PageHeader` уже переносит блок) и
    // растягиваются на всю ширину. На `md+` это прежний ряд с тем же `gap-3`.
    <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-col max-md:items-stretch">
      {canEdit && (
        <Button variant="secondary" className="max-lg:min-h-[44px]" onClick={openObject}>
          Редактировать
        </Button>
      )}
      {canEdit && (
        <Button
          variant="primary"
          data-testid="floor-create-button"
          className="max-lg:min-h-[44px]"
          disabled={archived}
          onClick={() => openFloor()}
        >
          Добавить этаж
        </Button>
      )}
      {canEdit && OBJECT_ALLOWED_TRANSITIONS[detail.status].includes('ARCHIVED') && (
        <Button
          variant="danger"
          className="max-lg:min-h-[44px]"
          disabled={archived}
          onClick={() => {
            archiveMutation.reset();
            setModal({ kind: 'archive' });
          }}
        >
          В архив
        </Button>
      )}
    </div>
  );

  function floorItems(floor: FloorEntity): ActionMenuItem[] {
    const items: ActionMenuItem[] = [
      { label: 'Открыть план', onSelect: () => navigate(ROUTES.floorPlan(id, floor.id)) },
    ];

    if (canEdit) {
      items.push({ label: 'Загрузить/заменить план', onSelect: () => openPlan(floor) });
      items.push({ label: 'Редактировать', onSelect: () => openFloor(floor) });
    }

    if (isAdmin) {
      items.push({
        label: 'Удалить',
        tone: 'danger',
        onSelect: () => {
          deleteFloorMutation.reset();
          setModal({ kind: 'deleteFloor', floor });
        },
      });
    }

    return items;
  }

  const planFloor = modal?.kind === 'plan' ? modal.floor : undefined;
  const deleteFloorTarget = modal?.kind === 'deleteFloor' ? modal.floor : undefined;

  /**
   * Три вложенные таблицы (этажи, помещения, маршруты) описаны один раз и
   * переключаются на карточки на телефоне (ADR-002). Роли в карточке: `title` —
   * имя сущности, `subtitle` — контекст (этаж), `badge` — статус, `field` —
   * строки «подпись — значение», `actions` — меню действий. Ширины `thClassName`
   * перенесены из прежних `<Th>` — на `md+` таблицы остались прежними.
   */
  const floorColumns: ResponsiveColumn<FloorEntity>[] = [
    {
      key: 'number',
      header: '№',
      thClassName: 'w-[70px]',
      mono: true,
      cell: (floor) => formatInteger(floor.number),
      card: 'field',
      cardLabel: '№',
    },
    {
      key: 'name',
      header: 'Название',
      thClassName: 'min-w-[180px]',
      cell: (floor) => <TableOnlyTestId id={`floor-row-${floor.id}`}>{floor.name}</TableOnlyTestId>,
      cellClassName: 'text-sm font-medium text-neutral-900',
      card: 'title',
    },
    {
      key: 'plan',
      header: 'План',
      thClassName: 'min-w-[160px]',
      cell: (floor) =>
        floor.planImageUrl ? (
          <div className="flex items-center gap-2">
            <img
              src={floor.planImageUrl}
              alt={`План этажа: ${floor.name}`}
              className="h-10 w-16 rounded-md border border-neutral-200 object-cover"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={!canEdit || archived}
              onClick={(event) => {
                event.stopPropagation();
                openPlan(floor);
              }}
            >
              Заменить
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canEdit || archived}
              onClick={(event) => {
                event.stopPropagation();
                openPlan(floor);
              }}
            >
              Загрузить план
            </Button>
            <span className="text-xs text-warning-600">План не загружен</span>
          </div>
        ),
      card: 'field',
      cardLabel: 'План',
    },
    {
      key: 'scale',
      header: 'Масштаб',
      thClassName: 'w-[110px]',
      mono: true,
      cell: (floor) => (floor.planScale === null ? '—' : formatScale(floor.planScale)),
      card: 'field',
      cardLabel: 'Масштаб',
    },
    {
      key: 'rooms',
      header: 'Помещений',
      thClassName: 'w-[120px]',
      align: 'right',
      mono: true,
      cell: (floor) => {
        const roomsCount = floorRooms(floor).length;
        return (
          <span className={roomsCount === 0 ? 'text-neutral-400' : undefined}>
            {formatInteger(roomsCount)}
          </span>
        );
      },
      card: 'field',
      cardLabel: 'Помещений',
    },
    {
      key: 'routes',
      header: 'Маршрутов',
      thClassName: 'w-[120px]',
      align: 'right',
      mono: true,
      cell: (floor) => formatInteger(floorRoutes(floor).length),
      card: 'field',
      cardLabel: 'Маршрутов',
    },
    {
      key: 'actions',
      header: ' ',
      thClassName: 'w-[56px]',
      cell: (floor) => (
        <div onClick={(event) => event.stopPropagation()}>
          <ActionMenu label={`Действия: ${floor.name}`} items={floorItems(floor)} />
        </div>
      ),
      cellClassName: 'text-right',
      card: 'actions',
    },
  ];

  const roomColumns: ResponsiveColumn<{ floor: FloorEntity; room: RoomEntity }>[] = [
    {
      key: 'name',
      header: 'Помещение',
      thClassName: 'min-w-[220px]',
      cell: ({ room }) => room.name,
      cellClassName: 'text-sm font-medium text-neutral-900',
      card: 'title',
    },
    {
      key: 'floor',
      header: 'Этаж',
      thClassName: 'min-w-[180px]',
      cell: ({ floor }) => floor.name,
      card: 'subtitle',
    },
    {
      key: 'area',
      header: 'Площадь, м²',
      thClassName: 'w-[120px]',
      align: 'right',
      mono: true,
      cell: ({ room }) => formatNumber(room.areaM2, 1),
      card: 'field',
      cardLabel: 'Площадь, м²',
    },
    {
      key: 'floorType',
      header: 'Тип',
      thClassName: 'w-[140px]',
      cell: ({ room }) => room.floorType,
      card: 'field',
      cardLabel: 'Тип',
    },
    {
      key: 'zone',
      header: 'Зона',
      thClassName: 'w-[160px]',
      cell: ({ room }) => room.zone ?? '—',
      card: 'field',
      cardLabel: 'Зона',
    },
    {
      key: 'colorZone',
      header: 'Инвентарь',
      thClassName: 'w-[150px]',
      cell: ({ room }) => <ColorZoneBadge zone={roomColorZone(room)} />,
      card: 'field',
      cardLabel: 'Инвентарь',
    },
    {
      key: 'techCard',
      header: 'Техкарта',
      thClassName: 'w-[160px]',
      // Название из справочника; пока он грузится или карта удалена — нейтральная
      // подпись вместо UUID.
      cell: ({ room }) =>
        room.techCardId ? (techCardNames.get(room.techCardId) ?? 'Техкарта назначена') : '—',
      card: 'field',
      cardLabel: 'Техкарта',
    },
    {
      // Переход в настройки помещения (14.10.2026): план этажа открывается с
      // уже раскрытой карточкой этого помещения. Строка кликабельна целиком,
      // кнопка — явный вход для тех, кто не ждёт клика по строке.
      key: 'open',
      header: '',
      thClassName: 'w-[120px]',
      align: 'right',
      cell: ({ floor, room }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Настройки помещения «${room.name}»`}
          data-testid={`room-open-${room.id}`}
          onClick={(event) => {
            event.stopPropagation();
            navigate(ROUTES.floorRoom(id, floor.id, room.id));
          }}
        >
          Настроить →
        </Button>
      ),
      card: 'actions',
    },
  ];

  const routeColumns: ResponsiveColumn<{ floor: FloorEntity; route: RouteWithPoints }>[] = [
    {
      key: 'name',
      header: 'Маршрут',
      thClassName: 'min-w-[220px]',
      cell: ({ floor, route }) => (
        <Link
          className="hover:text-primary-600 max-lg:inline-flex max-lg:items-center max-lg:min-h-[44px]"
          to={`${ROUTES.routes}?floorId=${floor.id}`}
        >
          {route.name}
        </Link>
      ),
      cellClassName: 'text-sm font-medium text-neutral-900',
      card: 'title',
    },
    {
      key: 'floor',
      header: 'Этаж',
      thClassName: 'w-[140px]',
      cell: ({ floor }) => floor.name,
      card: 'subtitle',
    },
    {
      key: 'status',
      header: 'Статус',
      thClassName: 'w-[140px]',
      cell: ({ route }) => <RouteStatusBadge status={route.status} />,
      card: 'badge',
    },
    {
      key: 'points',
      header: 'Точек',
      thClassName: 'w-[120px]',
      align: 'right',
      mono: true,
      cell: ({ route }) => formatInteger(route.points.length),
      card: 'field',
      cardLabel: 'Точек',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Объекты', to: ROUTES.objects }, { label: detail.name }]} />
        }
        title={detail.name}
        subtitle={<ObjectStatusBadge status={detail.status} />}
        actions={headerActions}
      />

      {archived && (
        <div className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Объект в архиве. Редактирование ограничено.
        </div>
      )}

      {pauseMutation.isError && <ErrorBanner error={pauseMutation.error} />}

      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailRow label="Тип">{detail.type}</DetailRow>
          <DetailRow label="Общая площадь">
            <span className="font-mono">{formatNumber(detail.totalArea)} м²</span>
          </DetailRow>
          <DetailRow label="Этажей (заявлено)">
            <span className="font-mono">{formatInteger(declaredFloors)}</span>
          </DetailRow>
          <DetailRow label="Этажей (фактически)">
            <span className="font-mono">{formatInteger(actualFloors)}</span>
            {declaredFloors !== actualFloors && (
              <span className="text-xs text-warning-600"> ⚠ расходится с заявленным</span>
            )}
          </DetailRow>
          <DetailRow label="Адрес">{detail.address}</DetailRow>
          <OwnerClientRow detail={detail} clientsById={clientsById} />
          <DetailRow label="Клиент">{detail.clientName}</DetailRow>
          <DetailRow label="Контакт клиента">
            {contact ? (
              <a
                className="text-primary-600 hover:underline max-lg:inline-flex max-lg:items-center max-lg:min-h-[44px]"
                href={contact.href}
              >
                {contact.label}
              </a>
            ) : (
              detail.clientContact
            )}
          </DetailRow>
          <DetailRow label="Координаты">
            <span className="font-mono text-xs">
              {formatCoordinate(detail.lat)}, {formatCoordinate(detail.lng)}
            </span>
            {token !== undefined && (
              <a
                className="ml-2 text-xs text-primary-600 hover:underline max-lg:inline-flex max-lg:items-center max-lg:min-h-[44px]"
                href={`https://www.openstreetmap.org/?mlat=${detail.lat}&mlon=${detail.lng}#map=17/${detail.lat}/${detail.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Открыть в картах
              </a>
            )}
          </DetailRow>
          <DetailRow label="Площадь помещений (справочно)">
            <span className="font-mono">
              {roomsTotal > 0 ? `${formatNumber(roomsTotal)} м²` : '—'}
            </span>
          </DetailRow>
          <DetailRow label="Создан">
            <span className="text-xs text-neutral-500">{formatDateTime(detail.createdAt)}</span>
          </DetailRow>
          <DetailRow label="Изменён">
            <span className="text-xs text-neutral-500">{formatDateTime(detail.updatedAt)}</span>
          </DetailRow>
        </div>

        {canEdit && (
          <div className="mt-6 flex flex-wrap gap-3">
            {STATUS_ACTIONS.filter((action) =>
              OBJECT_ALLOWED_TRANSITIONS[detail.status].includes(action.to),
            ).map((action) => (
              <Button
                key={action.to}
                variant="secondary"
                size="sm"
                loading={pauseMutation.isPending}
                onClick={() => pauseMutation.mutate(action.to)}
              >
                {action.label}
              </Button>
            ))}
            {OBJECT_ALLOWED_TRANSITIONS[detail.status].length === 0 && (
              <Badge tone="neutral">Терминальный статус — переходы недоступны</Badge>
            )}
          </div>
        )}
      </Card>

      {/*
        Полоса вкладок: три подписи на 360 px не влезают в строку. На телефоне
        она становится собственным контейнером со скроллом (страница по
        горизонтали при этом не скроллится), на планшете и desktop — прежняя.
      */}
      <div className="flex gap-6 border-b border-neutral-200 text-sm max-md:gap-4 max-md:overflow-x-auto">
        <TabButton active={tab === 'floors'} onClick={() => setTab('floors')}>
          Этажи
        </TabButton>
        <TabButton active={tab === 'rooms'} onClick={() => setTab('rooms')}>
          Сводка помещений
        </TabButton>
        <TabButton active={tab === 'routes'} onClick={() => setTab('routes')}>
          Маршруты объекта
        </TabButton>
      </div>

      {tab === 'floors' && (
        <div className="flex flex-col gap-4">
          {floorsQuery.isError ? (
            <ErrorBanner error={floorsQuery.error} onRetry={() => void floorsQuery.refetch()} />
          ) : floorsQuery.isLoading ? (
            <LoadingBlock label="Загрузка этажей…" />
          ) : floors.length === 0 ? (
            <EmptyState
              title="У объекта ещё нет этажей"
              action={
                canEdit ? (
                  <Button variant="primary" disabled={archived} onClick={() => openFloor()}>
                    Добавить этаж
                  </Button>
                ) : null
              }
            />
          ) : (
            <Card padded={false}>
              {/* `floor-row-<id>` e2e читает из `data-testid` и по нему открывает план:
                  прежний селектор ставит `TableOnlyTestId` в ячейке названия этажа —
                  в DOM он ровно один (примитив держит таблицу и карточки сразу). */}
              <ResponsiveTable
                items={floors}
                getKey={(floor) => floor.id}
                rowClassName={(floor) =>
                  planMutation.isPending && planFloor?.id === floor.id ? 'opacity-60' : ''
                }
                onRowClick={(floor) => navigate(ROUTES.floorPlan(id, floor.id))}
                columns={floorColumns}
              />
            </Card>
          )}
        </div>
      )}

      {tab === 'rooms' && (
        <Card padded={false}>
          {/* Плоский список помещений всех этажей: на телефоне — карточки в одну
              колонку, «этаж» становится подзаголовком карточки. */}
          <ResponsiveTable
            items={allRooms}
            getKey={({ room }) => room.id}
            columns={roomColumns}
            onRowClick={({ floor, room }) => navigate(ROUTES.floorRoom(id, floor.id, room.id))}
            empty={<span className={PHONE_EMPTY}>Помещения не заведены</span>}
          />
        </Card>
      )}

      {tab === 'routes' && (
        <Card padded={false}>
          <ResponsiveTable
            items={allRoutes}
            getKey={({ route }) => route.id}
            columns={routeColumns}
            empty={<span className={PHONE_EMPTY}>Маршруты не заведены</span>}
          />
        </Card>
      )}

      {/*
        Чат объекта (М5.3). Отдельный блок ниже таблиц: он не мешает текущим
        разделам «Этажи / Помещения / Маршруты», но у чата объекта нет другого
        входа в админке — из карточки объекта его и открывают. Чат создаётся
        идемпотентно по objectId (повторный заход вернёт тот же чат).
      */}
      <ChatPanel
        kind="object"
        refId={detail.id}
        title="Чат объекта"
        testId="object-chat"
        emptyHint="Обсудите объект с бригадирами и администратором: сообщения видят участники чата."
      />

      <Modal
        open={modal?.kind === 'object'}
        title="Редактирование объекта"
        size="lg"
        busy={objectMutation.isPending}
        onClose={requestCloseForm}
      >
        {modal?.kind === 'object' ? (
          <ObjectForm
            key={formKey}
            object={modal.object}
            saving={objectMutation.isPending}
            error={objectMutation.error}
            onDirtyChange={setFormDirty}
            onCancel={requestCloseForm}
            onSubmit={(payload) => objectMutation.mutate(payload)}
          />
        ) : null}
      </Modal>

      <Modal
        open={modal?.kind === 'floor'}
        title={modal?.kind === 'floor' && modal.floor ? 'Редактирование этажа' : 'Новый этаж'}
        busy={floorMutation.isPending}
        onClose={requestCloseForm}
      >
        {modal?.kind === 'floor' && (
          <FloorForm
            key={formKey}
            floor={modal.floor}
            existingNumbers={floors.map((floor) => floor.number)}
            saving={floorMutation.isPending}
            error={floorMutation.error}
            onDirtyChange={setFormDirty}
            onCancel={requestCloseForm}
            onSubmit={(payload) => floorMutation.mutate({ floorId: modal.floor?.id, payload })}
          />
        )}
      </Modal>

      <Modal
        open={modal?.kind === 'plan'}
        title={planFloor ? `План этажа «${planFloor.name}»` : 'Загрузка плана'}
        busy={planMutation.isPending}
        onClose={() => setModal(null)}
      >
        {planFloor && (
          <UploadPlanModal
            floor={planFloor}
            saving={planMutation.isPending}
            progress={planProgress}
            error={planMutation.error}
            onCancel={() => setModal(null)}
            onSubmit={(file, planScale) =>
              planMutation.mutate({ floorId: planFloor.id, file, planScale })
            }
          />
        )}
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
          <div className="flex flex-col gap-3">
            <span>
              Объект «{detail.name}» перейдёт в статус «В архиве». Этажи, помещения и маршруты
              сохранятся.
            </span>
            {archiveMutation.isError ? <ErrorBanner error={archiveMutation.error} /> : null}
          </div>
        }
        confirmLabel="Архивировать"
        busy={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate()}
        onCancel={() => setModal(null)}
      />

      <ConfirmDialog
        open={deleteFloorTarget !== undefined}
        title="Удалить этаж?"
        message={
          deleteFloorTarget ? (
            <div className="flex flex-col gap-3">
              <span>
                Этаж «{deleteFloorTarget.name}» будет удалён вместе с помещениями (
                {formatInteger(floorRooms(deleteFloorTarget).length)}) и маршрутами (
                {formatInteger(floorRoutes(deleteFloorTarget).length)}). Действие необратимо.
              </span>
              <span className="text-xs text-neutral-500">
                Удаление доступно только администратору и каскадом уносит помещения и маршруты
                этажа.
              </span>
              {deleteFloorMutation.isError ? (
                <ErrorBanner error={deleteFloorMutation.error} />
              ) : null}
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Удалить"
        busy={deleteFloorMutation.isPending}
        onConfirm={() => {
          if (deleteFloorTarget) deleteFloorMutation.mutate(deleteFloorTarget.id);
        }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        '-mb-px border-b-2 px-1 pb-2',
        // Вкладка — тач-таргет (≥44 px) на телефоне и планшете; на телефоне она
        // ещё и не сжимается в полосе со скроллом, иначе подписи наезжали бы.
        'max-lg:min-h-[44px] max-lg:px-2 max-md:shrink-0 max-md:whitespace-nowrap',
        active
          ? 'border-primary-600 text-primary-700'
          : 'border-transparent text-neutral-500 hover:text-neutral-800',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
