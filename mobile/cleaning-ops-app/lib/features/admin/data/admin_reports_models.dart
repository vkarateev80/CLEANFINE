/// Модели доски действий — калька `web-admin/src/types/reports.ts` (М7.1).
///
/// Четыре сводки + два отчёта series приходят из разных сервисов read-моделями;
/// склейка — на клиенте (как в вебе). `fromJson` терпим к null: ответы продовой
/// выборки пустые (нули и `null`), и экран обязан это показывать, а не падать.

/// KPI заявок: `GET /api/tickets/reports/summary` (ticket-service).
class TicketSummary {
  const TicketSummary({
    required this.ticketsTotal,
    required this.newCount,
    required this.inWorkCount,
    required this.completedCount,
    required this.overdueCount,
    required this.emergencyCount,
    required this.avgCycleMinutes,
    required this.onTimeRate,
  });

  factory TicketSummary.fromJson(Map<String, dynamic> json) => TicketSummary(
        ticketsTotal: (json['ticketsTotal'] as num?)?.toInt() ?? 0,
        newCount: (json['newCount'] as num?)?.toInt() ?? 0,
        inWorkCount: (json['inWorkCount'] as num?)?.toInt() ?? 0,
        completedCount: (json['completedCount'] as num?)?.toInt() ?? 0,
        overdueCount: (json['overdueCount'] as num?)?.toInt() ?? 0,
        emergencyCount: (json['emergencyCount'] as num?)?.toInt() ?? 0,
        avgCycleMinutes: (json['avgCycleMinutes'] as num?)?.toDouble(),
        onTimeRate: (json['onTimeRate'] as num?)?.toDouble(),
      );

  final int ticketsTotal;
  final int newCount;
  final int inWorkCount;
  final int completedCount;
  final int overdueCount;
  final int emergencyCount;
  final double? avgCycleMinutes;
  final double? onTimeRate;
}

/// KPI расхода материалов: `GET /api/materials/reports/summary` (material-service).
class ConsumptionSummary {
  const ConsumptionSummary({
    required this.consumedQuantity30d,
    required this.cost30d,
    required this.operations30d,
    required this.materialsCount,
    required this.objectsCount,
    required this.lowStockCount,
    required this.topMaterials,
  });

