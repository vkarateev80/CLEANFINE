import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listObjects } from '../../api/core';
import {
  getConsumptionByObject,
  getConsumptionReport,
  getConsumptionSummary,
  getGeofenceControlReport,
  getGeofenceSummary,
  getStaffControlReport,
  getStaffSummary,
  getTicketExecutionReport,
  getTicketSummary,
} from '../../api/reports';
import { listUsers } from '../../api/users';
import type { ReportRangeQuery, StaffControlQuery } from '../../types/reports';

/**
 * Данные экрана «Отчёты» и доски действий (М7.1).
 *
 * Ключи разделены по источникам (`['reports','materials',…]`): отчёт по расходу и отчёт по
 * геозонам живут в разных сервисах, и общая инвалидация обновляла бы запросы, которых
 * изменение не касается.
 *
 * `placeholderData: keepPreviousData` — при смене периода таблица не превращается в
 * скелет: старые строки остаются на месте, пока грузятся новые.
 */

/** Максимум `take` в core-service — 100; больше в один запрос не попросить. */
const OPTIONS_TAKE = 100;

/** Справочник объектов для фильтра и подписи строк отчёта. */
export function useObjectOptions() {
  return useQuery({
    queryKey: ['reports', 'objects'],
    queryFn: () => listObjects({ skip: 0, take: OPTIONS_TAKE }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Справочник сотрудников: нужен, чтобы в таблице был человек, а не uuid.
 *
 * `enabled` — потому что GET /api/users закрыт `@Roles('ADMIN','SUPERVISOR')`: у
 * оператора запрос не уходит вовсе, иначе страница получала бы 403 в консоли на каждом
 * открытии вкладки «Контроль персонала».
 */
export function useEmployeeOptions(options: { enabled: boolean }) {
  return useQuery({
    queryKey: ['reports', 'employees'],
    queryFn: () => listUsers({ skip: 0, take: OPTIONS_TAKE }),
    enabled: options.enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ------------------------------------------------------------------- материалы

export function useConsumptionReport(query: ReportRangeQuery) {
  return useQuery({
    queryKey: ['reports', 'materials', 'consumption', query],
    queryFn: () => getConsumptionReport(query),
    placeholderData: keepPreviousData,
  });
}

export function useConsumptionByObject(query: ReportRangeQuery) {
  return useQuery({
    queryKey: ['reports', 'materials', 'by-object', query],
    queryFn: () => getConsumptionByObject(query),
    placeholderData: keepPreviousData,
  });
}

export function useConsumptionSummary() {
  return useQuery({
    queryKey: ['reports', 'materials', 'summary'],
    queryFn: getConsumptionSummary,
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------- заявки

export function useTicketExecutionReport(query: ReportRangeQuery) {
  return useQuery({
    queryKey: ['reports', 'tickets', 'execution', query],
    queryFn: () => getTicketExecutionReport(query),
    placeholderData: keepPreviousData,
  });
}

export function useTicketSummary() {
  return useQuery({
    queryKey: ['reports', 'tickets', 'summary'],
    queryFn: getTicketSummary,
    staleTime: 60 * 1000,
  });
}

// ----------------------------------------------------------- контроль персонала

export function useStaffControlReport(query: StaffControlQuery) {
  return useQuery({
    queryKey: ['reports', 'schedule', 'staff-control', query],
    queryFn: () => getStaffControlReport(query),
    placeholderData: keepPreviousData,
  });
}

export function useStaffSummary() {
  return useQuery({
    queryKey: ['reports', 'schedule', 'summary'],
    queryFn: getStaffSummary,
    staleTime: 60 * 1000,
  });
}

// ------------------------------------------------------------ геозоны и маршруты

export function useGeofenceControlReport(query: StaffControlQuery) {
  return useQuery({
    queryKey: ['reports', 'gps', 'geofence-control', query],
    queryFn: () => getGeofenceControlReport(query),
    placeholderData: keepPreviousData,
  });
}

export function useGeofenceSummary() {
  return useQuery({
    queryKey: ['reports', 'gps', 'summary'],
    queryFn: getGeofenceSummary,
    staleTime: 60 * 1000,
  });
}
