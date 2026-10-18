import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SCHEDULE_TIME_ZONE, isValidTimeZone } from '@cleaning-ops/shared/types/time-zone';

/**
 * Часовой пояс расписания организации (настройка schedule-service, 18.10.2026).
 * Источник — `GET /api/schedule/settings`; здесь копия для форматирования без
 * ожидания запроса: прошлое значение хранится в localStorage, поэтому после
 * перезагрузки время сразу показывается в нужном поясе.
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
    { name: 'cleanfine-admin-time-zone' },
  ),
);

/** Текущий пояс вне React (форматтеры экранов расписания). */
export function currentTimeZone(): string {
  return useTimeZoneStore.getState().timeZone;
}
