import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OperatorLayout } from './OperatorLayout';

// Каркас тянет уведомления, web-push и список чатов — в тесте это сеть, глушим.
vi.mock('../hooks/useNotifications', () => ({
  useNotificationWatcher: () => undefined,
  useUnreadNotificationsCount: () => 0,
}));
vi.mock('../lib/webPush', () => ({ resubscribeIfGranted: async () => undefined }));
vi.mock('../api/chat', () => ({ listMyChats: async () => [] }));

function renderLayout(path = '/today') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<OperatorLayout />}>
            <Route path="/today" element={<div>Экран «Сегодня»</div>} />
            <Route path="/chats" element={<div>Экран «Чаты»</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * SOS — пункт нижней панели, а не плавающая кнопка (решение владельца
 * 17.10.2026: FAB ложилась поверх «Отправить» в переписке на телефоне).
 */
describe('OperatorLayout — SOS в таб-баре', () => {
  it('четыре пункта, SOS ведёт на /sos, плавающей кнопки нет', () => {
    renderLayout();
    const nav = screen.getByRole('navigation', { name: 'Разделы приложения' });
    for (const id of ['op-nav-today', 'op-nav-chats', 'op-nav-profile']) {
      expect(within(nav).getByTestId(id)).not.toBeNull();
    }
    const sos = within(nav).getByTestId('op-nav-sos');
    expect(sos.getAttribute('href')).toBe('/sos');
    expect(sos.getAttribute('aria-label')).toBe('Аварийная заявка SOS');
    expect(sos.textContent).toContain('SOS');
    expect(screen.queryByTestId('op-sos-button')).toBeNull();
  });

  it('пункт SOS есть и на экране чатов', () => {
    renderLayout('/chats');
    expect(screen.getByText('Экран «Чаты»')).not.toBeNull();
    expect(screen.getByTestId('op-nav-sos').getAttribute('href')).toBe('/sos');
  });
});
