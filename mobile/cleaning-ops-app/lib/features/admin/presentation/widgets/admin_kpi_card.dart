import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// Оттенок значения KPI — те же пороги, что в web-admin `KpiCard.tsx`.
enum KpiTone { neutral, primary, success, warning, danger }

/// Карточка KPI доски действий: один компонент на все показатели (как в вебе),
/// чтобы кегль значения/подпись не разъезжались при первой же правке.
class AdminKpiCard extends StatelessWidget {
  const AdminKpiCard({
    super.key,
    required this.label,
    required this.value,
    this.unit,
    this.hint,
    this.tone = KpiTone.neutral,
    this.footer,
  });

  final String label;
  final String value;

  /// Единица измерения рядом со значением: `₽`, `%`.
  final String? unit;

  /// Источник показателя (read-модель сервиса) — обязателен по смыслу.
  final String? hint;
  final KpiTone tone;
  final List<Widget>? footer;

  Color get _toneColor => switch (tone) {
        KpiTone.primary => AppPalette.primary,
        KpiTone.success => AppPalette.successText,
        KpiTone.warning => AppPalette.warningText,
        KpiTone.danger => AppPalette.dangerText,
        KpiTone.neutral => AppPalette.textPrimary,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 150),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppPalette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppPalette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            label,
            key: const Key('kpi_label'),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppPalette.textSecondary),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Flexible(
                child: Text(
                  value,
                  key: const Key('kpi_value'),
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: _toneColor,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              if (unit != null) ...<Widget>[
                const SizedBox(width: 4),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    unit!,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: _toneColor, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ],
          ),
          if (footer != null && footer!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 6),
            Wrap(spacing: 10, runSpacing: 2, children: footer!),
          ],
          if (hint != null) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              hint!,
              key: const Key('kpi_hint'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: AppPalette.textMuted, fontSize: 10),
            ),
          ],
        ],
      ),
    );
  }
}

/// Мелкая подпись в футере карточки: `новых 3` и т.п.
class KpiFooterItem extends StatelessWidget {
  const KpiFooterItem(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppPalette.textSecondary),
    );
  }
}
