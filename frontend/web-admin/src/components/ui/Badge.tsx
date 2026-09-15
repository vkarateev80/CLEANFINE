import type { ReactNode } from 'react';
import {
  OBJECT_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  type ObjectStatus,
  type RouteStatus,
} from '../../types/status';

/**
 * Бейдж статуса: белая «пилюля» с цветной точкой. Цветная заливка недоступна —
 * у success/warning/danger/info в токенах есть только уровни 500/600, без
 * мягких `*-50` (см. «Зафиксированные пробелы токенов» в design/screens/README).
 */

type Tone = 'success' | 'warning' | 'neutral' | 'danger' | 'info';

const DOT: Record<Tone, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  neutral: 'bg-neutral-400',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
};

const TEXT: Record<Tone, string> = {
  success: 'text-success-600',
  warning: 'text-warning-600',
  neutral: 'text-neutral-500',
  danger: 'text-danger-600',
  info: 'text-info-600',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium',
        TEXT[tone],
        className ?? '',
      ].join(' ')}
    >
      <span className={['h-1.5 w-1.5 rounded-full', DOT[tone]].join(' ')} aria-hidden="true" />
      {children}
    </span>
  );
}

const OBJECT_TONES: Record<ObjectStatus, Tone> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'neutral',
};

const ROUTE_TONES: Record<RouteStatus, Tone> = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  ARCHIVED: 'neutral',
};

/** Статус объекта: подписи и тон берутся из домена, а не задаются на месте. */
export function ObjectStatusBadge({ status }: { status: ObjectStatus }) {
  return <Badge tone={OBJECT_TONES[status]}>{OBJECT_STATUS_LABELS[status]}</Badge>;
}

/** Статус маршрута. `ACTIVE` у объекта и маршрута означают разное, но выглядят одинаково. */
export function RouteStatusBadge({ status }: { status: RouteStatus }) {
  return <Badge tone={ROUTE_TONES[status]}>{ROUTE_STATUS_LABELS[status]}</Badge>;
}

/** Счётчик в таблице/на карточке: например «3 операции». */
export function CountBadge({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="font-mono text-sm text-neutral-700">
      {value} <span className="font-sans text-xs text-neutral-500">{unit}</span>
    </span>
  );
}
