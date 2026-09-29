import type { ReactNode } from 'react';

/**
 * Примитивы таблицы: согласованные стили ячеек, без логики данных.
 *
 * Раньше здесь стояло «не делаем универсальный `DataTable<T>`: строки слишком
 * разные, общий компонент превратился бы в набор флагов». Отказ от `DataTable<T>`
 * в силе (ADR-002, вариант B отвергнут: сортировка/выбор/пагинация внутри
 * примитива — те же флаги и та же несовместимость с раскрывающимися этажами,
 * drag-ручками и чекбоксами операций).
 *
 * Но карточный режим на телефоне (<768 px) так не сделать: карточке нужны данные
 * строки, а парная вёрстка продублировала бы описание строки на каждом списке.
 * Поэтому решение пересмотрено осознанно: вместо `DataTable<T>` появился
 * декларативный `ResponsiveTable<T>` (`./ResponsiveTable.tsx`), который берёт
 * ПЛОСКИЕ списки, описывает колонки один раз и сам переключает представления
 * (`<table>` на `md+`, карточки на `<md`). Нерегулярные строки (reorder
 * маршрутов, операции техкарты, инбокс сообщений) остаются на своих механизмах.
 *
 * Эти примитивы остаются публичными: `ResponsiveTable` собирает таблицу из них,
 * а экраны с нестандартной строкой по-прежнему рендерят `<Table>` руками.
 */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={['w-full text-sm', className ?? ''].join(' ')}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-neutral-50 text-xs font-medium text-neutral-500">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  const alignment = { left: 'text-left', right: 'text-right', center: 'text-center' }[align];
  return (
    <th className={['px-4 py-3 font-medium', alignment, className ?? ''].join(' ')}>{children}</th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  onClick,
  className,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  /**
   * `data-testid` строки. Проп, а не «произвольный атрибут»: `<tr>` здесь без
   * spread, поэтому `data-testid` в JSX молча терялся — а молчаливый селектор
   * заметен только в e2e («element not found» при видимой строке).
   */
  testId?: string;
}) {
  return (
    <tr
      data-testid={testId}
      onClick={onClick}
      className={[
        'border-b border-neutral-200 last:border-b-0',
        onClick ? 'cursor-pointer hover:bg-neutral-50' : 'hover:bg-neutral-50',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  align = 'left',
  mono,
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Числа, координаты, ID — моноширинным (DS-003). */
  mono?: boolean;
  className?: string;
}) {
  const alignment = { left: 'text-left', right: 'text-right', center: 'text-center' }[align];
  return (
    <td
      className={[
        'px-4 py-3 text-neutral-800',
        alignment,
        mono ? 'font-mono text-xs' : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </td>
  );
}

export function TableMessageRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-neutral-400">
        {children}
      </td>
    </tr>
  );
}
