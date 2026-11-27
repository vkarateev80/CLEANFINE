import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { checkIn } from '../../api/schedule';
import { getCurrentPosition } from '../../lib/geo';
import { useNetStore } from '../../stores/netStore';
import type { ScheduleEvent } from '../../types/schedule';
import { useShiftActions } from './useToday';

vi.mock('../../lib/geo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/geo')>()),
  getCurrentPosition: vi.fn(),
}));
vi.mock('../../api/schedule', () => ({
  checkIn: vi.fn(),
  checkOut: vi.fn(),
  getScheduleSettings: vi.fn(),
  listMyEvents: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useShiftActions: отметка прихода', () => {
  it('каждая попытка берёт свежие координаты, а не кэш (повтор после «вне зоны», 07.11.2026)', async () => {
    useNetStore.setState({ online: true });
    vi.mocked(getCurrentPosition).mockResolvedValue({
      lat: 55.7,
      lng: 37.6,
      accuracy: 10,
      timestamp: 0,
    });
    vi.mocked(checkIn).mockRejectedValueOnce({
      response: { status: 403, data: { message: 'Вы находитесь вне зоны объекта' } },
    });
    vi.mocked(checkIn).mockResolvedValueOnce({} as never);

    const { result } = renderHook(() => useShiftActions(), { wrapper });
    const event = { scheduleId: 's-1' } as ScheduleEvent;

    act(() => result.current.checkIn(event));
    await waitFor(() => expect(result.current.message?.tone).toBe('error'));
    act(() => result.current.checkIn(event));
    await waitFor(() => expect(result.current.message?.tone).toBe('success'));

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(getCurrentPosition).mock.calls) {
      expect(call[1]).toEqual({ fresh: true });
    }
    expect(checkIn).toHaveBeenLastCalledWith({ scheduleId: 's-1', lat: 55.7, lng: 37.6 });
  });
});
