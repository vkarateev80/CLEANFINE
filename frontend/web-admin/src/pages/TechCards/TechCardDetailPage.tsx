import {
  COLOR_ZONE_META,
  equipmentChip,
  isGlassOperation,
  operationInventoryZone,
  roomColorZone,
  type ColorZone,
} from '@cleaning-ops/shared/types/color-coding';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CreateOperationPayload, TechOperationWithMaterials } from '../../types/core';
import { Badge } from '../../components/ui/Badge';
import { ColorZoneBadge, ColorZoneDot } from '../../components/ui/ColorZone';
import { Button } from '../../components/ui/Button';
import { Breadcrumbs, Card, PageHeader } from '../../components/ui/Card';
import { EmptyState, ErrorBanner, LoadingBlock } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/Modal';
import { SortableList } from '../../components/ui/SortableList';
import { Table, TableMessageRow, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useCanEdit, useIsAdmin } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import { OperationFormModal } from './OperationFormModal';
import {
  equipmentParts,
  materialsLabel,
  operationsLabel,
  roomsLabel,
  sumMinutes,
} from './techCardHelpers';
import {
  useAddOperation,
  useDeleteOperation,
  useDeleteTechCard,
  useReorderOperations,
  useTechCard,
  useUpdateOperation,
  useUpdateTechCard,
} from './useTechCards';

/**
 * Экран «Техкарта: редактор операций» (`/tech-cards/:id`, DS-003 `tech_cards.md`).
 *
 * Список операций — `SortableList`: она уже даёт ручку `⠿`, кнопки «↑/↓» и
 * клавиатурное перетаскивание, а `onReorder` отдаёт ПОЛНЫЙ порядок id, который
 * требует `reorderOperations` (частичный список бэкенд отвергает 400).
 */
