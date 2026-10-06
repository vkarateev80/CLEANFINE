/**
 * Типы отчётов М7.1 — read-модели сервисов через единую точку входа (`/api/...`).
 *
 * Почему типы лежат одним файлом: отчёты четырёх сервисов (materials, tickets,
 * schedule, gps) собираются в один экран, и «сводная доска действий» — это как раз их
 * пересечение. Разложить контракты по файлам рядом с каждым сервисом значило бы
 * разорвать ровно ту связь, ради которой доска действий существует.
 *
 * Единого SQL-представления сквозь сервисы нет и быть не может: у каждого сервиса своя
 * БД (`cleaning_ops_materials`, `cleaning_ops_tickets`, …). Склейка — на клиенте.
 */

/** Общий фильтр отчётов: объект и период. Пустые поля в query не уходят. */
export interface ReportRangeQuery {
  objectId?: string;
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------- материалы (М4)

/** Строка разреза «объект + материал» за период. */
export interface ConsumptionReportRow {
  objectId: string;
  materialId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  consumedQuantity: number;
  operationsCount: number;
  cost: number;
}

/** Точка ряда расхода по дням. */
export interface ConsumptionSeriesPoint {
  day: string;
  consumedQuantity: number;
  cost: number;
  operationsCount: number;
}

export interface ConsumptionReportTotals {
  consumedQuantity: number;
  operationsCount: number;
  cost: number;
}

export interface ConsumptionReport {
  from: string | null;
  to: string | null;
  rows: ConsumptionReportRow[];
  totals: ConsumptionReportTotals;
  series: ConsumptionSeriesPoint[];
}

/** KPI расхода для доски действий (окно — последние 30 дней). */
export interface ConsumptionSummary {
  consumedQuantity30d: number;
  cost30d: number;
  operations30d: number;
  materialsCount: number;
  objectsCount: number;
  lowStockCount: number;
  topMaterials: Array<{ materialId: string; name: string; unit: string; cost: number }>;
}

/** Расход по объектам и материалам за всё время (вторая таблица отчёта). */
export interface ConsumptionByObjectReport {
  rows: ConsumptionReportRow[];
  totals: ConsumptionReportTotals;
}

// ------------------------------------------------------------------- заявки (М3)

export interface TicketExecutionRow {
  objectId: string;
  type: string;
  ticketsCount: number;
  completedCount: number;
  overdueCount: number;
  avgCycleMinutes: number | null;
  avgReactionMinutes: number | null;
}

export interface TicketDailyPoint {
  day: string;
  createdCount: number;
  completedCount: number;
  overdueCount: number;
  avgCycleMinutes: number | null;
}

export interface TicketExecutionReport {
  from: string | null;
  to: string | null;
  rows: TicketExecutionRow[];
  series: TicketDailyPoint[];
  totals: {
    ticketsCount: number;
    completedCount: number;
    overdueCount: number;
    avgCycleMinutes: number | null;
    overdueRate: number;
  };
}

export interface TicketSummary {
  ticketsTotal: number;
  newCount: number;
  inWorkCount: number;
  completedCount: number;
  overdueCount: number;
  emergencyCount: number;
  avgCycleMinutes: number | null;
  onTimeRate: number;
}

// ---------------------------------------------------------- контроль персонала (М4/М3)

export interface StaffControlReportRow {
  userId: string;
  shiftsCount: number;
  checkedInCount: number;
  checkedOutCount: number;
  missedCount: number;
  autoClosedCount: number;
  lateCount: number;
  avgWorkedMinutes: number | null;
  workedMinutes: number;
  maxLatenessMinutes: number | null;
}

export interface StaffByObjectRow {
  userId: string;
  objectId: string | null;
  routeId: string | null;
  shiftsCount: number;
  checkedInCount: number;
  missedCount: number;
  lateCount: number;
  workedMinutes: number;
}

export interface StaffDailyPoint {
  day: string;
  shiftsCount: number;
  checkedInCount: number;
  missedCount: number;
  lateCount: number;
}

export interface StaffControlReport {
  from: string | null;
  to: string | null;
  rows: StaffControlReportRow[];
  byObject: StaffByObjectRow[];
  series: StaffDailyPoint[];
  totals: {
    shiftsCount: number;
    checkedInCount: number;
    checkedOutCount: number;
    missedCount: number;
    autoClosedCount: number;
    lateCount: number;
    workedMinutes: number;
    avgWorkedMinutes: number | null;
    attendanceRate: number;
  };
}

export interface StaffSummary {
  shiftsTotal: number;
  checkedInCount: number;
  checkedOutCount: number;
  plannedCount: number;
  missedCount: number;
  autoClosedCount: number;
  lateCount: number;
  workedMinutes: number;
  avgWorkedMinutes: number | null;
  attendanceRate: number;
}

// --------------------------------------------------- геозоны и маршруты (М3, PostGIS)

export interface GeofenceControlReportRow {
  userId: string;
  objectId: string;
  visitsCount: number;
  presenceCount: number;
  dwellMinutes: number;
  firstEnteredAt: string | null;
}

export interface RouteActivityReportRow {
  userId: string;
  day: string;
  pointsCount: number;
  spanMinutes: number;
  objectsVisited: number;
  firstPointAt: string | null;
  lastPointAt: string | null;
}

export interface GeofenceDailyPoint {
  day: string;
  visitsCount: number;
  dwellMinutes: number;
  pointsCount: number;
}

export interface GeofenceControlReport {
  from: string | null;
  to: string | null;
  rows: GeofenceControlReportRow[];
  routes: RouteActivityReportRow[];
  series: GeofenceDailyPoint[];
  totals: {
    visitsCount: number;
    dwellMinutes: number;
    trackedUsersCount: number;
    pointsCount: number;
    objectsVisitedCount: number;
  };
}

export interface GeofenceSummary {
  visitsCount: number;
  dwellMinutes: number;
  avgDwellMinutes: number | null;
  trackedUsersCount: number;
  pointsCount: number;
  objectsVisitedCount: number;
}

/** Контроль персонала с фильтром по сотруднику. */
export interface StaffControlQuery extends ReportRangeQuery {
  userId?: string;
}
