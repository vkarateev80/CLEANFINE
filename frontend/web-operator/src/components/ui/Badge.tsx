import type { ReactNode } from 'react';

/**
 * Бейдж статуса: белая «пилюля» с цветной точкой — мягких `*-50` у статусных
 * цветов в токенах нет (design/screens/mobile/README.md, пробел 4).
 */
export type Tone = 'success' | 'warning' | 'neutral' | 'danger' | 'info' | 'primary';

const DOT: Record<Tone, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  neutral: 'bg-neutral-400',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  primary: 'bg-primary-500',
};

const TEXT: Record<Tone, string> = {
  success: 'text-success-600',
  warning: 'text-warning-600',
  neutral: 'text-neutral-500',
  danger: 'text-danger-600',
  info: 'text-info-600',
  primary: 'text-primary-600',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  testId,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={[
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium',
        TEXT[tone],
        className ?? '',
      ].join(' ')}
    >
      <span className={['h-1.5 w-1.5 rounded-full', DOT[tone]].join(' ')} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Счётчик на вкладке/иконке: число в круге primary (единственная контрастная пара). */
export function CountDot({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null;
  return (
    <span
      className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary-500 px-1.5 text-[11px] font-semibold leading-[18px] text-white"
      aria-label={label}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
