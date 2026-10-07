import 'dart:convert';
import 'dart:io';

import 'package:cleaning_ops_app/features/admin/data/admin_reports_models.dart';
import 'package:cleaning_ops_app/features/admin/presentation/admin_providers.dart';
import 'package:flutter_test/flutter_test.dart';

/// Модели доски действий на реальных ответах прода (фикстуры сняты с
/// cleanfine.ru 07.10.2026): нули и `null` не должны ронять парсинг.
Map<String, dynamic> _fixture(String name) {
  final String raw = File('test/fixtures/admin/$name').readAsStringSync();
  return jsonDecode(raw) as Map<String, dynamic>;
}

void main() {
  group('сводки (реальные ответы прода)', () {
    test('TicketSummary парсится из ticket_summary.json', () {
      final TicketSummary value = TicketSummary.fromJson(_fixture('ticket_summary.json'));
      expect(value.ticketsTotal, 0);
      expect(value.onTimeRate, 100);
      expect(value.avgCycleMinutes, isNull);
    });

    test('ConsumptionSummary парсится из materials_summary.json', () {
      final ConsumptionSummary value = ConsumptionSummary.fromJson(_fixture('materials_summary.json'));
      expect(value.cost30d, 0);
      expect(value.lowStockCount, 0);
      expect(value.topMaterials, isEmpty);
    });

    test('StaffSummary парсится из schedule_summary.json', () {
      final StaffSummary value = StaffSummary.fromJson(_fixture('schedule_summary.json'));
      expect(value.shiftsTotal, 0);
      expect(value.attendanceRate, 100);
      expect(value.avgWorkedMinutes, isNull);
    });

    test('GeofenceSummary парсится из gps_summary.json', () {
      final GeofenceSummary value = GeofenceSummary.fromJson(_fixture('gps_summary.json'));
      expect(value.trackedUsersCount, 1);
      expect(value.pointsCount, 38);
      expect(value.avgDwellMinutes, isNull);
    });
  });

  group('отчёты series', () {
    test('TicketExecutionReport: from/to и пустой series', () {
      final TicketExecutionReport value =
          TicketExecutionReport.fromJson(_fixture('ticket_execution.json'));
      expect(value.from, '2026-09-07');
      expect(value.to, '2026-10-07');
      expect(value.series, isEmpty);
    });

    test('ConsumptionReport: from/to и пустой series', () {
      final ConsumptionReport value =
          ConsumptionReport.fromJson(_fixture('materials_consumption.json'));
      expect(value.from, '2026-09-07');
      expect(value.to, '2026-10-07');
      expect(value.series, isEmpty);
    });
  });

  group('толерантный парсинг', () {
    test('неполный объект не падает — поля по умолчанию', () {
      final TicketSummary value = TicketSummary.fromJson(<String, dynamic>{});
      expect(value.ticketsTotal, 0);
      expect(value.onTimeRate, isNull);
      expect(value.avgCycleMinutes, isNull);
    });

    test('series читает точки с null-метриками', () {
      final TicketExecutionReport report = TicketExecutionReport.fromJson(<String, dynamic>{
        'from': null,
        'to': null,
        'series': <Map<String, dynamic>>[
          <String, dynamic>{'day': '2026-10-01', 'createdCount': 3, 'completedCount': null},
        ],
      });
      expect(report.series.single.day, '2026-10-01');
      expect(report.series.single.createdCount, 3);
      expect(report.series.single.completedCount, 0);
    });
  });

  group('ReportPeriod', () {
    test('последние N дней в формате YYYY-MM-DD', () {
      final ReportPeriod period = ReportPeriod.lastDays(30);
      expect(period.from, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
      expect(period.to, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
      expect(period.toQuery().keys, containsAll(<String>['from', 'to']));
    });
  });
}
