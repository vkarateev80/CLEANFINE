import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TechCardListItem } from '../../types/core';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { ResponsiveTable, TableOnlyTestId, type ResponsiveColumn } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useCanEdit, useIsAdmin } from '../../hooks/usePermissions';
import { ROUTES } from '../../router/routes';
import {
  useCreateTechCard,
  useDeleteTechCard,
  useTechCards,
  useUpdateTechCard,
} from './useTechCards';
import { formatDateTime, operationsLabel, roomsLabel } from './techCardHelpers';

/**
 * Экран «Техкарты» (маршрут `/tech-cards`, спецификация DS-003 `tech_cards.md`).
 *
 * Здесь таблица с серверной пагинацией, а не описанная в спецификации пара
 * «список + редактор»: редактор операций живёт на отдельном маршруте
 * `/tech-cards/:id`, и держать его копию в правой колонке значило бы
 * поддерживать два состояния одной карточки. Из спецификации сохранены все
 * обязательные элементы: поиск, метрики, создание, переименование, удаление.
 */
const PAGE_SIZE_OPTIONS = [25, 50, 100];

/**
 * Оболочка «пусто»: в таблице текст и отступы задаёт `TableMessageRow`, в
 * карточном режиме узел выводится отдельным блоком — без рамки он выглядел бы
 * «оторванным». Все классы — `max-md:`, планшет и desktop не меняются.
 */
const PHONE_EMPTY_SHELL =
  'flex flex-col items-center gap-3 max-md:rounded-xl max-md:border max-md:border-dashed max-md:border-neutral-300 max-md:bg-white max-md:px-4 max-md:py-8';

type DialogKind = 'create' | 'rename' | 'delete';

interface ActiveDialog {
  kind: DialogKind;
  card?: TechCardListItem;
}

