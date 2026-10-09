import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { installNetworkWatch } from './stores/netStore';
import '../../../design/tokens/generated/tokens.css';
import './main.css';

/**
 * Кэш TanStack Query рабочего места оператора.
 *  • `retry: 1` — на мобильной сети «Повторить» рукой быстрее пяти автоповторов;
 *  • `staleTime: 30 с` — смены и заявки меняет бригадир, секундная свежесть не нужна;
 *  • `refetchOnWindowFocus` — оператор возвращается в браузер после звонка,
 *    данные должны обновиться;
 *  • `networkMode: 'offlineFirst'` — без сети запрос не «висит» в pending, а
 *    сразу падает в ошибку, и экран показывает кэш с баннером (DS-002 offline.md §1).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

installNetworkWatch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
