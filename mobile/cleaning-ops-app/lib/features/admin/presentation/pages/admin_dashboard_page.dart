import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../admin_formatters.dart';
import '../../admin_texts.dart';
import '../../data/admin_reports_models.dart';
import '../admin_providers.dart';
import '../widgets/admin_kpi_card.dart';
import '../widgets/mini_bar_chart.dart';

/// «Доска действий» (М7.1-зеркало) — вкладка «Админ» для ADMIN/SUPERVISOR.
///
/// Восемь KPI-карточек и два компактных графика поверх шести read-моделей
/// четырёх сервисов — порция веб-`DashboardPage.tsx`, адаптированная под узкий
/// экран: карточки идут в Wrap по два, графики столбиком.
class AdminDashboardPage extends ConsumerWidget {
  const AdminDashboardPage({super.key});

  static const TicketSummary _emptyTickets = TicketSummary(
    ticketsTotal: 0,
    newCount: 0,
    inWorkCount: 0,
    completedCount: 0,
    overdueCount: 0,
    emergencyCount: 0,
    avgCycleMinutes: null,
    onTimeRate: null,
  );
  static const ConsumptionSummary _emptyConsumption = ConsumptionSummary(
    consumedQuantity30d: 0,
    cost30d: 0,
    operations30d: 0,
    materialsCount: 0,
    objectsCount: 0,
    lowStockCount: 0,
    topMaterials: <Map<String, dynamic>>[],
  );
  static const StaffSummary _emptyStaff = StaffSummary(
    shiftsTotal: 0,
    checkedInCount: 0,
    checkedOutCount: 0,
    plannedCount: 0,
    missedCount: 0,
    autoClosedCount: 0,
    lateCount: 0,
    workedMinutes: 0,
    avgWorkedMinutes: null,
    attendanceRate: null,
  );
  static const GeofenceSummary _emptyGeofence = GeofenceSummary(
    visitsCount: 0,
    dwellMinutes: 0,
    avgDwellMinutes: null,
    trackedUsersCount: 0,
    pointsCount: 0,
    objectsVisitedCount: 0,
  );

