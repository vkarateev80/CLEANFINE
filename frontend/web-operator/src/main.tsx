import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { applyDocumentLang, useLang } from './i18n';
import { router } from './router';
import { installQueueRunner } from './lib/syncQueue';
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
installQueueRunner(queryClient);

// Оболочка без сети: service worker только в прод-сборке (в dev мешал бы HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => undefined);
  });
}

/**
 * Корень с языком интерфейса: `key` по языку пересобирает дерево, и все `t()`
 * перечитываются; роутер тот же, адрес не теряется.
 */
function App() {
  const lang = useLang();
  useEffect(() => applyDocumentLang(lang), [lang]);
  return <RouterProvider key={lang} router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
