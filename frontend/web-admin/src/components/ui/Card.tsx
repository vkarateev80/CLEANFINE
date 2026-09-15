import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Карточка-панель по DS-003: `rounded-xl border bg-white p-6 shadow-sm`. */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** `false` — для панелей с таблицей: отступы задают ячейки. */
  padded?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-xl border border-neutral-200 bg-white shadow-sm',
        padded ? 'p-6' : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {breadcrumbs}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-neutral-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

export interface Crumb {
  label: string;
  /** Без `to` элемент считается текущим и не является ссылкой. */
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-500" aria-label="Навигация">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1">
          {index > 0 && <span className="text-neutral-300">/</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-primary-600">
              {item.label}
            </Link>
          ) : (
            <span className="text-neutral-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Строка «подпись — значение» для карточек сущностей. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-sm text-neutral-900">{children}</span>
    </div>
  );
}
