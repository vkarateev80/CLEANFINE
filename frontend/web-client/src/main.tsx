import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import '../../../design/tokens/generated/tokens.css';
import './main.css';

/**
 * Кэш TanStack Query. Настройки отличаются от админки осознанно:
 *  • `refetchOnWindowFocus: true` — портал открывают с телефона и возвращаются в
 *    браузер после звонка/переключения приложения; данные должны обновиться
 *    (DS-004, `overview.md` п. 6.4). Отдельные запросы могут это переопределять;
 *  • `staleTime: 30_000` по умолчанию — тот же порядок, что у списков админки;
 *  • `retry: 1` — одна повторная попытка: на мобильной сети мгновенный «Повторить»
 *    от пользователя эффективнее, чем пять автоматических.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
