import 'dart:io';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../checklist_texts.dart';
import '../providers/checklist_providers.dart';
import '../../../../core/i18n/app_language.dart';

/// Шторка фото операции (`design/screens/mobile/checklist.md` §2, §3.4).
///
/// Показывает снимок и время, предлагает «Переснять» или «Завершить операцию».
/// Водяной знак рисует сервер при загрузке — приложение его не дублирует.
class PhotoPreviewSheet extends ConsumerWidget {
  const PhotoPreviewSheet({
    super.key,
    required this.args,
    required this.operationId,
    required this.now,
    required this.onRetake,
    required this.onComplete,
  });

  final ChecklistArgs args;
  final String operationId;
  final DateTime now;
  final VoidCallback onRetake;
  final VoidCallback onComplete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ChecklistState? state = ref.watch(checklistProvider(args)).valueOrNull;
    final ChecklistOperationState? operation = _operation(state);
    if (state == null || operation == null || operation.photo == null) {
      return const SizedBox.shrink();
    }

    final Duration elapsed = operation.elapsed(now) ?? Duration.zero;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            ChecklistTexts.photoSheetTitle(circledNumber(operation.number)),
            style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Image.file(
              File(operation.photo!.path),
              key: const Key('checklist_photo_preview'),
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (BuildContext context, Object error, StackTrace? stack) => Container(
                height: 160,
                color: AppPalette.surfaceMuted,
                alignment: Alignment.center,
                child: Text(
                  tr('Снимок недоступен'),
                  style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textMuted),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${Formatters.duration(elapsed)} · ${state.room.name} · ${ChecklistTexts.watermarkHint}',
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  key: const Key('checklist_retake_photo_button'),
                  onPressed: onRetake,
                  child: Text(ChecklistTexts.retakePhoto),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: FilledButton(
                  key: const Key('checklist_complete_with_photo_button'),
                  onPressed: onComplete,
                  child: Text(ChecklistTexts.completeOperation),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  ChecklistOperationState? _operation(ChecklistState? state) {
    if (state == null) return null;
    for (final ChecklistOperationState op in state.operations) {
      if (op.operation.id == operationId) return op;
    }
    return null;
  }
}

/// «②» — номер операции в круге для заголовка шторки.
String circledNumber(int number) {
  const List<String> circled = <String>['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  if (number >= 1 && number <= circled.length) return circled[number - 1];
  return '$number';
}