  factory ConsumptionSummary.fromJson(Map<String, dynamic> json) => ConsumptionSummary(
        consumedQuantity30d: (json['consumedQuantity30d'] as num?)?.toDouble() ?? 0,
        cost30d: (json['cost30d'] as num?)?.toDouble() ?? 0,
        operations30d: (json['operations30d'] as num?)?.toInt() ?? 0,
        materialsCount: (json['materialsCount'] as num?)?.toInt() ?? 0,
        objectsCount: (json['objectsCount'] as num?)?.toInt() ?? 0,
        lowStockCount: (json['lowStockCount'] as num?)?.toInt() ?? 0,
        topMaterials: ((json['topMaterials'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList(),
      );

  final double consumedQuantity30d;
  final double cost30d;
  final int operations30d;
  final int materialsCount;
  final int objectsCount;
  final int lowStockCount;
  final List<Map<String, dynamic>> topMaterials;
}

/// KPI смен: `GET /api/schedule/reports/summary` (schedule-service).
class StaffSummary {
  const StaffSummary({
    required this.shiftsTotal,
    required this.checkedInCount,
    required this.checkedOutCount,
    required this.plannedCount,
    required this.missedCount,
    required this.autoClosedCount,
    required this.lateCount,
    required this.workedMinutes,
    required this.avgWorkedMinutes,
    required this.attendanceRate,
  });

  factory StaffSummary.fromJson(Map<String, dynamic> json) => StaffSummary(
        shiftsTotal: (json['shiftsTotal'] as num?)?.toInt() ?? 0,
        checkedInCount: (json['checkedInCount'] as num?)?.toInt() ?? 0,
        checkedOutCount: (json['checkedOutCount'] as num?)?.toInt() ?? 0,
        plannedCount: (json['plannedCount'] as num?)?.toInt() ?? 0,
        missedCount: (json['missedCount'] as num?)?.toInt() ?? 0,
        autoClosedCount: (json['autoClosedCount'] as num?)?.toInt() ?? 0,
        lateCount: (json['lateCount'] as num?)?.toInt() ?? 0,
        workedMinutes: (json['workedMinutes'] as num?)?.toInt() ?? 0,
        avgWorkedMinutes: (json['avgWorkedMinutes'] as num?)?.toDouble(),
        attendanceRate: (json['attendanceRate'] as num?)?.toDouble(),
      );

  final int shiftsTotal;
  final int checkedInCount;
  final int checkedOutCount;
  final int plannedCount;
  final int missedCount;
  final int autoClosedCount;
  final int lateCount;
  final int workedMinutes;
  final double? avgWorkedMinutes;
  final double? attendanceRate;
}

/// KPI посещений: `GET /api/gps/reports/summary` (gps-service).
class GeofenceSummary {
  const GeofenceSummary({
    required this.visitsCount,
    required this.dwellMinutes,
    required this.avgDwellMinutes,
    required this.trackedUsersCount,
    required this.pointsCount,
    required this.objectsVisitedCount,
  });

  factory GeofenceSummary.fromJson(Map<String, dynamic> json) => GeofenceSummary(
        visitsCount: (json['visitsCount'] as num?)?.toInt() ?? 0,
        dwellMinutes: (json['dwellMinutes'] as num?)?.toInt() ?? 0,
        avgDwellMinutes: (json['avgDwellMinutes'] as num?)?.toDouble(),
        trackedUsersCount: (json['trackedUsersCount'] as num?)?.toInt() ?? 0,
        pointsCount: (json['pointsCount'] as num?)?.toInt() ?? 0,
        objectsVisitedCount: (json['objectsVisitedCount'] as num?)?.toInt() ?? 0,
      );

  final int visitsCount;
  final int dwellMinutes;
  final double? avgDwellMinutes;
  final int trackedUsersCount;
  final int pointsCount;
  final int objectsVisitedCount;
}

/// Точка ряда «заявки по дням» (график доски).
class TicketDailyPoint {
  const TicketDailyPoint({
    required this.day,
    required this.createdCount,
    required this.completedCount,
    required this.overdueCount,
    required this.avgCycleMinutes,
  });

  factory TicketDailyPoint.fromJson(Map<String, dynamic> json) => TicketDailyPoint(
        day: json['day'] as String? ?? '',
        createdCount: (json['createdCount'] as num?)?.toInt() ?? 0,
        completedCount: (json['completedCount'] as num?)?.toInt() ?? 0,
        overdueCount: (json['overdueCount'] as num?)?.toInt() ?? 0,
        avgCycleMinutes: (json['avgCycleMinutes'] as num?)?.toDouble(),
      );

  final String day;
  final int createdCount;
  final int completedCount;
  final int overdueCount;
  final double? avgCycleMinutes;
}

/// `GET /api/tickets/reports/execution?from&to` — ряд для графика заявок.
class TicketExecutionReport {
  const TicketExecutionReport({required this.from, required this.to, required this.series});

  factory TicketExecutionReport.fromJson(Map<String, dynamic> json) => TicketExecutionReport(
        from: json['from'] as String?,
        to: json['to'] as String?,
        series: ((json['series'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(TicketDailyPoint.fromJson)
            .toList(),
      );

  final String? from;
  final String? to;
  final List<TicketDailyPoint> series;
}

/// Точка ряда «расход по дням».
class ConsumptionSeriesPoint {
  const ConsumptionSeriesPoint({
    required this.day,
    required this.consumedQuantity,
    required this.cost,
    required this.operationsCount,
  });

  factory ConsumptionSeriesPoint.fromJson(Map<String, dynamic> json) => ConsumptionSeriesPoint(
        day: json['day'] as String? ?? '',
        consumedQuantity: (json['consumedQuantity'] as num?)?.toDouble() ?? 0,
        cost: (json['cost'] as num?)?.toDouble() ?? 0,
        operationsCount: (json['operationsCount'] as num?)?.toInt() ?? 0,
      );

  final String day;
  final double consumedQuantity;
  final double cost;
  final int operationsCount;
}

/// `GET /api/materials/reports/consumption?from&to` — ряд для графика расхода.
class ConsumptionReport {
  const ConsumptionReport({required this.from, required this.to, required this.series});

  factory ConsumptionReport.fromJson(Map<String, dynamic> json) => ConsumptionReport(
        from: json['from'] as String?,
        to: json['to'] as String?,
        series: ((json['series'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ConsumptionSeriesPoint.fromJson)
            .toList(),
      );

  final String? from;
  final String? to;
  final List<ConsumptionSeriesPoint> series;
}
