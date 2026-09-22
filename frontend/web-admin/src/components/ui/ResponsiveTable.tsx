import type { ReactNode } from 'react';
import { Table, TBody, Td, Th, THead, Tr, TableMessageRow } from './Table';

/**
 * Декларативный список с двумя представлениями (ADR-002).
 *
 * Экран описывает колонки ОДИН раз: `cell` — ячейка таблицы, `card` — роль
 * колонки в карточке. Компонент сам показывает `<table>` на `md+` (≥768) и
 * карточки на `<md`.
 *
 * Почему так, а не `hidden md:block`/`md:hidden` руками на каждом экране:
 * карточке нужны те же данные строки, и парная вёрстка дублировала бы описание
 * строки на 8+ списках — любая правка колонки делалась бы дважды. Почему не
 * `DataTable<T>` с сортировкой/выбором внутри — см. обновлённый комментарий
 * `Table.tsx`: такой компонент превращается в набор флагов и не ложится на
 * нерегулярные строки (раскрывающиеся этажи, drag-ручки, чекбоксы операций).
 *
 * Что остаётся на экране: сортировка и фильтрация (в `header`), `ActionMenu` и
 * форматтеры (в `cell`), переход по строке (`onRowClick`). Компонент
 * централизует только переключатель «таблица ↔ карточки» и метаданные карточки.
 *
 * Переключение — чисто CSS (`hidden md:block` / `md:hidden`), без JS-подписки на
 * ширину: иначе первый кадр после гидратации показывал бы не то представление.
 */

export interface ResponsiveColumn<T> {
  key: string;
  /** Содержимое `<Th>`; может быть кнопкой сортировки. */
  header: ReactNode;
  /** `min-w-[…]`/`w-[…]` — как сейчас задаётся на `<Th>` экранов. */
  thClassName?: string;
  /** Содержимое `<Td>` в табличном виде. */
  cell: (item: T) => ReactNode;
  /** Классы ячейки, например `max-w-[320px] truncate`. */
  cellClassName?: string;
  align?: 'left' | 'right' | 'center';
  /** Числа, координаты, ID — моноширинным (DS-003). */
  mono?: boolean;
  /**
   * Роль колонки в карточке: `title` — первая строка, `subtitle` — вторая,
   * `badge` — статус в шапке карточки, `field` — строка «подпись — значение»,
   * `actions` — справа в шапке, `false` — колонка только в таблице.
   */
  card?: 'title' | 'subtitle' | 'badge' | 'field' | 'actions' | false;
  /** Подпись «подпись — значение» для `card: 'field'`. */
  cardLabel?: string;
}

export interface ResponsiveTableProps<T> {
  items: T[];
  getKey: (item: T) => string;
  columns: ResponsiveColumn<T>[];
  /** Клик по строке переносится и на карточку. */
  onRowClick?: (item: T) => void;
  /** `data-testid` И строки таблицы, И карточки. */
  rowTestId?: (item: T) => string;
  /** Например `opacity-60`, пока идёт обновление данных. */
  rowClassName?: (item: T) => string;
  /** Скелетон-строки; работает в обоих представлениях. */
  loading?: boolean;
  /** По умолчанию 5. */
  skeletonRows?: number;
  /** Пустое состояние (`EmptyState`); работает в обоих представлениях. */
  empty?: ReactNode;
  className?: string;
  /**
   * `data-testid` контейнера. Необязательный проп ради совместимости с ручными
   * списками: `Card` и `Tr` в проекте принимают именно `testId`, а в JSX
   * произвольные атрибуты на них теряются (см. комментарий в `Table.tsx`).
   * По умолчанию — канонический `card-list` (карточки) и `responsive-table`
   * (таблица), которые ждёт отдел проверки.
   */
  testId?: string;
}

/** Тестовые хуки представлений: их использует отдел проверки, переименование ломает e2e. */
const TABLE_TESTID = 'responsive-table';
const CARD_LIST_TESTID = 'card-list';
const CARD_TESTID = 'card';

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export function ResponsiveTable<T>({
  items,
  getKey,
  columns,
  onRowClick,
  rowTestId,
  rowClassName,
  loading,
  skeletonRows = 5,
  empty,
  className,
  testId,
}: ResponsiveTableProps<T>) {
  // Скелетон и пустое состояние нужны в обоих представлениях: иначе при загрузке
  // на телефоне оставался бы пустой экран, а «нет данных» на desktop выглядело бы
  // как пустая таблица без объяснения.
  const effectiveEmpty = loading ? undefined : (empty ?? 'Нет данных');

  return (
    <div className={className}>
      <div className="hidden md:block">
        <TableOrMessage
          items={items}
          getKey={getKey}
          columns={columns}
          onRowClick={onRowClick}
          rowTestId={rowTestId}
          rowClassName={rowClassName}
          loading={loading}
          skeletonRows={skeletonRows}
          empty={effectiveEmpty}
          testId={testId ?? TABLE_TESTID}
        />
      </div>

      <div
        data-testid={testId ?? CARD_LIST_TESTID}
        className="flex flex-col gap-3 md:hidden"
        aria-busy={loading || undefined}
      >
        {loading
          ? Array.from({ length: skeletonRows }, (_, index) => (
              // Скелетон помечен отдельным хуком: `data-testid="card"` остаётся
              // ровно у настоящих карточек, иначе счёт карточек в e2e ловил бы
              // ещё и плейсхолдеры (если проверка ждёт `card`, но не ждёт загрузки).
              <div key={`skeleton-${index}`} data-testid={`${CARD_TESTID}-skeleton`} className="animate-pulse">
                <CardShell>
                  <div className="h-4 w-40 rounded bg-neutral-200" />
                  <div className="mt-3 h-3 w-24 rounded bg-neutral-100" />
                  <div className="mt-3 h-3 w-full rounded bg-neutral-100" />
                </CardShell>
              </div>
            ))
          : items.length === 0
            ? effectiveEmpty
            : items.map((item) => (
                <CardRow
                  key={getKey(item)}
                  item={item}
                  columns={columns}
                  onRowClick={onRowClick}
                  testId={rowTestId?.(item)}
                  className={rowClassName?.(item)}
                />
              ))}
      </div>
    </div>
  );
}

