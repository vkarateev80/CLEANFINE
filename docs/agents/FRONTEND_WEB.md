<!-- M0.3: auto-slice of the charter document. Canonical source file lives at the repo root. -->

# АГЕНТ: FRONTEND WEB
# 🤖 АГЕНТ: FRONTEND WEB

## 📋 Профиль агента

**Роль:** Frontend Developer (Web)  
**Ответственность:** Админ-панель (React), портал клиента  
**Рабочая директория:** `frontend/`  
**Технологии:** React, TypeScript, Vite, Tailwind, Zustand, TanStack Query  
**Отчетность:** Frontend Lead

---

## 🎯 Цели

1. Админ-панель (толстый клиент для администраторов)
2. Портал клиента (тонкий клиент для заказчиков)
3. Все экраны согласно дизайну
4. Интеграция с API
5. Реальное время (WebSocket)

---

## 📁 Структура проекта
frontend/
├── web-admin/ # Админ-панель
│ ├── src/
│ │ ├── main.tsx
│ │ ├── App.tsx
│ │ ├── router/
│ │ │ └── index.tsx # Роутинг
│ │ ├── layouts/
│ │ │ ├── AdminLayout.tsx # Layout с sidebar
│ │ │ └── AuthLayout.tsx # Layout для авторизации
│ │ ├── pages/
│ │ │ ├── Login/
│ │ │ ├── Dashboard/
│ │ │ ├── Objects/
│ │ │ │ ├── ObjectList.tsx
│ │ │ │ ├── ObjectDetail.tsx
│ │ │ │ └── ObjectForm.tsx
│ │ │ ├── Floors/
│ │ │ │ ├── FloorPlan.tsx
│ │ │ │ └── RoomEditor.tsx
│ │ │ ├── Routes/
│ │ │ │ └── RouteBuilder.tsx
│ │ │ ├── Tickets/
│ │ │ ├── Employees/
│ │ │ ├── Materials/
│ │ │ └── Reports/
│ │ ├── components/
│ │ │ ├── ui/ # Базовые компоненты
│ │ │ ├── layout/ # Компоненты layout
│ │ │ ├── map/ # Карты
│ │ │ ├── forms/ # Формы
│ │ │ └── tables/ # Таблицы
│ │ ├── stores/ # Zustand stores
│ │ ├── hooks/ # Custom hooks
│ │ ├── api/ # API клиенты
│ │ ├── types/ # TypeScript типы
│ │ └── utils/ # Утилиты
│ ├── public/
│ ├── package.json
│ ├── vite.config.ts
│ └── tailwind.config.ts
│
└── web-client/ # Портал клиента
├── src/
│ ├── pages/
│ │ ├── Login/
│ │ ├── Dashboard/
│ │ ├── Tickets/
│ │ └── Reports/
│ └── ...
└── package.json

text

---

## 📝 Инструкции по реализации

### 1. Инициализация

```bash
cd frontend
pnpm create vite web-admin --template react-ts
cd web-admin
pnpm add react-router-dom zustand @tanstack/react-query axios tailwindcss mapbox-gl recharts
pnpm add -D @types/mapbox-gl
2. Базовые компоненты
tsx
// components/ui/Button.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          {
            'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500': variant === 'primary',
            'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-500': variant === 'secondary',
            'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500': variant === 'danger',
            'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-400': variant === 'ghost',
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-base': size === 'md',
            'px-6 py-3 text-lg': size === 'lg',
            'opacity-50 cursor-not-allowed': disabled || loading,
          },
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className="mr-2" />}
        {children}
      </button>
    );
  }
);
3. API клиент
typescript
// api/client.ts
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, {
          refreshToken,
        });
        
        useAuthStore.getState().setTokens(response.data);
        originalRequest.headers.Authorization = `Bearer ${response.data.accessToken}`;
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);
4. Маршрутизация
tsx
// router/index.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthGuard } from '../components/auth/AuthGuard';
import { RoleGuard } from '../components/auth/RoleGuard';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AdminLayout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'objects',
        element: <ObjectListPage />,
      },
      {
        path: 'objects/:id',
        element: <ObjectDetailPage />,
      },
      {
        path: 'objects/:id/floors/:floorId',
        element: <FloorPlanPage />,
      },
      {
        path: 'routes',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <RouteBuilderPage />
          </RoleGuard>
        ),
      },
      {
        path: 'tickets',
        element: <TicketsPage />,
      },
      {
        path: 'employees',
        element: (
          <RoleGuard roles={['ADMIN', 'SUPERVISOR']}>
            <EmployeesPage />
          </RoleGuard>
        ),
      },
      {
        path: 'materials',
        element: <MaterialsPage />,
      },
      {
        path: 'reports',
        element: <ReportsPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
5. WebSocket для реального времени
typescript
// hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${import.meta.env.VITE_WS_URL}/chat`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('message:new', (message) => {
      // Обработка нового сообщения
      console.log('New message:', message);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token]);

  return socketRef;
}
✅ Acceptance Criteria (Web Admin)
□ Авторизация работает
□ Дашборд отображает данные
□ CRUD объектов работает
□ Загрузка планов работает
□ Конструктор маршрутов работает
□ Управление заявками работает
□ GPS-карта работает
□ Отчеты формируются
□ Адаптивный дизайн
□ Производительность (LCP < 2s)
✅ Acceptance Criteria (Web Client)
□ Авторизация работает
□ Просмотр статуса объекта
□ Создание заявки
□ Просмотр отчетов
□ Чат с менеджером
□ Мобильная адаптация
