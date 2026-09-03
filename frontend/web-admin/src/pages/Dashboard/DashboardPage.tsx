import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../../api/auth';
import { Spinner } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: me, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });

  const display = me ?? user;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Дашборд</h1>

      {isLoading && <Spinner />}
      {isError && (
        <div className="rounded-md border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-warning-600">
          Не удалось обновить профиль — показаны данные сессии.
        </div>
      )}
      {display && (
        <div className="max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-medium text-neutral-900">{display.fullName}</div>
          <div className="text-sm text-neutral-500">{display.email}</div>
          <div className="mt-2">
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {display.role}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        KPI и графики появятся в М2–М7 (объекты, заявки, персонал, материалы).
      </div>
    </div>
  );
}
