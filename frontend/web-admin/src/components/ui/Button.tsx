import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600 focus:ring-primary-500',
  secondary: 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300 focus:ring-neutral-500',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 focus:ring-danger-500',
  ghost: 'bg-transparent text-neutral-600 hover:bg-neutral-100 focus:ring-neutral-400',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  // `max-lg:` — тач-эргономика (≥44 px) на телефоне и планшете: `sm`-кнопки
  // (иконочные действия, «Назад/Вперёд») иначе ~28 px, `md` — ровно 40 px
  // (`py-2` + строка 24 px), то есть тоже ниже порога 44 px (замер 360/768).
  // `lg` уже 52 px. Правила ограничены `max-lg:` — desktop ≥1024 не меняется.
  sm: 'px-3 py-1.5 text-sm max-lg:min-h-[44px] max-lg:min-w-[44px]',
  md: 'px-4 py-2 text-base max-lg:min-h-[44px]',
  lg: 'px-6 py-3 text-lg',
};

/** Базовый Button по образцу УСТАВ.md → Агент Frontend Web (п.2), стили — токены. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className ?? '',
      ].join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="mr-2" />}
      {children}
    </button>
  );
});

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Загрузка"
    />
  );
}
