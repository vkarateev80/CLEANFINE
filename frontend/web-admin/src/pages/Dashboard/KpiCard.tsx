import type { ReactNode } from 'react';
import { Card } from '../../components/ui';

/**
 * Карточка KPI доски действий (М7.1).
 *
 * Один компонент на все показатели: у доски действий их больше десятка из четырёх сервисов, и
 * собранные по месту `<div>` разошлись бы по типографике (кегль значения, подпись,
 * единица измерения) при первой же правке.
 *
 * `hint` — источник данных. На доске действий он обязателен по смыслу: цифры приходят из
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
    // `max-md:min-w-0 max-md:flex-none max-md:w-full` — на телефоне плитка занимает
    // всю ширину строки: прежний `min-w-[190px]` и `flex-1` (базис 0) вместе давали
    // сжатие плиток до «квадратов» и вынос подписей за экран. На ≥768 px ограничение
    // и растяжение остаются прежними — плитки идут по несколько в ряд, как раньше.
    <Card
      className="flex min-w-[190px] flex-1 flex-col gap-1 max-md:w-full max-md:min-w-0 max-md:flex-none"
      testId={testId}
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`font-mono text-2xl ${tones[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-base text-neutral-500">{unit}</span>}
      </div>
      {footer}
      {/* Источник KPI — длинная строка вида `material-service · report_…`: на телефоне
          переносим её по словам, иначе она распирает плитку по горизонтали. Класс
          обязан быть диапазонным: безусловный `break-words` менял расчёт переноса
          и добавлял 1 px к высоте плитки (191 → 192) на планшете и desktop, а вместе
          с ним уезжало всё, что ниже (графики, main, body). На ≥768 px — как было. */}
      {hint && (
        <div className="mt-auto text-[11px] text-neutral-400 max-md:break-words">{hint}</div>
      )}
    </Card>
  );
}
