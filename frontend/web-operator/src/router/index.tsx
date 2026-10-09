import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from '../components/auth/AuthGuard';
import { PublicOnlyGuard } from '../components/auth/PublicOnlyGuard';
import { RoleGuard } from '../components/auth/RoleGuard';
import { SessionGate } from '../components/auth/SessionGate';
import { AuthLayout } from '../layouts/AuthLayout';
import { OperatorLayout } from '../layouts/OperatorLayout';
import { ChatThreadPage } from '../pages/Chats/ChatThreadPage';
import { ChatsPage } from '../pages/Chats/ChatsPage';
import { ChecklistPage } from '../pages/Checklist/ChecklistPage';
import { LoginPage } from '../pages/Login/LoginPage';
import { NotFoundPage } from '../pages/NotFound/NotFoundPage';
import { OfflinePage } from '../pages/Offline/OfflinePage';
import { ChangePasswordPage } from '../pages/Profile/ChangePasswordPage';
import { ProfilePage } from '../pages/Profile/ProfilePage';
import { RouteMapPage } from '../pages/Route/RouteMapPage';
import { SosPage } from '../pages/Sos/SosPage';
import { TodayPage } from '../pages/Today/TodayPage';

/**
 * Маршруты рабочего места оператора (overview.md п. 3). Guard'ы в том же
 * порядке, что в портале: токен → профиль → роль. Shell-экраны (таб-бар):
 * /today, /chats, /profile; полноэкранные поверх: маршрут, чек-лист, SOS,
 * переписка, очередь, смена пароля.
 *
 * `basename` — из `import.meta.env.BASE_URL`: на k3s приложение живёт под /app.
 */
function guarded(element: JSX.Element) {
  return (
    <AuthGuard>
      <SessionGate>
        <RoleGuard>{element}</RoleGuard>
      </SessionGate>
    </AuthGuard>
  );
}

/**
 * `basename` без хвостового слеша. Vite отдаёт `BASE_URL` как `/app/`
 * (`/client/`), а react-router с basename `/app/` не сопоставляет адрес
 * `https://cleanfine.ru/app` (без слеша) и рисует пустую страницу — именно
 * такой адрес люди вводят руками. С basename `/app` подходят оба варианта.
 * В dev `BASE_URL` = `/` и остаётся как есть.
 */
export function routerBasename(baseUrl: string): string {
  return baseUrl === '/' ? '/' : baseUrl.replace(/\/+$/, '');
}

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: (
        <PublicOnlyGuard>
          <AuthLayout>
            <LoginPage />
          </AuthLayout>
        </PublicOnlyGuard>
      ),
    },
    {
      path: '/',
      element: guarded(<OperatorLayout />),
      children: [
        { index: true, element: <Navigate to="/today" replace /> },
        { path: 'today', element: <TodayPage /> },
        { path: 'chats', element: <ChatsPage /> },
        { path: 'profile', element: <ProfilePage /> },
      ],
    },
    { path: '/chats/:chatId', element: guarded(<ChatThreadPage />) },
    { path: '/route/:eventId', element: guarded(<RouteMapPage />) },
    { path: '/route/:eventId/room/:roomId', element: guarded(<ChecklistPage />) },
    { path: '/sos', element: guarded(<SosPage />) },
    { path: '/offline', element: guarded(<OfflinePage />) },
    { path: '/profile/password', element: guarded(<ChangePasswordPage />) },
    { path: '*', element: <NotFoundPage /> },
  ],
  { basename: routerBasename(import.meta.env.BASE_URL) },
);
