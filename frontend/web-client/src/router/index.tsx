import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from '../components/auth/AuthGuard';
import { PublicOnlyGuard } from '../components/auth/PublicOnlyGuard';
import { RoleGuard } from '../components/auth/RoleGuard';
import { SessionGate } from '../components/auth/SessionGate';
import { ScopeGate } from '../components/object/ScopeStates';
import { ClientLayout } from '../layouts/ClientLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { ChatPage } from '../pages/Chat/ChatPage';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { LoginPage } from '../pages/Login/LoginPage';
import { NotFoundPage } from '../pages/NotFound/NotFoundPage';
import { ReportsPage } from '../pages/Reports/ReportsPage';
import { TicketDetailPage } from '../pages/Tickets/TicketDetailPage';
import { TicketsPage } from '../pages/Tickets/TicketsPage';

/**
 * Роутер портала (DS-004, `overview.md` п. 3). `createBrowserRouter`, как в
 * админке, но вместо sidebar — каркас с нижним таб-баром.
 *
 * Порядок guard'ов важен и отражает три разные причины отказа:
 *   1. `AuthGuard` — нет токена: неавторизованный уходит на `/login` и после
 *      входа возвращается на исходный адрес (`state.from`);
 *   2. `SessionGate` — токен есть, профиль не получен: ждём `/auth/me`, чтобы
 *      `RoleGuard` мог проверить роль, а не мигал пустым экраном;
 *   3. `RoleGuard` — роль не CLIENT (ADMIN допущен только для отладки): уводит на
 *      `/login` с сообщением про админ-панель.
 *
 * `ScopeGate` стоит только на экранах, которым объект обязателен. `/chat` его не
 * требует: переписка с менеджером нужна и тогда, когда объект ещё не привязан —
 * это единственный канал связи в портале.
 *
 * `basename` берётся из `import.meta.env.BASE_URL` (=`base` сборки): в dev и в
 * корневом деплое это `/` — поведение не меняется; на k3s портал собран с
 * `VITE_BASE=/client/`, и без basename роутер искал бы `/login` вместо
 * `/client/login`. Все `Navigate`/`Link` внутри остаются относительными.
 */
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
    element: (
      <AuthGuard>
        <SessionGate>
          <RoleGuard>
            <ClientLayout />
          </RoleGuard>
        </SessionGate>
      </AuthGuard>
    ),
    children: [
      // Объект клиента определяется внутри `ClientLayout` (контекст), поэтому
      // гейт стоит на каждой странице, а не на родительском маршруте.
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <ScopeGate>
            <DashboardPage />
          </ScopeGate>
        ),
      },
      {
        path: 'tickets',
        element: (
          <ScopeGate>
            <TicketsPage />
          </ScopeGate>
        ),
      },
      {
        path: 'tickets/:id',
        element: (
          <ScopeGate>
            <TicketDetailPage />
          </ScopeGate>
        ),
      },
      {
        path: 'reports',
        element: (
          <ScopeGate>
            <ReportsPage />
          </ScopeGate>
        ),
      },
      // Чат не зависит от объекта: клиенту нужен канал связи всегда.
      { path: 'chat', element: <ChatPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
  ],
  { basename: import.meta.env.BASE_URL },
);
