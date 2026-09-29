import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/**
 * Поля ввода. Одна константа на все контролы: до этого каждый экран задавал
 * классы сам, и одинаковые поля выглядели по-разному.
 * Цвета — токены (см. design/tokens/generated/tokens.css).
 */
const CONTROL = [
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900',
  'placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2',
  'focus:ring-primary-500 focus:ring-offset-1 disabled:bg-neutral-100 disabled:text-neutral-500',
  // Тач-эргономика на телефоне и планшете: высота контрола ≥44 px. На desktop
  // (`lg:`, ≥1024) правило не действует, вид остаётся прежним.
  'max-lg:min-h-[44px]',
].join(' ');

const INVALID = 'border-danger-500 focus:border-danger-500 focus:ring-danger-500';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  /** Подсказка под полем; при ошибке не показывается, чтобы не дублировать текст. */
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}

/** Подпись + контрол + подсказка/ошибка. Ошибка бэкенда выводится здесь же. */
export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1" htmlFor={htmlFor}>
      <span className="text-sm text-neutral-500">
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-danger-600">{error}</span>
      ) : (
        hint && <span className="text-xs text-neutral-400">{hint}</span>
      )}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[CONTROL, invalid ? INVALID : '', className ?? ''].join(' ')}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[CONTROL, invalid ? INVALID : '', className ?? ''].join(' ')}
      {...props}
    >
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[CONTROL, 'min-h-[80px]', invalid ? INVALID : '', className ?? ''].join(' ')}
      {...props}
    />
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/**
 * Чекбокс с подписью: используется для requiresPhoto/requiresQr и «показать архивные».
 *
 * Тач-эргономика: `<input>` обёрнут в `<label>`, поэтому клик по подписи уже
 * переключает состояние, и увеличивать надо именно лейбл — `max-lg:min-h-[44px]`
 * даёт зону нажатия 44 px по высоте на телефоне и планшете. `min-w-[44px]` —
 * страховка для коротких подписей («Да»): без неё лейбл был бы уже 44 px.
 * На desktop (`lg:`, ≥1024) правила не действуют, вид прежний.
 */
export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 max-lg:min-h-[44px] max-lg:min-w-[44px]">
      <input
        type="checkbox"
        className={[
          'h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500',
          className ?? '',
        ].join(' ')}
        {...props}
      />
      {label}
    </label>
  );
}
