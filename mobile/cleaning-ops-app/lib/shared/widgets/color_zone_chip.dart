import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../core/domain/color_zone.dart';

/// Чип цветовой кодировки инвентаря: точка цвета зоны + подпись.
///
/// Цвета — фирменные цвета табличек (`ColorZone.color`), а не токены темы:
/// то, что оператор видит на экране, должно совпадать с табличкой на посту.
class ColorZoneChip extends StatelessWidget {
  const ColorZoneChip({
    super.key,
    required this.zone,
    required this.label,
    this.compact = false,
  });

  final ColorZone zone;
  final String label;

  /// Компактный вариант — для инвентаря внутри карточки операции.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final double dot = compact ? 7 : 9;
    return Semantics(
      label: zone.description,
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? AppSpacing.sm : AppSpacing.md,
          vertical: compact ? 2 : AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: zone.soft,
          border: Border.all(color: zone.color),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: dot,
              height: dot,
              decoration: BoxDecoration(
                color: zone.color,
                shape: BoxShape.circle,
                border: Border.all(color: zone.dark, width: 0.8),
              ),
            ),
            SizedBox(width: compact ? AppSpacing.xs : AppSpacing.sm),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: compact ? AppTypography.sizeXS : AppTypography.sizeSM,
                  fontWeight: FontWeight.w500,
                  color: zone.dark,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
