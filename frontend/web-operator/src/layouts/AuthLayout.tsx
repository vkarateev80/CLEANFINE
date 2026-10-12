import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-50 px-3 py-6 sm:min-h-screen sm:px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg sm:p-8">
        <div className="mb-6 text-center sm:mb-8">
          <div className="text-xl font-semibold text-primary-600 sm:text-2xl">🧹 CLEANFINE</div>
          <div className="text-sm text-neutral-500">Рабочее место оператора</div>
        </div>
        {children}
      </div>
    </div>
  );
}
