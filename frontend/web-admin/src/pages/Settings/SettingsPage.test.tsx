import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScheduleSettings, updateScheduleSettings } from '../../api/schedule';
import { useAuthStore } from '../../stores/authStore';
import { useTimeZoneStore } from '../../stores/timeZoneStore';
import { SettingsPage } from './SettingsPage';

vi.mock('../../api/schedule', () => ({
  getScheduleSettings: vi.fn(),
  updateScheduleSettings: vi.fn(),
}));

const mockGet = vi.mocked(getScheduleSettings);
const mockUpdate = vi.mocked(updateScheduleSettings);

function view(timeZone: string, title: string, short: string, offset: number) {
  return {
    timeZone,
    timeZoneTitle: title,
    timeZoneShortLabel: short,
    utcOffsetMinutes: offset,
    today: '2026-10-18',
    updatedAt: null,
    updatedBy: null,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe('«Настройки» → часовой пояс', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'token' });
    useTimeZoneStore.setState({ timeZone: 'Europe/Moscow' });
    mockGet.mockResolvedValue(view('Europe/Moscow', 'Москва, Санкт-Петербург (UTC+3)', 'МСК', 180));
    mockUpdate.mockResolvedValue(view('Asia/Bishkek', 'Бишкек (UTC+6)', 'UTC+6', 360));
  });

  afterEach(() => {
    useAuthStore.setState({ accessToken: null });
    vi.clearAllMocks();
  });

  it('показывает текущий пояс и сохраняет выбранный, обновляя пояс админки', async () => {
    renderPage();

    const select = (await screen.findByTestId('settings-time-zone-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('Europe/Moscow'));
    expect(screen.getByTestId('settings-time-zone-save')).toBeDisabled();

    fireEvent.change(select, { target: { value: 'Asia/Bishkek' } });
    expect(screen.getByText(/Графики сохранят время/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-time-zone-save'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('Asia/Bishkek'));
    await waitFor(() => expect(useTimeZoneStore.getState().timeZone).toBe('Asia/Bishkek'));
  });

  it('в списке — пояса России и стран операторов с текущим сдвигом', async () => {
    renderPage();

    await screen.findByTestId('settings-time-zone-select');
    expect(screen.getByRole('option', { name: 'Бишкек (UTC+6)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ташкент (UTC+5)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Владивосток, Хабаровск (UTC+10)' })).toBeInTheDocument();
  });
});
