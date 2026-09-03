import type { ReactNode } from 'react';

/** Центрированная карточка для экранов авторизации. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold text-primary-600">🧹 Cleaning Ops</div>
          <div className="text-sm text-neutral-500">Админ-панель</div>
        </div>
        {children}
      </div>
    </div>
  );
}
