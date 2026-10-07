import 'package:cleaning_ops_app/features/admin/admin_formatters.dart';
import 'package:cleaning_ops_app/features/admin/data/admin_reports_models.dart';
import 'package:cleaning_ops_app/features/admin/presentation/admin_providers.dart';
import 'package:cleaning_ops_app/features/admin/presentation/pages/admin_dashboard_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// «Доска действий»: рендер KPI/графиков на подставленных моделях, пустой ряд
/// и путь ошибки с кнопкой «Повторить».
void main() {
  TicketSummary tickets() => const TicketSummary(
        ticketsTotal: 42,
        newCount: 5,
        inWorkCount: 7,
        completedCount: 30,
        overdueCount: 3,
        emergencyCount: 1,
        avgCycleMinutes: 150,
        onTimeRate: 92.5,
      );
  ConsumptionSummary consumption() => const ConsumptionSummary(
        consumedQuantity30d: 12,
        cost30d: 1234.5,
        operations30d: 18,
        materialsCount: 9,
        objectsCount: 4,
        lowStockCount: 2,
        topMaterials: <Map<String, dynamic>>[],
      );
  StaffSummary staff() => const StaffSummary(
        shiftsTotal: 30,
        checkedInCount: 28,
        checkedOutCount: 27,
        plannedCount: 30,
        missedCount: 1,
        autoClosedCount: 2,
        lateCount: 4,
        workedMinutes: 4000,
        avgWorkedMinutes: 133,
        attendanceRate: 95,
      );
  GeofenceSummary geofence() => const GeofenceSummary(
        visitsCount: 120,
        dwellMinutes: 450,
        avgDwellMinutes: 22.5,
        trackedUsersCount: 6,
        pointsCount: 1234,
        objectsVisitedCount: 8,
      );
  TicketExecutionReport execution({bool empty = false}) => TicketExecutionReport(
        from: '2026-09-07',
        to: '2026-10-07',
        series: empty
            ? const <TicketDailyPoint>[]
            : const <TicketDailyPoint>[
                TicketDailyPoint(
                    day: '2026-10-01',
                    createdCount: 5,
                    completedCount: 4,
                    overdueCount: 1,
                    avgCycleMinutes: 100),
                TicketDailyPoint(
                    day: '2026-10-02',
                    createdCount: 3,
                    completedCount: 3,
                    overdueCount: 0,
                    avgCycleMinutes: null),
              ],
      );
  ConsumptionReport consumptionReport({bool empty = false}) => ConsumptionReport(
        from: '2026-09-07',
        to: '2026-10-07',
        series: empty
            ? const <ConsumptionSeriesPoint>[]
            : const <ConsumptionSeriesPoint>[
                ConsumptionSeriesPoint(
                    day: '2026-10-01', consumedQuantity: 1, cost: 10, operationsCount: 2),
                ConsumptionSeriesPoint(
                    day: '2026-10-02', consumedQuantity: 2, cost: 20.5, operationsCount: 3),
              ],
      );

  List<Override> overrides({
    TicketSummary? ticketsValue,
    TicketExecutionReport? executionValue,
    Object? ticketsError,
  }) =>
      <Override>[
        ticketSummaryProvider.overrideWith((ref) async {
          if (ticketsError != null) throw ticketsError;
          return ticketsValue ?? tickets();
        }),
        ticketExecutionProvider.overrideWith((ref) async => executionValue ?? execution()),
        consumptionSummaryProvider.overrideWith((ref) async => consumption()),
        consumptionReportProvider.overrideWith((ref) async => consumptionReport()),
        staffSummaryProvider.overrideWith((ref) async => staff()),
        geofenceSummaryProvider.overrideWith((ref) async => geofence()),
      ];

  Future<void> pumpPage(WidgetTester tester, List<Override> list) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: list,
        child: const MaterialApp(home: AdminDashboardPage()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
  }

  testWidgets('рисует KPI и графики из моделей', (tester) async {
    await pumpPage(tester, overrides());

    expect(find.byKey(const Key('admin_page')), findsOneWidget);
    expect(find.text('Доска действий'), findsOneWidget);
    expect(find.byKey(const Key('admin_kpi_tickets_total')), findsOneWidget);
    expect(find.text('42'), findsOneWidget);
    expect(find.text('92,5 %'), findsOneWidget);
    expect(find.text('2 ч 30 мин'), findsWidgets);
    expect(find.text(formatMoney(1234.5)), findsOneWidget);
    expect(find.text('95 %'), findsOneWidget);

    // ListView строит детей лениво: графики ниже первого экрана.
    await tester.scrollUntilVisible(find.byKey(const Key('admin_chart_consumption')), 200);
    await tester.pump();

    expect(find.byKey(const Key('admin_chart_tickets')), findsOneWidget);
    expect(find.byKey(const Key('admin_chart_consumption')), findsOneWidget);
    expect(find.byKey(const Key('chart_empty')), findsNothing);
    expect(find.byKey(const Key('admin_error')), findsNothing);
  });

  testWidgets('пустой series — «Нет данных за период», ошибки нет', (tester) async {
    await pumpPage(
      tester,
      overrides(executionValue: execution(empty: true)),
    );

    expect(find.byKey(const Key('chart_empty')), findsWidgets);
    expect(find.byKey(const Key('admin_error')), findsNothing);
  });

  testWidgets('ошибка загрузки — баннер и «Повторить»', (tester) async {
    await pumpPage(tester, overrides(ticketsError: Exception('network')));

    expect(find.byKey(const Key('admin_error')), findsOneWidget);
    expect(find.text('Не удалось загрузить дашборд'), findsOneWidget);
    expect(find.byKey(const Key('admin_retry')), findsOneWidget);
    // Графики при ошибке KPI не показываются — как в вебе.
    expect(find.byKey(const Key('admin_chart_tickets')), findsNothing);
  });
}
