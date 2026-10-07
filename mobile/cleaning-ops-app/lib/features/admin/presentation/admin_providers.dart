import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../services/service_providers.dart';
import '../data/admin_reports_models.dart';

/// Провайдеры доски действий: шесть read-моделей четырёх сервисов, как в
/// web-admin (`useReports.ts`), но через наши `ApiClient` по базовым адресам
/// сервисов. Период — последние 30 дней (`defaultPeriod(30)` в вебе).

/// Окно KPI — 30 дней; то же окно у страницы «Отчёты» в админке.
class ReportPeriod {
  const ReportPeriod({required this.from, required this.to});

  /// `YYYY-MM-DD` в UTC — формат, который принимает DTO отчётов.
  factory ReportPeriod.lastDays(int days) {
    final DateTime today = DateTime.now().toUtc();
    final DateTime start = today.subtract(Duration(days: days));
    String dateOnly(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    return ReportPeriod(from: dateOnly(start), to: dateOnly(today));
  }

  final String from;
  final String to;

  Map<String, dynamic> toQuery() => <String, dynamic>{'from': from, 'to': to};
}

final reportPeriodProvider = Provider<ReportPeriod>((ref) => ReportPeriod.lastDays(30));

Map<String, dynamic> _asMap(Object? data) {
  if (data is Map<String, dynamic>) return data;
  if (data is Map) return Map<String, dynamic>.from(data);
  throw FormatException('Ожидался объект ответа, получено: ${data.runtimeType}');
}

final ticketSummaryProvider = FutureProvider<TicketSummary>((ref) async {
  final response = await ref.watch(ticketsApiProvider).get('/api/tickets/reports/summary');
  return TicketSummary.fromJson(_asMap(response.data));
});

final ticketExecutionProvider = FutureProvider<TicketExecutionReport>((ref) async {
  final period = ref.watch(reportPeriodProvider);
  final response = await ref
      .watch(ticketsApiProvider)
      .get('/api/tickets/reports/execution', query: period.toQuery());
  return TicketExecutionReport.fromJson(_asMap(response.data));
});

final consumptionSummaryProvider = FutureProvider<ConsumptionSummary>((ref) async {
  final response = await ref.watch(materialsApiProvider).get('/api/materials/reports/summary');
  return ConsumptionSummary.fromJson(_asMap(response.data));
});

final consumptionReportProvider = FutureProvider<ConsumptionReport>((ref) async {
  final period = ref.watch(reportPeriodProvider);
  final response = await ref
      .watch(materialsApiProvider)
      .get('/api/materials/reports/consumption', query: period.toQuery());
  return ConsumptionReport.fromJson(_asMap(response.data));
});

final staffSummaryProvider = FutureProvider<StaffSummary>((ref) async {
  final response = await ref.watch(scheduleApiProvider).get('/api/schedule/reports/summary');
  return StaffSummary.fromJson(_asMap(response.data));
});

final geofenceSummaryProvider = FutureProvider<GeofenceSummary>((ref) async {
  final response = await ref.watch(gpsApiProvider).get('/api/gps/reports/summary');
  return GeofenceSummary.fromJson(_asMap(response.data));
});