export function TechCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const { data: card, isLoading, error, refetch } = useTechCard(id);

  const addOperation = useAddOperation(id ?? '');
  const updateOperation = useUpdateOperation(id ?? '');
  const deleteOperation = useDeleteOperation(id ?? '');
  const reorder = useReorderOperations(id ?? '');
  const renameCard = useUpdateTechCard(id ?? '');
  const deleteCard = useDeleteTechCard();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<
    { mode: 'create' } | { mode: 'edit'; operation: TechOperationWithMaterials } | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<TechOperationWithMaterials | null>(null);
  const [confirmCardDelete, setConfirmCardDelete] = useState(false);

  // Цвет инвентаря техкарты: если все привязанные помещения одной цветовой
  // зоны — он известен и красит оборудование операций; разные зоны или ни
  // одного помещения — цвет задаёт конкретное помещение (видно в приложении
  // оператора и на плане), здесь остаётся только жёлтый для стёкол.
  const cardZone = useMemo<ColorZone | null>(() => {
    const rooms = card?.rooms ?? [];
    if (rooms.length === 0) return null;
    const zones = new Set(
      rooms.map((room) =>
        roomColorZone({ floorType: room.floorType ?? '', zone: room.zone, name: room.name }),
      ),
    );
    return zones.size === 1 ? [...zones][0] : null;
  }, [card]);

  // Пока идёт сохранение, поле должно показывать новое имя, а не откатываться к
  // серверному: поэтому после успеха черновик сохраняется как «уже применённый».
  const [savedName, setSavedName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<unknown>(null);
  const [reorderError, setReorderError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  // Данные карточки перечитались (инвалидация после мутации) — черновик больше не нужен.
  useEffect(() => {
    setSavedName(null);
    setNameDraft(null);
  }, [card?.name]);

  const operations = card?.operations ?? [];
  const localTotal = sumMinutes(operations);
  const serverName = savedName ?? card?.name ?? '';
  const nameValue = nameDraft ?? serverName;
  const nameChanged = card !== undefined && nameValue.trim() !== serverName;

  if (!id) {
    return <EmptyState title="Техкарта не выбрана" hint="Откройте техкарту из списка." />;
  }

  async function commitRename() {
    const next = nameValue.trim();
    setNameDraft(null);

    if (!card || next === serverName) return;
    if (next.length < 3) {
      setRenameError(new Error('Название: минимум 3 символа'));
      return;
    }

    setRenameError(null);
    try {
      await renameCard.mutateAsync(next);
      setSavedName(next);
    } catch (err) {
      setRenameError(err);
      // Черновик сохраняется: после ошибки кнопка «Сохранить название» остаётся
      // доступной, и повторная отправка не требует вводить имя заново.
      setNameDraft(next);
    }
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
    // Esc — отмена правки: черновик снимается, поле возвращается к данным сервера
    // на следующем рендере (значение приходит из состояния, а не из DOM).
    if (event.key === 'Escape') {
      setNameDraft(null);
    }
  }

  async function handleSubmitOperation(payload: CreateOperationPayload) {
    if (formState?.mode === 'edit') {
      await updateOperation.mutateAsync({ id: formState.operation.id, payload });
    } else {
      await addOperation.mutateAsync({ ...payload, orderIndex: operations.length });
    }
    setFormState(null);
  }

  /** Дублирование делает клиент: серверного endpoint'а нет (открытый вопрос 7 спец.). */
  async function handleDuplicate(operation: TechOperationWithMaterials) {
    setActionError(null);
    try {
      await addOperation.mutateAsync({
        name: `${operation.name} (копия)`.slice(0, 120),
        orderIndex: operations.length,
        estimatedTimeMin: operation.estimatedTimeMin,
        requiresPhoto: operation.requiresPhoto,
        requiresQr: operation.requiresQr,
        ...(operation.description ? { description: operation.description } : {}),
        ...(operation.equipment ? { equipment: operation.equipment } : {}),
        materials: operation.materials.map((material) => ({
          materialId: material.materialId,
          consumptionPerOperation: material.consumptionPerOperation,
          unit: material.unit,
        })),
      });
    } catch (err) {
      setActionError(err);
    }
  }

  async function handleReorder(operationIds: string[]) {
    setReorderError(null);
    try {
      await reorder.mutateAsync(operationIds);
    } catch (err) {
      setReorderError(err);
    }
  }

  async function handleDeleteOperation() {
    if (!pendingDelete) return;
    setActionError(null);
    try {
      await deleteOperation.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setActionError(err);
    }
  }

  async function handleDeleteCard() {
    if (!card) return;
    setActionError(null);
    try {
      await deleteCard.mutateAsync(card.id);
      navigate(ROUTES.techCards);
    } catch (err) {
      setActionError(err);
      setConfirmCardDelete(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <LoadingBlock label="Загрузка техкарты…" />
        <LoadingBlock label="Загрузка операций…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error} onRetry={refetch} />
        <div>
          <Link to={ROUTES.techCards} className="text-sm text-primary-600 hover:underline">
            ← К списку техкарт
          </Link>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <EmptyState
        title="Техкарта не найдена"
        hint="Возможно, она была удалена."
        action={
          <Link to={ROUTES.techCards}>
            <Button variant="secondary">К списку техкарт</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: 'Техкарты', to: ROUTES.techCards }, { label: card.name }]}
          />
        }
        title="Редактор операций"
        actions={
          <>
            {nameChanged && canEdit && (
              <Button size="sm" loading={renameCard.isPending} onClick={() => void commitRename()}>
                Сохранить название
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger-600"
                aria-label="Удалить техкарту"
                onClick={() => setConfirmCardDelete(true)}
              >
                Удалить техкарту
              </Button>
            )}
          </>
        }
      />

      <Card className="flex flex-col gap-3">
        {renameError ? <ErrorBanner error={renameError} /> : null}
        <Input
          aria-label="Название техкарты"
          className="text-lg font-medium"
          value={nameValue}
          disabled={!canEdit}
          onChange={(event) => {
            setRenameError(null);
            setNameDraft(event.target.value);
          }}
          onBlur={() => void commitRename()}
          onKeyDown={handleNameKeyDown}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <span>
            Операций: <span className="font-mono text-neutral-900">{operations.length}</span>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            Итого:{' '}
            <span className="font-mono text-neutral-900" data-testid="operation-total-time">
              {localTotal}
            </span>{' '}
            мин
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            Помещений: <span className="font-mono text-neutral-900">{card.rooms.length}</span>
          </span>
          {localTotal !== card.totalEstimatedTimeMin && (
            <span className="text-xs text-neutral-400">
              (на сервере {card.totalEstimatedTimeMin} мин — обновится после перезагрузки)
            </span>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 max-md:flex-col max-md:items-stretch max-md:gap-2">
            <h2 className="text-sm font-medium text-neutral-900">Операции</h2>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="operation-create-button"
                onClick={() => setFormState({ mode: 'create' })}
              >
                + Операция
              </Button>
            )}
          </div>

          {/* Перестановка и дублирование пишут в разные состояния, но показывать
              два баннера подряд незачем — приоритет у ошибки порядка. */}
          <ErrorBanner error={reorderError ?? actionError} className="m-4" />

          {operations.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="В техкарте нет операций"
                hint="Операция описывает шаг уборки: время, требования к фото и QR, расход материалов."
                action={
                  canEdit ? (
                    <Button
                      data-testid="operation-create-button"
                      onClick={() => setFormState({ mode: 'create' })}
                    >
                      Добавить операцию
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            /**
             * Телефон (<768 px): строка операции — карточка. Ручную вёрстку берём
             * потому, что строка нерегулярная (чекбоксы требований, drag-ручка,
             * кнопки ↑/↓, аккордеон с материалами) — `ResponsiveTable` для таких
             * списков не подходит (System Design §4.1).
             *
             * `SortableList` — общий примитив UI-кита и рисует строку
             * горизонтально; на 360 px содержимому остаётся ~120 px. Строку
             * перестраиваем снаружи произвольными вариантами по потомкам, строго
             * в `max-md:`: блок кнопок ↑/↓ переносится на свою строку
             * (`basis-full`), содержимое получает всю ширину. Планшет и desktop
             * правил не видят.
             */
            <div
              data-testid="operations"
              className="max-md:[&>ul>li]:flex-wrap max-md:[&>ul>li]:gap-y-2 max-md:[&>ul>li>div:last-child]:basis-full max-md:[&>ul>li>div:last-child]:justify-end"
            >
              <SortableList
                items={operations}
                getId={(operation) => operation.id}
                disabled={!canEdit || reorder.isPending}
                onReorder={(ids) => void handleReorder(ids)}
                renderItem={(operation) => (
                  <OperationRow
                    operation={operation}
                    roomZone={cardZone}
                    expanded={expandedId === operation.id}
                    canEdit={canEdit}
                    onToggle={() =>
                      setExpandedId((prev) => (prev === operation.id ? null : operation.id))
                    }
                    onEdit={() => setFormState({ mode: 'edit', operation })}
                    onDuplicate={() => void handleDuplicate(operation)}
                    onDelete={() => setPendingDelete(operation)}
                  />
                )}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3">
            <span className="text-xs text-neutral-500">
              Сумма времени операций используется как рекомендуемая оценка точки маршрута.
            </span>
            <span className="text-sm text-neutral-500">
              Итого по операциям: <span className="font-mono text-neutral-900">{localTotal}</span>{' '}
              мин
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-neutral-900">Итоги</h2>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl text-neutral-900">{localTotal}</span>
              <span className="text-sm text-neutral-500">мин</span>
            </div>
            <div className="text-xs text-neutral-500">
              {operationsLabel(operations.length)} · {roomsLabel(card.rooms.length)}
            </div>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFormState({ mode: 'create' })}
              >
                + Операция
              </Button>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-neutral-900">Где используется</h2>
            {card.rooms.length === 0 ? (
              <p className="text-xs text-neutral-400">Не привязана ни к одному помещению</p>
            ) : (
              <>
                <p className="text-xs text-neutral-500">
                  Привязана к {roomsLabel(card.rooms.length)}
                </p>
                <div
                  data-testid="techcard-color-zone"
                  className="flex flex-wrap items-center gap-2 text-xs text-neutral-500"
                >
                  <span>Инвентарь:</span>
                  {cardZone === null ? (
                    <span>разный — по цвету помещения</span>
                  ) : (
                    <ColorZoneBadge zone={cardZone} detail />
                  )}
                </div>
                <ul className="flex flex-col gap-2">
                  {card.rooms.slice(0, 5).map((room) => (
                    <li key={room.id} className="flex items-center gap-2 text-sm">
                      <ColorZoneDot
                        zone={roomColorZone({
                          floorType: room.floorType ?? '',
                          zone: room.zone,
                          name: room.name,
                        })}
                        size={8}
                      />
                      <Link
                        to={ROUTES.floorPlan(room.floor.objectId, room.floor.id)}
                        className="text-neutral-900 hover:text-primary-600"
                      >
                        {room.name}
                      </Link>
                      <span className="ml-2 text-xs text-neutral-400">{room.floor.name}</span>
                    </li>
                  ))}
                </ul>
                {card.rooms.length > 5 && (
                  <p className="text-xs text-neutral-400">
                    и ещё {card.rooms.length - 5} — смотрите на плане этажа
                  </p>
                )}
              </>
            )}
          </Card>

          {!canEdit && (
            <p className="rounded-lg bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
              Режим просмотра: правка операций доступна ролям ADMIN и SUPERVISOR.
            </p>
          )}
        </div>
      </div>

      {formState && (
        <OperationFormModal
          // Ключ сбрасывает поля формы при переключении между операциями.
          key={formState.mode === 'edit' ? formState.operation.id : 'create'}
          open
          operation={formState.mode === 'edit' ? formState.operation : undefined}
          busy={addOperation.isPending || updateOperation.isPending}
          onClose={() => setFormState(null)}
          onSubmit={handleSubmitOperation}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить операцию"
        busy={deleteOperation.isPending}
        message={
          pendingDelete
            ? `Операция «${pendingDelete.name}» будет удалена вместе с ${materialsLabel(
                pendingDelete.materials.length,
              )}.`
            : null
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDeleteOperation()}
      />

      <ConfirmDialog
        open={confirmCardDelete}
        title="Удалить техкарту"
        confirmLabel="Удалить техкарту"
        busy={deleteCard.isPending}
        message={
          card.rooms.length === 0
            ? `Техкарта «${card.name}» и её ${operationsLabel(
                operations.length,
              )} будут удалены безвозвратно.`
            : `Техкарта «${card.name}» будет удалена. Она отвязана от ${roomsLabel(
                card.rooms.length,
              )} (техкарта не выбрана), ${operationsLabel(operations.length)} удалятся.`
        }
        onCancel={() => setConfirmCardDelete(false)}
        onConfirm={() => void handleDeleteCard()}
      />
    </div>
  );
}

interface OperationRowProps {
  operation: TechOperationWithMaterials;
  /** Цвет инвентаря помещений техкарты; `null` — помещения разных зон или их нет. */
  roomZone: ColorZone | null;
  expanded: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Строка операции. `SortableList` рисует `<li>` и кнопки перемещения, здесь —
 * только правая часть: название, метрики и действия. Клик по названию
 * разворачивает описание, оборудование и материалы (аккордеон 4.5).
 */
function OperationRow({
  operation,
  roomZone,
  expanded,
  canEdit,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: OperationRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const parts = equipmentParts(operation.equipment);
  // Один цвет на весь инвентарь операции: слово цвета в оборудовании («синие
  // швабра, ведро…») → стёкла и зеркала — жёлтый → цвет помещения.
  const equipmentZone = operationInventoryZone(
    operation.name,
    parts === null ? [] : [...parts.items, ...parts.ppe],
    roomZone,
  );
  const glassInventory = equipmentZone === 'YELLOW' && isGlassOperation(operation.name);

  return (
    <div
      data-testid={`operation-row-${operation.id}`}
      className="flex flex-col gap-2 py-1 max-md:gap-3 max-md:rounded-lg max-md:border max-md:border-neutral-200 max-md:p-3"
    >
      <div className="flex flex-wrap items-center gap-3 max-md:flex-col max-md:items-stretch max-md:gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left max-md:w-full"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="block truncate text-sm font-medium text-neutral-900">
            {operation.name}
          </span>
          {operation.description && (
            <span className="block truncate text-xs text-neutral-500">{operation.description}</span>
          )}
        </button>

        {/* Метрики операции — отдельной строкой карточки: на 360 px бейдж,
            иконки требований, расход материалов и время в одну строку с
            названием не помещаются. На desktop это прежний общий `flex`-ряд. */}
        <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:gap-2">
          {operation.equipment !== null &&
            (equipmentZone === null ? (
              <Badge tone="neutral">Оборудование</Badge>
            ) : (
              <ColorZoneBadge zone={equipmentZone} />
            ))}

          {operation.requiresPhoto && (
            <span className="text-primary-600" title="Требуется фото" aria-label="Требуется фото">
              📷
            </span>
          )}
          {operation.requiresQr && (
            <span className="text-primary-600" title="Требуется QR" aria-label="Требуется QR">
              ▣
            </span>
          )}
          {!operation.requiresPhoto && !operation.requiresQr && (
            <span className="text-neutral-300">—</span>
          )}

          <span
            className="text-xs text-neutral-500"
            style={
              equipmentZone !== null && operation.materials.length > 0
                ? { color: COLOR_ZONE_META[equipmentZone].hexDark }
                : undefined
            }
          >
            {materialsLabel(operation.materials.length)}
          </span>

          <span className="font-mono text-sm text-neutral-900">
            {operation.estimatedTimeMin} мин
          </span>
        </div>

        {canEdit && (
          <div className="relative shrink-0 max-md:self-end">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Действия с операцией «${operation.name}»`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              ⋮
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 flex w-44 flex-col rounded-lg border border-neutral-200 bg-white py-1 shadow-md">
                <button
                  type="button"
                  className="px-3 py-2 text-left text-sm hover:bg-neutral-50 max-lg:min-h-[44px]"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-left text-sm hover:bg-neutral-50 max-lg:min-h-[44px]"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicate();
                  }}
                >
                  Дублировать
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-left text-sm text-danger-600 hover:bg-neutral-50 max-lg:min-h-[44px]"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-3">
          <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
            <span>
              Время:{' '}
              <span className="font-mono text-neutral-900">{operation.estimatedTimeMin}</span> мин
            </span>
            <span>Фотоотчёт: {operation.requiresPhoto ? 'да' : 'нет'}</span>
            <span>QR: {operation.requiresQr ? 'да' : 'нет'}</span>
          </div>

          {operation.description && (
            <p className="text-sm text-neutral-700">{operation.description}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>Оборудование</span>
              {equipmentZone !== null && operation.equipment !== null && (
                <span>
                  · {COLOR_ZONE_META[equipmentZone].name.toLowerCase()} инвентарь
                  {glassInventory
                    ? ' (стёкла и зеркала)'
                    : ` — ${COLOR_ZONE_META[equipmentZone].zoneName.toLowerCase()}`}
                </span>
              )}
            </div>
            {operation.equipment === null ? (
              <p className="text-xs text-neutral-400">Не задано</p>
            ) : parts !== null ? (
              // Инвентарь — цветные «пилюли» зоны, СИЗ — нейтральные.
              <div className="flex flex-wrap gap-1.5" data-testid="operation-equipment-chips">
                {parts.items.map((item) => {
                  // Слово цвета снято с чипа — цвет назван в строке выше;
                  // позиция другого цвета остаётся своего цвета (`equipmentChip`).
                  const { label, zone: itemZone } = equipmentChip(item, equipmentZone);
                  return itemZone === null ? (
                    <span
                      key={`item-${item}`}
                      className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-700"
                    >
                      {label}
                    </span>
                  ) : (
                    <span
                      key={`item-${item}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: COLOR_ZONE_META[itemZone].hexSoft,
                        borderColor: COLOR_ZONE_META[itemZone].hex,
                        color: COLOR_ZONE_META[itemZone].hexDark,
                      }}
                    >
                      <ColorZoneDot zone={itemZone} size={7} />
                      {label}
                    </span>
                  );
                })}
                {parts.ppe.map((item) => (
                  <span
                    key={`ppe-${item}`}
                    title="Средство индивидуальной защиты"
                    className="rounded-full border border-dashed border-neutral-300 bg-white px-2.5 py-0.5 text-xs text-neutral-500"
                  >
                    СИЗ · {item}
                  </span>
                ))}
                {parts.items.length === 0 && parts.ppe.length === 0 && (
                  <span className="text-xs text-neutral-400">Пусто</span>
                )}
              </div>
            ) : (
              // `min-w-0` у обёртки и `max-w-full` у блока: JSON скроллится
              // ВНУТРИ себя и не распирает страницу по горизонтали (System Design §8).
              <div className="min-w-0">
                <pre className="max-w-full overflow-x-auto rounded-md bg-white p-2 font-mono text-xs text-neutral-700">
                  {JSON.stringify(operation.equipment, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <Table>
            <THead>
              <Th>Материал</Th>
              <Th align="right">Расход на операцию</Th>
              <Th>Единица</Th>
            </THead>
            <TBody>
              {operation.materials.length === 0 && (
                <TableMessageRow colSpan={3}>Материалы не заданы</TableMessageRow>
              )}
              {operation.materials.map((material) => {
                // Материалы операции — тем же цветом, что и инвентарь: они
                // расходуются в той же зоне.
                const tone =
                  equipmentZone === null
                    ? undefined
                    : { color: COLOR_ZONE_META[equipmentZone].hexDark };
                return (
                  <Tr key={material.id}>
                    <Td mono>
                      <span style={tone}>{material.materialId}</span>
                    </Td>
                    <Td align="right" mono>
                      <span style={tone}>{material.consumptionPerOperation}</span>
                    </Td>
                    <Td>
                      <span style={tone}>{material.unit}</span>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
