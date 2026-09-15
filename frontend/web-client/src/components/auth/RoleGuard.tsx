import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/**
 * Роли, которым портал разрешён.
 *
 * `CLIENT` — единственная целевая роль портала (DS-004). `ADMIN` добавлен
 * **только для отладки** и объяснён в README: у администратора нет объекта, и он
 * попадает в портал исключительно при явном выборе объекта отладки
 * (`?debugObjectId=<uuid>`, см. `hooks/useObjectScope.ts`). Без этого параметра
 * админ видит тот же экран «Объект не подключён», что и клиент без привязки —
 * то есть роль не даёт доступа к данным «по умолчанию».
 *
 * `OPERATOR` и `SUPERVISOR` не пускаются: их рабочее место — админка, а
 * сотрудник в портале видел бы заявки и отчёты чужого заказчика.
 */
export const PORTAL_ROLES = ['CLIENT', 'ADMIN'] as const;

/**
 * Ограничивает портал по ролям. Неавторизованных сюда не пускает `AuthGuard`
 * выше по дереву, поэтому здесь проверяется только роль.
 *
 * Отказ — не редирект на `/login`, а редирект с сообщением: пользователь уже
 * вошёл, и «выкинуть молча» значило бы показать форму входа без объяснения.
 */
export function RoleGuard({ children }: { children: ReactElement }) {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    // Профиль ещё не подтянут (`/auth/me` в пути) — не мигаем формой входа.
    return null;
  }
  if (!PORTAL_ROLES.includes(user.role as (typeof PORTAL_ROLES)[number])) {
    return <Navigate to="/login" replace state={{ roleDenied: user.role }} />;
  }
  return children;
}
