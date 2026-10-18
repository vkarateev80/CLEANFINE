import type { ScheduleSettingsView } from '@cleaning-ops/shared/types/time-zone';
import { apiClient } from './client';
import type { CheckInPayload, CheckOutPayload, ScheduleEvent } from '../types/schedule';

/**
 * Клиент schedule-service. `GET /schedule/my` берёт `user.id` из JWT —
 * чужие смены сюда не попадут. Отметки — `check-in` (с проверкой геозоны на
 * сервере) и `check-out`; обе идемпотентны и НЕ ставятся в оффлайн-очередь
 * (offline.md §4.1: отметка «задним числом» исказила бы учёт времени).
 */
export function listMyEvents(from: string, to: string): Promise<ScheduleEvent[]> {
  return apiClient.get('/schedule/my', { params: { from, to } }).then((r) => r.data);
}

export function getEvent(id: string): Promise<ScheduleEvent> {
  return apiClient.get(`/schedule/events/${id}`).then((r) => r.data);
}

export function checkIn(payload: CheckInPayload): Promise<ScheduleEvent> {
  return apiClient.post('/schedule/check-in', payload).then((r) => r.data);
}

export function checkOut(payload: CheckOutPayload): Promise<ScheduleEvent> {
  return apiClient.post('/schedule/check-out', payload).then((r) => r.data);
}

/** Настройки расписания: часовой пояс организации и сегодняшний день расписания. */
export function getScheduleSettings(): Promise<ScheduleSettingsView> {
  return apiClient.get('/schedule/settings').then((r) => r.data);
}
