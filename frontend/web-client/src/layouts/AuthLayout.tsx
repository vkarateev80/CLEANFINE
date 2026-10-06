import type { ReactNode } from 'react';

/**
 * Центрированная карточка экрана входа — копия `web-admin/layouts/AuthLayout.tsx`
 * с двумя отличиями, требуемыми DS-004 (`login.md` п. 4.1 и 9):
 *
 *  • `min-h-[100dvh]` вместо `min-h-screen`: на телефоне `100vh` даёт «прыжок»
 *    при появлении адресной строки; на десктопе (`sm:`) возвращаем `100vh`;
 *  • подпись «Портал заказчика» вместо «Админ-панель» — сразу объясняет, куда
 *    попал пользователь (ссылки в админку портал не показывает: это разное ПО).
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-50 px-3 py-6 sm:min-h-screen sm:px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg sm:p-8">
        <div className="mb-6 text-center sm:mb-8">
          <div className="text-xl font-semibold text-primary-600 sm:text-2xl">🧹 CLEANFINE</div>
          <div className="text-sm text-neutral-500">Портал заказчика</div>
        </div>
        {children}
      </div>
    </div>
  );
}