  void _retry(WidgetRef ref) {
    ref.invalidate(ticketSummaryProvider);
    ref.invalidate(ticketExecutionProvider);
    ref.invalidate(consumptionSummaryProvider);
    ref.invalidate(consumptionReportProvider);
    ref.invalidate(staffSummaryProvider);
    ref.invalidate(geofenceSummaryProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<TicketSummary> tickets = ref.watch(ticketSummaryProvider);
    final AsyncValue<TicketExecutionReport> execution = ref.watch(ticketExecutionProvider);
    final AsyncValue<ConsumptionSummary> consumption = ref.watch(consumptionSummaryProvider);
    final AsyncValue<ConsumptionReport> consumptionSeries = ref.watch(consumptionReportProvider);
    final AsyncValue<StaffSummary> staff = ref.watch(staffSummaryProvider);
    final AsyncValue<GeofenceSummary> geofence = ref.watch(geofenceSummaryProvider);

    final List<AsyncValue<Object?>> all = <AsyncValue<Object?>>[
      tickets,
      execution,
      consumption,
      consumptionSeries,
      staff,
      geofence,
    ];
    final bool failed = all.any((AsyncValue<Object?> a) => a.hasError);
    final bool loading = all.any((AsyncValue<Object?> a) => a.isLoading) &&
        all.every((AsyncValue<Object?> a) => !a.hasValue);

    final TicketSummary t = tickets.valueOrNull ?? _emptyTickets;
    final ConsumptionSummary c = consumption.valueOrNull ?? _emptyConsumption;
    final StaffSummary s = staff.valueOrNull ?? _emptyStaff;
    final GeofenceSummary g = geofence.valueOrNull ?? _emptyGeofence;
    final List<TicketDailyPoint> ticketSeries = execution.valueOrNull?.series ?? const [];
    final List<ConsumptionSeriesPoint> costSeries =
        consumptionSeries.valueOrNull?.series ?? const [];

    return Scaffold(
      key: const Key('admin_page'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Text(
              AdminTexts.title,
              key: const Key('admin_title'),
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w700, color: AppPalette.textPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              AdminTexts.subtitle,
              style:
                  Theme.of(context).textTheme.bodySmall?.copyWith(color: AppPalette.textSecondary),
            ),
            const SizedBox(height: 12),
            if (loading)
              Row(
                key: const Key('admin_loading'),
                children: <Widget>[
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    AdminTexts.loading,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: AppPalette.textSecondary),
                  ),
                ],
              ),
            if (failed) ...<Widget>[
              _ErrorCard(onRetry: () => _retry(ref)),
              const SizedBox(height: 12),
            ],
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_tickets_total'),
                    label: AdminTexts.kpiTicketsTotal,
                    value: '${t.ticketsTotal}',
                    hint: AdminTexts.hintTicketsTotal,
                    footer: <Widget>[
                      KpiFooterItem('${AdminTexts.footerNew} ${t.newCount}'),
                      KpiFooterItem('${AdminTexts.footerInWork} ${t.inWorkCount}'),
                      KpiFooterItem('${AdminTexts.footerOverdue} ${t.overdueCount}'),
                    ],
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_on_time'),
                    label: AdminTexts.kpiOnTime,
                    value: formatPercent(t.onTimeRate),
                    tone: _rateTone(t.onTimeRate),
                    hint: AdminTexts.hintOnTime,
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_cycle'),
                    label: AdminTexts.kpiCycle,
                    value: formatMinutes(t.avgCycleMinutes),
                    hint: AdminTexts.hintCycle,
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_materials_cost'),
                    label: AdminTexts.kpiMaterialsCost,
                    value: formatMoney(c.cost30d),
                    unit: '₽',
                    hint: AdminTexts.hintMaterialsCost,
                    footer: <Widget>[
                      KpiFooterItem('${AdminTexts.footerOperations} ${c.operations30d}'),
                      KpiFooterItem('${AdminTexts.footerObjects} ${c.objectsCount}'),
                    ],
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_low_stock'),
                    label: AdminTexts.kpiLowStock,
                    value: '${c.lowStockCount}',
                    tone: c.lowStockCount > 0 ? KpiTone.warning : KpiTone.success,
                    hint: AdminTexts.hintLowStock,
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_attendance'),
                    label: AdminTexts.kpiAttendance,
                    value: formatPercent(s.attendanceRate),
                    tone: _rateTone(s.attendanceRate),
                    hint: AdminTexts.hintAttendance,
                    footer: <Widget>[
                      KpiFooterItem('${AdminTexts.footerShifts} ${s.shiftsTotal}'),
                      KpiFooterItem('${AdminTexts.footerMissed} ${s.missedCount}'),
                    ],
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_late'),
                    label: AdminTexts.kpiLate,
                    value: '${s.lateCount}',
                    tone: s.lateCount > 0 ? KpiTone.warning : KpiTone.success,
                    hint: AdminTexts.hintLate,
                  ),
                ),
                SizedBox(
                  width: 170,
                  child: AdminKpiCard(
                    key: const Key('admin_kpi_visits'),
                    label: AdminTexts.kpiVisits,
                    value: '${g.visitsCount}',
                    hint: AdminTexts.hintVisits,
                    footer: <Widget>[
                      KpiFooterItem('${AdminTexts.footerDwell} ${formatMinutes(g.dwellMinutes)}'),
                      KpiFooterItem('${AdminTexts.footerPoints} ${formatNumber(g.pointsCount)}'),
                    ],
                  ),
                ),
              ],
            ),
            if (!failed) ...<Widget>[
              const SizedBox(height: 16),
              MiniBarChartCard(
                key: const Key('admin_chart_tickets'),
                title: AdminTexts.chartTicketsTitle,
                hint: AdminTexts.chartTicketsHint,
                empty: ticketSeries.isEmpty,
                emptyText: AdminTexts.chartEmpty,
                legend: const <Widget>[
                  ChartLegendItem(color: AppPalette.primary, label: AdminTexts.seriesCreated),
                  ChartLegendItem(color: AppPalette.success, label: AdminTexts.seriesCompleted),
                ],
                child: MiniBarChart(
                  primary: ticketSeries
                      .map((TicketDailyPoint p) => p.createdCount.toDouble())
                      .toList(),
                  secondary: ticketSeries
                      .map((TicketDailyPoint p) => p.completedCount.toDouble())
                      .toList(),
                ),
              ),
              const SizedBox(height: 12),
              MiniBarChartCard(
                key: const Key('admin_chart_consumption'),
                title: AdminTexts.chartConsumptionTitle,
                hint: AdminTexts.chartConsumptionHint,
                empty: costSeries.isEmpty,
                emptyText: AdminTexts.chartEmpty,
                legend: const <Widget>[
                  ChartLegendItem(color: AppPalette.primary, label: '₽'),
                ],
                child: MiniBarChart(
                  primary: costSeries.map((ConsumptionSeriesPoint p) => p.cost).toList(),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Пороги тонов — как в web-admin: ≥90 успех, ≥70 внимание, иначе тревога.
  static KpiTone _rateTone(num? rate) {
    final double value = (rate ?? 100).toDouble();
    if (value >= 90) return KpiTone.success;
    if (value >= 70) return KpiTone.warning;
    return KpiTone.danger;
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('admin_error'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.danger),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            AdminTexts.errorTitle,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(color: AppPalette.dangerText, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          FilledButton(
            key: const Key('admin_retry'),
            onPressed: onRetry,
            child: const Text(AdminTexts.retry),
          ),
        ],
      ),
    );
  }
}
