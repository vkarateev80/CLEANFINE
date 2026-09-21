import { apiClient } from './client';
import type {
  ConsumptionByObjectReport,
  ConsumptionReport,
  ConsumptionSummary,
  GeofenceControlReport,
  GeofenceSummary,
  ReportRangeQuery,
  StaffControlQuery,
  StaffControlReport,
  StaffSummary,
  TicketExecutionReport,
  TicketSummary,
} from '../types/reports';

/**
 * Клиент отчётов М7.1 — четыре сервиса через единую точку входа (`/api/...`).
 *
 * Пути собраны в одном модуле по тому же правилу, что и в `api/materials`: страницы не
 * должны знать, что отчёт по расходу живёт в material-service, а по геозонам — в
 * gps-service. Для вызывающего это один раздел «Отчёты».
 *
 * Схема (решение архитектора №4, CQRS в «облегчённой» форме): read-модели
 * (SQL-представления) созданы ВНУТРИ сервиса-владельца данных, там же живут
 * read-эндпоинты. Единого представления сквозь сервисы нет — у каждого сервиса своя БД,
 * поэтому сводный дашборд собирает ответы сервисов, а не JOIN.
 */

/** Отчёт по расходу материалов: объект + период + материал (material-service). */
export function getConsumptionReport(query: ReportRangeQuery = {}): Promise<ConsumptionReport> {
  return apiClient.get('/materials/reports/consumption', { params: query }).then((r) => r.data);
}

/** Расход по объектам и материалам за всё время (material-service). */
export function getConsumptionByObject(
  query: ReportRangeQuery = {},
): Promise<ConsumptionByObjectReport> {
  return apiClient
    .get('/materials/reports/consumption/by-object', { params: query })
    .then((r) => r.data);
}

/** KPI расхода материалов для дашборда (material-service). */
export function getConsumptionSummary(): Promise<ConsumptionSummary> {
  return apiClient.get('/materials/reports/summary').then((r) => r.data);
}

/** Отчёт по выполнению заявок: количество, время цикла, просрочки (ticket-service). */
export function getTicketExecutionReport(
  query: ReportRangeQuery = {},
): Promise<TicketExecutionReport> {
  return apiClient.get('/tickets/reports/execution', { params: query }).then((r) => r.data);
}

/** KPI заявок для дашборда (ticket-service). */
export function getTicketSummary(): Promise<TicketSummary> {
  return apiClient.get('/tickets/reports/summary').then((r) => r.data);
}

/** Контроль персонала по сменам: check-in/check-out, явки, опоздания (schedule-service). */
export function getStaffControlReport(query: StaffControlQuery = {}): Promise<StaffControlReport> {
  return apiClient.get('/schedule/reports/staff-control', { params: query }).then((r) => r.data);
}

/** KPI смен для дашборда (schedule-service). */
export function getStaffSummary(): Promise<StaffSummary> {
  return apiClient.get('/schedule/reports/summary').then((r) => r.data);
}

/** Контроль персонала по геозонам и маршрутам (gps-service, PostGIS). */
export function getGeofenceControlReport(
  query: StaffControlQuery = {},
): Promise<GeofenceControlReport> {
  return apiClient.get('/gps/reports/geofence-control', { params: query }).then((r) => r.data);
}

/** KPI посещений объектов для дашборда (gps-service). */
export function getGeofenceSummary(): Promise<GeofenceSummary> {
  return apiClient.get('/gps/reports/summary').then((r) => r.data);
}
