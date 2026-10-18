import type { ScheduleSettingsView } from '@cleaning-ops/shared/types/time-zone';
import { apiClient } from './client';
import type { ListEventsQuery, ScheduleEventEntity } from '../types/schedule';

/**
 * Клиент schedule-service (:3008 через прокси `/api/schedule`). Портал только
 * читает смены объекта: `POST /schedule`, чекины и ручные триггеры — рабочие
 * места админки и мобильного приложения оператора.
 */

/**
 * Пустые строки в query не отправляем: сервис трактует `objectId=` как «фильтр
 * задан», и список смен молча оказался бы пустым (тот же приём, что в
 * `web-admin/src/api/schedule.ts`).
 */
function compact(params: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') result[key] = value;
  }
  return result;
}

/**
 * `GET /api/schedule/events` — плоские смены объекта.
 *
 * `ListEventsQueryDto` принимает `date`/`objectId`/`userId`, а не диапазон
 * `from`/`to` (тот есть только у `/schedule/my`), поэтому «за период» на экране
 * отчётов собирается по дню: экран запрашивает смены на каждую дату периода
 * (см. `pages/Reports/useReportsData.ts`). Фильтр `date` — «YYYY-MM-DD».
 */
export function listEvents(query: ListEventsQuery = {}): Promise<ScheduleEventEntity[]> {
  return apiClient.get('/schedule/events', { params: compact({ ...query }) }).then((r) => r.data);
}

/** Настройки расписания: часовой пояс организации и сегодняшний день расписания. */
export function getScheduleSettings(): Promise<ScheduleSettingsView> {
  return apiClient.get('/schedule/settings').then((r) => r.data);
}
