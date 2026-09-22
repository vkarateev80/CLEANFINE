import type { ReactNode } from 'react';

/** Центрированная карточка для экранов авторизации. */
export function AuthLayout({ children }: { children: ReactNode }) {
  // Внутренний отступ карточки: телефон `p-6`, планшет и desktop `p-8` (как было).
  // 32 px с каждой стороны на 360 px съедают почти пятую часть ширины, а полям
  // ввода и без того тесно. `max-w-md` сохраняется — карточка не распирает экран.
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg md:p-8">
        <div className="mb-6 text-center md:mb-8">
          <div className="text-2xl font-semibold text-primary-600">🧹 Cleaning Ops</div>
          <div className="text-sm text-neutral-500">Админ-панель</div>
        </div>
        {children}
      </div>
    </div>
  );
}
