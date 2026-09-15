import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TechCardListItem } from '../../types/core';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { TBody, Table, TableMessageRow, Td, Th, THead, Tr } from '../../components/ui/Table';
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
            <Button data-testid="techcard-create-button" onClick={() => openDialog('create')}>
              + Новая техкарта
            </Button>
          ) : undefined
        }
      />

      {!canEdit && (
        <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Режим просмотра: создание, переименование и удаление доступны ролям
          ADMIN и SUPERVISOR.
        </p>
      )}

      <ErrorBanner error={error} onRetry={refetch} />

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-neutral-500" htmlFor="techcards-search">
            <span className="sr-only">Поиск техкарты</span>
            <Input
              id="techcards-search"
              data-testid="techcards-search"
              type="search"
              className="w-72"
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

        <Table>
          <THead>
            <Th>Название</Th>
            <Th align="right">Операций</Th>
            <Th align="right">Помещений</Th>
            <Th>Создана</Th>
            <Th align="right">Действия</Th>
          </THead>
          <TBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="border-b border-neutral-200 last:border-b-0">
                  {Array.from({ length: 5 }).map((__, cell) => (
                    <td key={cell} className="px-4 py-3">
                      <span className="block h-4 w-full animate-pulse rounded-md bg-neutral-200" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && items.length === 0 && (
              <TableMessageRow colSpan={5}>
                {trimmedSearch ? (
                  <span className="flex flex-col items-center gap-3">
                    Ничего не найдено
                    <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                      Сбросить поиск
                    </Button>
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-3">
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
                )}
              </TableMessageRow>
            )}

            {items.map((card) => (
              <Tr
                key={card.id}
                data-testid={`techcard-row-${card.id}`}
                onClick={() => navigate(ROUTES.techCard(card.id))}
              >
                <Td>
                  <span className="font-medium text-neutral-900">{card.name}</span>
                </Td>
                <Td align="right" mono>
                  {card._count.operations}
                </Td>
                <Td align="right" mono>
                  {card._count.rooms}
                </Td>
                <Td>
                  <span className="text-xs text-neutral-500">{formatDateTime(card.createdAt)}</span>
                </Td>
                <Td align="right">
                  <span className="flex justify-end gap-2">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
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
                        className="text-danger-600"
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
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>

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
        Итоговое время техкарты — сумма нормативного времени операций; на экране
        техкарты оно используется как рекомендуемая оценка точки маршрута.
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
      Техкарта «{card.name}» будет удалена. Она отвязана от{' '}
      {roomsLabel(card._count.rooms)} (техкарта не выбрана), {operations} удалятся.
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