export function TechCardsPage() {
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [skip, setSkip] = useState(0);
  const [take, setTake] = useState(PAGE_SIZE_OPTIONS[0]);
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [dialogError, setDialogError] = useState<unknown>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  const trimmedSearch = debouncedSearch.trim();
  const params = useMemo(
    () => ({ skip, take, ...(trimmedSearch ? { search: trimmedSearch } : {}) }),
    [skip, take, trimmedSearch],
  );

  const { data, isLoading, isFetching, error, refetch } = useTechCards(params);
  const createCard = useCreateTechCard();
  const renameCard = useUpdateTechCard(dialog?.card?.id ?? '');
  const deleteCard = useDeleteTechCard();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  function openDialog(kind: DialogKind, card?: TechCardListItem) {
    setDialogError(null);
    setNameTouched(false);
    setNameDraft(card?.name ?? '');
    setDialog({ kind, card });
  }

  async function handleCreate() {
    setDialogError(null);
    try {
      const created = await createCard.mutateAsync(nameDraft.trim());
      setDialog(null);
      navigate(ROUTES.techCard(created.id));
    } catch (err) {
      setDialogError(err);
    }
  }

  async function handleRename() {
    setDialogError(null);
    try {
      await renameCard.mutateAsync(nameDraft.trim());
      setDialog(null);
    } catch (err) {
      setDialogError(err);
    }
  }

  async function handleDelete() {
    if (!dialog?.card) return;
    setDialogError(null);
    try {
      await deleteCard.mutateAsync(dialog.card.id);
      setDialog(null);
    } catch (err) {
      setDialogError(err);
    }
  }

  const busy = createCard.isPending || renameCard.isPending || deleteCard.isPending;

  /**
   * Колонки списка описаны один раз (ADR-002): на `md+` — прежняя таблица, на
   * телефоне — карточка. В карточке название становится заголовком, счётчики и
   * дата — строками «подпись — значение», действия уезжают в шапку карточки.
   */
  const columns: ResponsiveColumn<TechCardListItem>[] = [
    {
      key: 'name',
      header: 'Название',
      // Прежний `data-testid` строки (`techcard-row-<id>`) ставит `TableOnlyTestId`
      // в табличном представлении: примитив держит в DOM и карточки, а дубль id
      // ловится строгим режимом Playwright (см. `components/ui/TableOnlyTestId.tsx`).
      cell: (card) => (
        <TableOnlyTestId id={`techcard-row-${card.id}`}>
          <span className="font-medium text-neutral-900">{card.name}</span>
        </TableOnlyTestId>
      ),
      card: 'title',
    },
    {
      key: 'operations',
      header: 'Операций',
      align: 'right',
      mono: true,
      cell: (card) => card._count.operations,
      card: 'field',
      cardLabel: 'Операций',
    },
    {
      key: 'rooms',
      header: 'Помещений',
      align: 'right',
      mono: true,
      cell: (card) => card._count.rooms,
      card: 'field',
      cardLabel: 'Помещений',
    },
    {
      key: 'created',
      header: 'Создана',
      cell: (card) => (
        <span className="text-xs text-neutral-500">{formatDateTime(card.createdAt)}</span>
      ),
      card: 'field',
      cardLabel: 'Создана',
    },
    {
      key: 'actions',
      header: 'Действия',
      align: 'right',
      cell: (card) => (
        // В карточке две текстовые кнопки в строку отбирали бы у названия почти
        // всю ширину 360 px, поэтому на телефоне они встают столбиком.
        <span className="flex justify-end gap-2 max-md:flex-col max-md:items-stretch">
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="max-md:px-2 max-md:text-xs"
              aria-label={`Переименовать «${card.name}»`}
              onClick={(event) => {
                event.stopPropagation();
                openDialog('rename', card);
              }}
            >
              Переименовать
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 max-md:px-2 max-md:text-xs"
              aria-label={`Удалить «${card.name}»`}
              onClick={(event) => {
                event.stopPropagation();
                openDialog('delete', card);
              }}
            >
              Удалить
            </Button>
          )}
        </span>
      ),
      card: 'actions',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Техкарты"
        subtitle={
          <>
            Всего: <span className="font-mono">{total}</span>
          </>
        }
        actions={
          canEdit ? (
            <Button
              data-testid="techcard-create-button"
              className="max-md:w-full max-lg:min-h-[44px]"
              onClick={() => openDialog('create')}
            >
              + Новая техкарта
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Режим просмотра: создание, переименование и удаление доступны ролям ADMIN, SUPERVISOR и MANAGER.
        </p>
      )}

      <ErrorBanner error={error} onRetry={refetch} />

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          {/* `w-72` (288 px) на 360 px шире доступного места: на телефоне поле
              растягивается на всю строку. */}
          <label
            className="flex items-center gap-2 text-sm text-neutral-500 max-md:w-full"
            htmlFor="techcards-search"
          >
            <span className="sr-only">Поиск техкарты</span>
            <Input
              id="techcards-search"
              data-testid="techcards-search"
              type="search"
              className="w-72 max-md:w-full"
              placeholder="Поиск техкарты"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                // Новая выборка начинается с первой страницы: иначе после сужения
                // поиска пользователь увидит пустую таблицу на прежнем `skip`.
                setSkip(0);
              }}
            />
          </label>
          <span className="text-xs text-neutral-400">
            {isFetching && !isLoading ? 'Обновление…' : 'Поиск по названию, 300 мс'}
          </span>
        </div>

        <ResponsiveTable
          items={items}
          getKey={(card) => card.id}
          onRowClick={(card) => navigate(ROUTES.techCard(card.id))}
          loading={isLoading}
          empty={
            trimmedSearch ? (
              <span className={PHONE_EMPTY_SHELL}>
                Ничего не найдено
                <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                  Сбросить поиск
                </Button>
              </span>
            ) : (
              <span className={PHONE_EMPTY_SHELL}>
                Техкарт пока нет
                {canEdit && (
                  <Button
                    size="sm"
                    data-testid="techcard-create-button"
                    onClick={() => openDialog('create')}
                  >
                    Создать техкарту
                  </Button>
                )}
              </span>
            )
          }
          columns={columns}
        />

        <Pagination
          total={total}
          skip={skip}
          take={take}
          disabled={isLoading}
          onChange={(next) => {
            setSkip(next.skip);
            setTake(next.take);
          }}
        />
      </Card>

      <p className="text-xs text-neutral-500">
        Итоговое время техкарты — сумма нормативного времени операций; на экране техкарты оно
        используется как рекомендуемая оценка точки маршрута.
      </p>

      <NameDialog
        open={dialog?.kind === 'create' || dialog?.kind === 'rename'}
        title={dialog?.kind === 'rename' ? 'Переименовать техкарту' : 'Новая техкарта'}
        confirmLabel={dialog?.kind === 'rename' ? 'Сохранить' : 'Создать'}
        value={nameDraft}
        touched={nameTouched}
        busy={busy}
        error={dialogError}
        onChange={(next) => {
          setNameTouched(true);
          setNameDraft(next);
        }}
        onCancel={() => setDialog(null)}
        onConfirm={dialog?.kind === 'rename' ? handleRename : handleCreate}
      />

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Удалить техкарту"
        busy={busy}
        confirmLabel="Удалить"
        message={deleteMessage(dialog?.card)}
        onCancel={() => setDialog(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/**
 * Тексты подтверждения различаются по числу привязанных помещений: связь
 * `Room.techCard` снимается (`SetNull`), операции удаляются каскадом — об этом
 * и предупреждаем (п. 7.4 и 6 спецификации).
 */
function deleteMessage(card: TechCardListItem | undefined) {
  if (!card) return null;
  const operations = operationsLabel(card._count.operations);
  if (card._count.rooms === 0) {
    return `Техкарта «${card.name}» и её ${operations} будут удалены безвозвратно.`;
  }
  return (
    <>
      Техкарта «{card.name}» будет удалена. Она отвязана от {roomsLabel(card._count.rooms)}{' '}
      (техкарта не выбрана), {operations} удалятся.
      <span className="mt-2 block text-warning-600">
        Помещения сохранятся, но останутся без техкарты — их нужно назначить заново.
      </span>
    </>
  );
}

interface NameDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  value: string;
  /** Ошибку «минимум 3 символа» показываем только после первой правки. */
  touched: boolean;
  busy: boolean;
  error: unknown;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/** Создание и переименование отличаются только подписями — форма одна. */
function NameDialog({
  open,
  title,
  confirmLabel,
  value,
  touched,
  busy,
  error,
  onChange,
  onCancel,
  onConfirm,
}: NameDialogProps) {
  const trimmed = value.trim();
  const invalid = touched && trimmed.length < 3;

  return (
    <Modal
      open={open}
      title={title}
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button
            data-testid="techcard-submit"
            loading={busy}
            disabled={trimmed.length < 3}
            onClick={() => {
              void onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        data-testid="techcard-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed.length >= 3) void onConfirm();
        }}
      >
        {Boolean(error) && <ErrorBanner error={error} />}
        <Field
          label="Название"
          htmlFor="techcard-name"
          required
          hint="3–120 символов. Уникальность не гарантируется — возможны одинаковые названия."
          error={invalid ? 'Название: минимум 3 символа' : null}
        >
          <Input
            id="techcard-name"
            data-testid="techcard-name"
            autoFocus
            maxLength={120}
            invalid={invalid}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
