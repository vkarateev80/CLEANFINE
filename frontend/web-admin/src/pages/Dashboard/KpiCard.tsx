import type { ReactNode } from 'react';
import { Card } from '../../components/ui';

/**
 * Карточка KPI дашборда (М7.1).
 *
 * Один компонент на все показатели: у дашборда их больше десятка из четырёх сервисов, и
 * собранные по месту `<div>` разошлись бы по типографике (кегль значения, подпись,
 * единица измерения) при первой же правке.
 *
 * `hint` — источник данных. На дашборде он обязателен по смыслу: цифры приходят из
 * read-моделей разных сервисов, и при расхождении с отчётом первое, что нужно знать, —
 * откуда взято число.
 */
export function KpiCard({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  testId,
  footer,
}: {
  label: string;
  value: string;
  /** Единица измерения рядом со значением: `₽`, `ч`, `%`. */
  unit?: string;
  /** Источник показателя (какой сервис/read-модель). */
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
  testId?: string;
  footer?: ReactNode;
}) {
  const tones: Record<NonNullable<typeof tone>, string> = {
    neutral: 'text-neutral-900',
    primary: 'text-primary-600',
    success: 'text-success-600',
    warning: 'text-warning-600',
    danger: 'text-danger-600',
  };

  return (
    <Card className="flex min-w-[190px] flex-1 flex-col gap-1" testId={testId}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`font-mono text-2xl ${tones[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-base text-neutral-500">{unit}</span>}
      </div>
      {footer}
      {hint && <div className="mt-auto text-[11px] text-neutral-400">{hint}</div>}
    </Card>
  );
}
