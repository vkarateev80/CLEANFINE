import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from '../components/auth/AuthGuard';
import { RoleGuard } from '../components/auth/RoleGuard';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { FloorPlanPage } from '../pages/Floors/FloorPlanPage';
import { LoginPage } from '../pages/Login/LoginPage';
import { MapPage } from '../pages/Map/MapPage';
import { MaterialsPage } from '../pages/Materials/MaterialsPage';
import { MessagesPage } from '../pages/Messages/MessagesPage';
import { NotFoundPage } from '../pages/NotFound/NotFoundPage';
import { NotificationsPage } from '../pages/Notifications/NotificationsPage';
import { SchedulePage } from '../pages/Schedule/SchedulePage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { EmployeesPage } from '../pages/Employees/EmployeesPage';
import { ObjectDetailPage } from '../pages/Objects/ObjectDetailPage';
import { ObjectsListPage } from '../pages/Objects/ObjectsListPage';
import { ReportsPage } from '../pages/Reports/ReportsPage';
import { RouteBuilderPage } from '../pages/Routes/RouteBuilderPage';
import { TechCardDetailPage } from '../pages/TechCards/TechCardDetailPage';
import { TechCardsPage } from '../pages/TechCards/TechCardsPage';
import { TicketDetailPage } from '../pages/Tickets/TicketDetailPage';
import { TicketsPage } from '../pages/Tickets/TicketsPage';
import { TemplatesPage } from '../pages/Templates/TemplatesPage';

/**
 * Роли на маршрутах повторяют права API: чтение объектов доступно всем
 * авторизованным (оператору и заказчику нужен контекст), а конструктор
 * маршрутов и техкарты — рабочие места ADMIN/SUPERVISOR (бэкенд: создание и
 * правка `@Roles('ADMIN','SUPERVISOR')`). Скрывать кнопки внутри страницы
 * недостаточно — прямой заход по URL всё равно должен упираться в RoleGuard.
 */
const routeBuilder = (
  <RoleGuard roles={['ADMIN', 'SUPERVISOR', 'MANAGER']}>
    <RouteBuilderPage />
  </RoleGuard>
);

const techCards = (
  <RoleGuard roles={['ADMIN', 'SUPERVISOR', 'MANAGER']}>
    <TechCardsPage />
  </RoleGuard>
);

const techCardDetail = (
  <RoleGuard roles={['ADMIN', 'SUPERVISOR', 'MANAGER']}>
    <TechCardDetailPage />
  </RoleGuard>
);

const employees = (
  <RoleGuard roles={['ADMIN', 'SUPERVISOR', 'MANAGER']}>
    <EmployeesPage />
  </RoleGuard>
);

/*
 * Шаблоны: библиотека демо-заготовок. Создание из шаблона дёргает те же
 * POST, что и обычные экраны, — значит и права те же (ADMIN/SUPERVISOR).
 */
/** Настройки организации (часовой пояс): менять может только ADMIN, как и в schedule-service. */
const settings = (
  <RoleGuard roles={['ADMIN']}>
    <SettingsPage />
  </RoleGuard>
);

const templates = (
  <RoleGuard roles={['ADMIN', 'SUPERVISOR', 'MANAGER']}>
    <TemplatesPage />
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

      { path: 'objects', element: <ObjectsListPage /> },
      { path: 'objects/:id', element: <ObjectDetailPage /> },
      // Экран плана этажа: рисуется по imageUrl из file-service, координаты помещений — в пикселях плана.
      { path: 'objects/:id/floors/:floorId', element: <FloorPlanPage /> },

      { path: 'routes', element: routeBuilder },
      { path: 'routes/:id', element: routeBuilder },

      { path: 'tech-cards', element: techCards },
      { path: 'tech-cards/:id', element: techCardDetail },

      { path: 'templates', element: templates },

      /*
       * Заявки (М3.7): чтение доступно всем авторизованным ролям, поэтому
       * RoleGuard здесь не нужен — он закрыл бы раздел оператору и заказчику,
       * которым заявки нужны в работе. Кнопки создания/назначения/переходов
       * внутри страниц показываются по правам из контроллера ticket-service.
       */
      { path: 'tickets', element: <TicketsPage /> },
      { path: 'tickets/:id', element: <TicketDetailPage /> },

      /*
       * Карта (М3.7): геозоны и ближние сотрудники. На чтении gps-service нет
       * `@Roles`, поэтому RoleGuard не нужен — как у заявок. Админка остаётся
       * доступна без ключа Mapbox: страница показывает заглушку и таблицы.
       */
      { path: 'map', element: <MapPage /> },

      { path: 'notifications', element: <NotificationsPage /> },

      { path: 'employees', element: employees },
      /*
       * Материалы (М4.3): чтение справочника, остатков, истории и отчёта открыто
       * всем авторизованным ролям (в material-service на GET нет `@Roles`),
       * поэтому RoleGuard здесь не нужен — он закрыл бы раздел оператору и
       * заказчику. Правка справочника (ADMIN/SUPERVISOR) и движения
       * (ADMIN/SUPERVISOR/OPERATOR) скрыты внутри экрана по правам.
       */
      { path: 'materials', element: <MaterialsPage /> },
      /*
       * Графики и смены (М4.6): чтение списка графиков, смен дня и своих смен в
       * schedule-service открыто всем авторизованным ролям (на GET нет
       * `@Roles`), поэтому RoleGuard не нужен. Правка графиков
       * (ADMIN/SUPERVISOR), ручные триггеры генерации и неявок (только ADMIN) и
       * отметка прихода/ухода (ADMIN/SUPERVISOR/OPERATOR) скрыты внутри экрана
       * по правам из `usePermissions`.
       */
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'settings', element: settings },
      /*
       * Сообщения (М5.3): чаты текущего пользователя. В chat-service каждый
       * видит только свои чаты (участник), а чужие отдают 403, поэтому RoleGuard
       * не нужен: раздел нужен всем ролям, а доступ ограничен на сервере по
       * участию в чате.
       */
      { path: 'messages', element: <MessagesPage /> },
      /*
       * Отчёты (М7.1): read-модели четырёх сервисов в одном разделе. Чтение отчётов
       * открыто всем авторизованным ролям (в сервисах на GET отчётов нет `@Roles`),
       * поэтому RoleGuard здесь не нужен — он закрыл бы раздел оператору. Справочник
       * сотрудников для фильтра подтягивается только у ADMIN/SUPERVISOR.
       */
      { path: 'reports', element: <ReportsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
