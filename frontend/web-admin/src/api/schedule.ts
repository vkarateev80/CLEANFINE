import type { ScheduleSettingsView } from '@cleaning-ops/shared/types/time-zone';
import { apiClient } from './client';
import type {
  CheckInPayload,
  CheckOutPayload,
  CreateSchedulePayload,
  DeleteScheduleResult,
  GenerationResult,
  ListEventsQuery,
  MissedScanResult,
  MyEventsQuery,
  ScheduleEntity,
  ScheduleEventEntity,
  SchedulerState,
  UpdateSchedulePayload,
} from '../types/schedule';

/**
 * Клиент schedule-service (:3008 через прокси `/api/schedule`). Как и
 * `api/core`, `api/tickets`, `api/materials`, пути собраны в одном модуле:
 * страницы не должны знать про `/schedule/events`, `/schedule/check-missed` и
 * т.п., иначе путь размножится по компонентам и разойдётся с
 * `ScheduleController`.
 *
 * Роли (повторяют `@Roles(...)`, см. `usePermissions.ts`):
 *  • GET (список графиков, смены дня, `/my`, смена по id) — все авторизованные;
 *  • POST/PATCH/DELETE графика — ADMIN, SUPERVISOR;
 *  • POST /check-in, /check-out — OPERATOR, SUPERVISOR, ADMIN;
 *  • POST /generate, POST /check-missed, GET /scheduler/state — только ADMIN.
 */

/**
 * Пустые строки в query не отправляем: `@IsOptional() @IsString()` пропустит и
 * `objectId=`, но сервис трактует пустую строку как «фильтр задан» и он не
 * совпадёт ни с одной записью — список смен молча оказался бы пустым. Поэтому
 * фильтр либо есть, либо параметра нет вовсе (тот же приём, что в
 * `api/materials.ts`).
 */
function compact(params: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') result[key] = value;
  }
  return result;
}

/** `GET /api/schedule` — графики с числом смен (`eventsCount`), без пагинации. */
export function listSchedules(): Promise<ScheduleEntity[]> {
  return apiClient.get('/schedule').then((r) => r.data);
}

/** `GET /api/schedule/events` — плоские смены дня с фильтрами объекта/исполнителя. */
export function listEvents(query: ListEventsQuery = {}): Promise<ScheduleEventEntity[]> {
  return apiClient.get('/schedule/events', { params: compact({ ...query }) }).then((r) => r.data);
}

/** `GET /api/schedule/events/:id` — одна смена (вкладка «Смены дня» ей не пользуется). */
export function getEvent(id: string): Promise<ScheduleEventEntity> {
  return apiClient.get(`/schedule/events/${id}`).then((r) => r.data);
}

/**
 * `GET /api/schedule/my` — смены ТЕКУЩЕГО пользователя: id берётся из JWT на
 * бэкенде, поэтому другой сотрудник через этот эндпоинт не смотрится.
 */
export function listMyEvents(query: MyEventsQuery = {}): Promise<ScheduleEventEntity[]> {
  return apiClient.get('/schedule/my', { params: compact({ ...query }) }).then((r) => r.data);
}

export function createSchedule(payload: CreateSchedulePayload): Promise<ScheduleEntity> {
  return apiClient.post('/schedule', payload).then((r) => r.data);
}

export function updateSchedule(
  id: string,
  payload: UpdateSchedulePayload,
): Promise<ScheduleEntity> {
  return apiClient.patch(`/schedule/${id}`, payload).then((r) => r.data);
}

/** Удаление каскадом снимает смены графика (`onDelete: Cascade`). */
export function deleteSchedule(id: string): Promise<DeleteScheduleResult> {
  return apiClient.delete(`/schedule/${id}`).then((r) => r.data);
}

/**
 * `POST /api/schedule/check-in` — отметка по смене за СЕБЯ (CurrentUser на
 * бэкенде). Вне геозоны — 403 «Вы находитесь вне зоны объекта», gps недоступен
 * — 502, смены на сегодня нет — 404, повтор идемпотентен. Тексты не
 * подменяем: показываем то, что ответил сервис.
 */
export function checkIn(payload: CheckInPayload): Promise<ScheduleEventEntity> {
  return apiClient.post('/schedule/check-in', payload).then((r) => r.data);
}

/**
 * `POST /api/schedule/check-out`. Без предварительного check-in — 400 «Смена не
 * открыта: сначала выполните check-in»; координаты необязательны, поэтому
 * отправляем их только если они реально получены.
 */
export function checkOut(payload: CheckOutPayload): Promise<ScheduleEventEntity> {
  return apiClient
    .post('/schedule/check-out', {
      scheduleId: payload.scheduleId,
      ...(payload.lat === undefined ? {} : { lat: payload.lat }),
      ...(payload.lng === undefined ? {} : { lng: payload.lng }),
    })
    .then((r) => r.data);
}

/**
 * `POST /api/schedule/generate?date=YYYY-MM-DD` (только ADMIN). Идемпотентен:
 * повторный вызов на ту же дату не создаёт ни смен, ни заявок, а смены без
 * заявки после сбоя ticket-service до-создаются. 502 — ticket-service недоступен.
 */
export function generateForDate(date: string): Promise<GenerationResult> {
  return apiClient.post('/schedule/generate', null, { params: { date } }).then((r) => r.data);
}

/**
 * `POST /api/schedule/check-missed?date=YYYY-MM-DD` (только ADMIN): неявки →
 * MISSED и авто check-out «зависших» смен. Дата та же, что у фильтра вкладки:
 * иначе сводка относилась бы к другому дню, чем таблица под ней.
 */
export function checkMissed(date: string): Promise<MissedScanResult> {
  return apiClient.post('/schedule/check-missed', null, { params: { date } }).then((r) => r.data);
}

/** `GET /api/schedule/scheduler/state` (только ADMIN) — отметки последних проходов. */
export function getSchedulerState(): Promise<SchedulerState> {
  return apiClient.get('/schedule/scheduler/state').then((r) => r.data);
}

/** Настройки расписания: часовой пояс организации и сегодняшний день (все авторизованные). */
export function getScheduleSettings(): Promise<ScheduleSettingsView> {
  return apiClient.get('/schedule/settings').then((r) => r.data);
}

/** Смена часового пояса расписания (только ADMIN). */
export function updateScheduleSettings(timeZone: string): Promise<ScheduleSettingsView> {
  return apiClient.patch('/schedule/settings', { timeZone }).then((r) => r.data);
}
