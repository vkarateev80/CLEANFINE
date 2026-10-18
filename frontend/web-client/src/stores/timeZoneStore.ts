import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SCHEDULE_TIME_ZONE, isValidTimeZone } from '@cleaning-ops/shared/types/time-zone';

/**
 * Часовой пояс расписания организации (настройка schedule-service, 18.10.2026,
 * `GET /api/schedule/settings`). Копия в localStorage — чтобы время и «сегодня»
 * считались в нужном поясе сразу после перезагрузки и без сети.
 */
interface TimeZoneState {
  timeZone: string;
  setTimeZone: (timeZone: string) => void;
}

export const useTimeZoneStore = create<TimeZoneState>()(
  persist(
    (set) => ({
      timeZone: DEFAULT_SCHEDULE_TIME_ZONE,
      setTimeZone: (timeZone) => {
        if (isValidTimeZone(timeZone)) set({ timeZone });
      },
    }),
    { name: 'cleanfine-client-time-zone' },
  ),
);

/** Текущий пояс вне React (форматтеры). */
export function currentTimeZone(): string {
  return useTimeZoneStore.getState().timeZone;
}