interface TableOrMessageProps<T> {
  items: T[];
  getKey: (item: T) => string;
  columns: ResponsiveColumn<T>[];
  onRowClick?: (item: T) => void;
  rowTestId?: (item: T) => string;
  rowClassName?: (item: T) => string;
  loading?: boolean;
  skeletonRows: number;
  empty: ReactNode;
  testId: string;
}

/** Табличное представление: те же примитивы `Table`, что и до появления карточек. */
function TableOrMessage<T>({
  items,
  getKey,
  columns,
  onRowClick,
  rowTestId,
  rowClassName,
  loading,
  skeletonRows,
  empty,
  testId,
}: TableOrMessageProps<T>) {
  const head = (
    <THead>
      {columns.map((column) => (
        <Th key={column.key} align={column.align} className={column.thClassName}>
          {column.header}
        </Th>
      ))}
    </THead>
  );

  const body = loading ? (
    <TBody>
      {Array.from({ length: skeletonRows }, (_, index) => (
        <Tr key={`skeleton-${index}`}>
          {columns.map((column) => (
            <Td
              key={column.key}
              align={column.align}
              mono={column.mono}
              className={column.cellClassName}
            >
              <span className="block h-4 w-full max-w-[120px] animate-pulse rounded bg-neutral-100" />
            </Td>
          ))}
        </Tr>
      ))}
    </TBody>
  ) : (
    <TBody>
      {items.length === 0 ? (
        <TableMessageRow colSpan={columns.length}>{empty}</TableMessageRow>
      ) : (
        items.map((item) => (
          <Tr
            key={getKey(item)}
            testId={rowTestId?.(item)}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            className={rowClassName?.(item)}
          >
            {columns.map((column) => (
              <Td
                key={column.key}
                align={column.align}
                mono={column.mono}
                className={column.cellClassName}
              >
                {column.cell(item)}
              </Td>
            ))}
          </Tr>
        ))
      )}
    </TBody>
  );

  return (
    <div data-testid={testId} aria-busy={loading || undefined}>
      <Table>
        {head}
        {body}
      </Table>
    </div>
  );
}

interface CardRowProps<T> {
  item: T;
  columns: ResponsiveColumn<T>[];
  onRowClick?: (item: T) => void;
  /** Значение `rowTestId(item)`; если не передано — канонический `card`. */
  testId?: string;
  className?: string;
}

/**
 * Карточка — внутренний рендерер `ResponsiveTable`, а не публичный компонент:
 * иначе каждый экран собирал бы карточку руками и «таблица vs карточка»
 * разъезжались бы при правке колонок.
 */
function CardRow<T>({ item, columns, onRowClick, testId, className }: CardRowProps<T>) {
  const groups = groupColumns(columns);
  const interactive = Boolean(onRowClick);

  return (
    <div
      data-testid={testId ?? CARD_TESTID}
      className={[
        'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm',
        interactive ? 'cursor-pointer active:bg-neutral-50' : '',
        className ?? '',
      ].join(' ')}
      onClick={onRowClick ? () => onRowClick(item) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRowClick?.(item);
              }
            }
          : undefined
      }
    >
      {(groups.title.length > 0 || groups.badge.length > 0 || groups.actions.length > 0) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {groups.title.map((column) => (
              <div key={column.key} className="break-words text-sm font-medium text-neutral-900">
                {column.cell(item)}
              </div>
            ))}
            {groups.subtitle.map((column) => (
              <div
                key={column.key}
                className={[
                  'break-words text-xs text-neutral-500',
                  column.mono ? 'font-mono' : '',
                  ALIGN[column.align ?? 'left'],
                ].join(' ')}
              >
                {column.cell(item)}
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {groups.badge.map((column) => (
              <span key={column.key} className="break-words">
                {column.cell(item)}
              </span>
            ))}
            {groups.actions.map((column) => (
              <span key={column.key}>{column.cell(item)}</span>
            ))}
          </div>
        </div>
      )}

      {groups.fields.length > 0 && (
        <dl className="mt-3 flex flex-col gap-1">
          {groups.fields.map((column) => (
            <div key={column.key} className="flex items-baseline justify-between gap-3">
              {column.cardLabel && (
                <dt className="shrink-0 text-xs text-neutral-500">{column.cardLabel}</dt>
              )}
              <dd
                className={[
                  'min-w-0 break-words text-sm text-neutral-800',
                  column.mono ? 'font-mono text-xs' : '',
                  ALIGN[column.align ?? 'left'],
                ].join(' ')}
              >
                {column.cell(item)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Оболочка скелетон-карточки: повторяет рамку настоящей карточки. */
function CardShell({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">{children}</div>;
}

/** Раскладывает колонки по ролям в карточке; колонки без роли в карточку не попадают. */
function groupColumns<T>(columns: ResponsiveColumn<T>[]) {
  return {
    title: columns.filter((column) => column.card === 'title'),
    subtitle: columns.filter((column) => column.card === 'subtitle'),
    badge: columns.filter((column) => column.card === 'badge'),
    fields: columns.filter((column) => column.card === 'field'),
    actions: columns.filter((column) => column.card === 'actions'),
  };
}
