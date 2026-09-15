import type { ReactNode } from 'react';

/**
 * Примитивы таблицы. Не делаем универсальный `DataTable<T>`: у экранов ядра
 * слишком разные строки (раскрывающиеся этажи в списке объектов, drag-ручки в
 * маршрутах, чекбоксы в операциях), и общий компонент превратился бы в набор
 * флагов. Здесь — только согласованные стили ячеек.
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
  return <th className={['px-4 py-3 font-medium', alignment, className ?? ''].join(' ')}>{children}</th>;
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
