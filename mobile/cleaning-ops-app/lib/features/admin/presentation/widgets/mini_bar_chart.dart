import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// Компактный столбчатый график для доски действий: два ряда (основной +
/// фоновый) или один. Без сторонних библиотек — `CustomPainter` на весь
/// доступный размер; легенда и заголовок живут в [MiniBarChartCard].
class MiniBarChart extends StatelessWidget {
  const MiniBarChart({
    super.key,
    required this.primary,
    this.secondary,
    this.primaryColor,
    this.secondaryColor,
    this.height = 120,
  });

  /// Значения основного ряда (по дням).
  final List<double> primary;

  /// Второй ряд (например, «выполнено»); `null` — одиночные столбцы.
  final List<double>? secondary;
  final Color? primaryColor;
  final Color? secondaryColor;
  final double height;

  @override
  Widget build(BuildContext context) {
    final bool hasSecondary = secondary != null && secondary!.isNotEmpty;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _MiniBarPainter(
          primary: primary,
          secondary: hasSecondary ? secondary! : null,
          primaryColor: primaryColor ?? AppPalette.primary,
          secondaryColor: secondaryColor ?? AppPalette.success,
        ),
      ),
    );
  }
}

class _MiniBarPainter extends CustomPainter {
  const _MiniBarPainter({
    required this.primary,
    required this.secondary,
    required this.primaryColor,
    required this.secondaryColor,
  });

  final List<double> primary;
  final List<double>? secondary;
  final Color primaryColor;
  final Color secondaryColor;

  @override
  void paint(Canvas canvas, Size size) {
    final int slots = primary.length;
    if (slots == 0 || size.width <= 0 || size.height <= 0) return;

    double maxValue = 0;
    for (final double v in primary) {
      if (v > maxValue) maxValue = v;
    }
    for (final double v in secondary ?? const <double>[]) {
      if (v > maxValue) maxValue = v;
    }
    if (maxValue <= 0) maxValue = 1;

    final double slotWidth = size.width / slots;
    final bool paired = secondary != null && secondary!.length == slots;
    // Столбцы не уже 2px и не шире 60% слота; между парами — зазор.
    double barWidth = paired ? slotWidth * 0.32 : slotWidth * 0.55;
    if (barWidth < 2) barWidth = 2;
    final double maxBar = slotWidth * 0.6;
    if (barWidth > maxBar) barWidth = maxBar;

    final Paint primaryPaint = Paint()..color = primaryColor;
    final Paint secondaryPaint = Paint()..color = secondaryColor;

    for (int i = 0; i < slots; i++) {
      final double x0 = i * slotWidth;
      final double hPrimary = (primary[i] / maxValue) * size.height;
      if (paired) {
        final double startX = x0 + slotWidth / 2 - barWidth - 1;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(startX, size.height - hPrimary, barWidth, hPrimary),
            const Radius.circular(2),
          ),
          primaryPaint,
        );
        final double hSecondary = (secondary![i] / maxValue) * size.height;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(x0 + slotWidth / 2 + 1, size.height - hSecondary, barWidth, hSecondary),
            const Radius.circular(2),
          ),
          secondaryPaint,
        );
      } else {
        final double startX = x0 + (slotWidth - barWidth) / 2;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(startX, size.height - hPrimary, barWidth, hPrimary),
            const Radius.circular(2),
          ),
          primaryPaint,
        );
      }
    }

    // Базовая линия.
    final Paint axis = Paint()
      ..color = AppPalette.border
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, size.height), Offset(size.width, size.height), axis);
  }

  @override
  bool shouldRepaint(_MiniBarPainter oldDelegate) =>
      oldDelegate.primary != primary ||
      oldDelegate.secondary != secondary ||
      oldDelegate.primaryColor != primaryColor ||
      oldDelegate.secondaryColor != secondaryColor;
}

/// Карточка графика с заголовком, подсказкой и легендой — калька ChartCard из
/// web-admin (`ReportCharts.tsx`).
class MiniBarChartCard extends StatelessWidget {
  const MiniBarChartCard({
    super.key,
    required this.title,
    required this.hint,
    required this.child,
    this.legend = const <Widget>[],
    this.empty = false,
    this.emptyText = '',
  });

  final String title;
  final String hint;
  final Widget child;
  final List<Widget> legend;
  final bool empty;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  title,
                  key: const Key('chart_title'),
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600, color: AppPalette.textPrimary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            hint,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: AppPalette.textSecondary),
          ),
          const SizedBox(height: 10),
          if (empty)
            SizedBox(
              height: 120,
              child: Center(
                child: Text(
                  emptyText,
                  key: const Key('chart_empty'),
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: AppPalette.textSecondary),
                ),
              ),
            )
          else
            child,
          if (legend.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            Wrap(spacing: 12, runSpacing: 4, children: legend),
          ],
        ],
      ),
    );
  }
}

/// Точка легенды: цветной квадрат + подпись.
class ChartLegendItem extends StatelessWidget {
  const ChartLegendItem({super.key, required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppPalette.textSecondary),
        ),
      ],
    );
  }
}
