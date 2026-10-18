import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getScheduleSettings } from '../api/schedule';
import { useAuthStore } from '../stores/authStore';
import { useTimeZoneStore } from '../stores/timeZoneStore';

export const SCHEDULE_SETTINGS_QUERY_KEY = ['schedule', 'settings'] as const;

/**
 * Настройки расписания с сервера; пояс синхронизируется в `timeZoneStore`.
 * Вызывается каркасом админки один раз — экраны читают пояс из стора.
 */
export function useScheduleSettings() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setTimeZone = useTimeZoneStore((s) => s.setTimeZone);
  const query = useQuery({
    queryKey: SCHEDULE_SETTINGS_QUERY_KEY,
    queryFn: getScheduleSettings,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60_000,
  });
  const timeZone = query.data?.timeZone;
  useEffect(() => {
    if (timeZone) setTimeZone(timeZone);
  }, [timeZone, setTimeZone]);
  return query;
}
