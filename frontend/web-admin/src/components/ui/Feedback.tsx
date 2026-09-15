import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * Единый формат обратной связи. До этого каждая страница рисовала баннер
 * по-своему, а «нет данных» выглядело как пустая таблица без объяснения.
 */

export interface ErrorBannerProps {
  /** Текст ошибки. `unknown` — потому что сюда попадает и Error, и ответ axios. */
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/** Достаёт человекочитаемое сообщение из ответа NestJS (`{ message: string | string[] }`). */
export function errorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(data)) return data.join('; ');
  if (typeof data === 'string' && data.length > 0) return data;

  if (error instanceof Error && error.message) return error.message;
  return 'Не удалось выполнить запрос';
}

export function ErrorBanner({ error, onRetry, className }: ErrorBannerProps) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={[
        'flex items-start justify-between gap-4 rounded-lg border border-danger-500 bg-white px-4 py-3',
        className ?? '',
      ].join(' ')}
    >
      <span className="text-sm text-danger-600">{errorMessage(error)}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/** Мягкое предупреждение: данные показаны, но неполные или устаревшие. */
export function SoftWarning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-warning-600">
      {children}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
      <div className="text-sm font-medium text-neutral-500">{title}</div>
      {hint && <div className="max-w-md text-xs text-neutral-400">{hint}</div>}
      {action}
    </div>
  );
}

/** Скелетон загрузки: держит высоту блока, чтобы вёрстка не «прыгала». */
export function LoadingBlock({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-primary-500"
        role="status"
        aria-label={label}
      />
      {label}
    </div>
  );
}
