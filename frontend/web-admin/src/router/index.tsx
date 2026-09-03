import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from '../components/auth/AuthGuard';
import { RoleGuard } from '../components/auth/RoleGuard';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { LoginPage } from '../pages/Login/LoginPage';
import { NotFoundPage } from '../pages/NotFound/NotFoundPage';
import { PlaceholderPage } from '../pages/Placeholder/PlaceholderPage';

const routeBuilder = (
  <RoleGuard roles={['ADMIN']}>
    <PlaceholderPage title="Конструктор маршрутов" phase="М2" />
  </RoleGuard>
);

const employees = (
  <RoleGuard roles={['ADMIN', 'SUPERVISOR']}>
    <PlaceholderPage title="Сотрудники" phase="М1" />
  </RoleGuard>
);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <AuthLayout>
        <LoginPage />
      </AuthLayout>
    ),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AdminLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'objects', element: <PlaceholderPage title="Объекты" phase="М2" /> },
      { path: 'objects/:id', element: <PlaceholderPage title="Детали объекта" phase="М2" /> },
      { path: 'routes', element: routeBuilder },
      { path: 'tickets', element: <PlaceholderPage title="Заявки" phase="М3" /> },
      { path: 'employees', element: employees },
      { path: 'materials', element: <PlaceholderPage title="Материалы" phase="М4" /> },
      { path: 'reports', element: <PlaceholderPage title="Отчёты" phase="М7" /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
