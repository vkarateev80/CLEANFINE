import 'dart:io';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../../../core/domain/color_zone.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../shared/widgets/color_zone_chip.dart';
import '../checklist_texts.dart';
import '../providers/checklist_providers.dart';

/// Строка операции техкарты (`design/screens/mobile/checklist.md` §3.2, §7).
///
/// Показывает номер, название, таймер, обязательность фото, действия и — для
/// заблокированной операции — подсказку, после какой операции она откроется.
class OperationTile extends StatefulWidget {
  const OperationTile({
    super.key,
    required this.state,
    required this.roomZone,
    required this.index,
    required this.locked,
    required this.lockedBy,
    required this.submittable,
    required this.now,
    required this.onStart,
    required this.onTakePhoto,
    required this.onComplete,
    required this.onOpenPhoto,
  });

  final ChecklistOperationState state;

  /// Цвет инвентаря помещения — им помечается оборудование операции
  /// (стёкла и зеркала — всегда жёлтым, см. `ColorZone.forOperation`).
  final ColorZone roomZone;

  /// Позиция в списке: по ней определяется блокировка (`isLocked`).
  final int index;

  /// Операция ждёт завершения предыдущей.
  final bool locked;

  /// Название предыдущей операции — для текста «Доступно после операции «…»».
  final String? lockedBy;

  /// Экран вообще может отправлять отметки (смена открыта и есть заявка).
  final bool submittable;

  final DateTime now;

  final VoidCallback onStart;
  final VoidCallback onTakePhoto;
  final VoidCallback onComplete;
  final VoidCallback onOpenPhoto;

  @override
  State<OperationTile> createState() => _OperationTileState();
}

class _OperationTileState extends State<OperationTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final ChecklistOperationState state = widget.state;
    final bool done = state.isCompleted;
    final bool locked = widget.locked;
    final bool canAct = widget.submittable && !locked && !done;

    final Color background = locked ? AppPalette.surfaceMuted : AppPalette.surface;
    final Color titleColor = locked
        ? AppPalette.textMuted
        : done
            ? AppPalette.textSecondary
            : AppPalette.textPrimary;

    return Card(
      key: Key('checklist_op_tile_${state.operation.id}'),
      color: background,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: BorderSide(
          color: state.isActive ? AppPalette.primary : AppPalette.border,
          width: state.isActive ? 2 : 1,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        onTap: () => setState(() => _expanded = !_expanded),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _NumberBadge(state: state, locked: locked),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          state.operation.name,
                          style: TextStyle(
                            fontSize: AppTypography.sizeBASE,
                            fontWeight: FontWeight.w500,
                            color: titleColor,
                            decoration: done ? TextDecoration.lineThrough : null,
                            decorationColor: AppPalette.textSecondary,
                          ),
                        ),
                        if (state.operation.description != null) ...<Widget>[
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            state.operation.description!,
                            maxLines: _expanded ? null : 2,
                            overflow: _expanded ? null : TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: AppTypography.sizeSM,
                              color: AppPalette.textSecondary,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (state.isCompleted && !state.isQueued)
                    Text(
                      state.status.label,
                      key: Key('checklist_op_state_${state.operation.id}'),
                      style: const TextStyle(
                        fontSize: AppTypography.sizeXS,
                        color: AppPalette.successText,
                      ),
                    )
                  else if (locked)
                    Icon(
                      Icons.lock_outline,
                      key: Key('checklist_op_locked_${state.operation.id}'),
                      color: AppPalette.textMuted,
                    ),
                ],
              ),
              if (state.startedAtLocal != null) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                _TimerRow(state: state, now: widget.now),
              ],
              if (state.operation.requiresPhoto)
                Padding(
                  key: Key('checklist_op_photo_hint_${state.operation.id}'),
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: const Text(
                    ChecklistTexts.photoRequired,
                    style: TextStyle(
                      fontSize: AppTypography.sizeXS,
                      color: AppPalette.dangerText,
                    ),
                  ),
                ),
              if (state.operation.requiresQr)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(
                    ChecklistTexts.qrRequired,
                    style: TextStyle(
                      fontSize: AppTypography.sizeXS,
                      color: AppPalette.textSecondary,
                    ),
                  ),
                ),
              if (state.photo != null && state.photoUrl == null)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: GestureDetector(
                    key: Key('checklist_op_photo_thumb_${state.operation.id}'),
                    onTap: widget.onOpenPhoto,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      child: Image.file(
                        File(state.photo!.path),
                        width: 56,
                        height: 56,
                        fit: BoxFit.cover,
                        errorBuilder: (BuildContext context, Object error, StackTrace? stack) =>
                            _PhotoPlaceholder(
                          key: Key('checklist_op_photo_stub_${state.operation.id}'),
                        ),
                      ),
                    ),
                  ),
                ),
              if (state.isQueued) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: <Widget>[
                    const Icon(Icons.cloud_upload_outlined, size: 16, color: AppPalette.warning),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      ChecklistTexts.sending,
                      key: Key('checklist_op_queued_${state.operation.id}'),
                      style: const TextStyle(
                        fontSize: AppTypography.sizeXS,
                        color: AppPalette.warningText,
                      ),
                    ),
                  ],
                ),
              ],
              if (locked && widget.lockedBy != null) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  ChecklistTexts.lockedAfter(widget.lockedBy!),
                  style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted),
                ),
              ],
              if (_expanded) _Details(state: state, roomZone: widget.roomZone),
              // Заблокированная операция показывает те же кнопки, но неактивными
              // (`onPressed == null`) — так требование «следующая недоступна»
              // проверяется и скринридером, и тестом.
              if (!done) ...<Widget>[
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: OutlinedButton.icon(
                        key: Key('checklist_op_photo_button_${state.operation.id}'),
                        onPressed: canAct ? widget.onTakePhoto : null,
                        icon: const Icon(Icons.camera_alt, size: 18),
                        label: Text(
                          state.hasPhoto ? ChecklistTexts.retakePhoto : ChecklistTexts.takePhoto,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: SizedBox(
                        height: 48,
                        child: FilledButton(
                          key: Key('checklist_op_complete_button_${state.operation.id}'),
                          onPressed: canAct ? widget.onComplete : null,
                          child: const Text(ChecklistTexts.complete),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (canAct && state.startedAtLocal == null) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    key: Key('checklist_op_start_button_${state.operation.id}'),
                    onPressed: widget.onStart,
                    child: const Text(ChecklistTexts.start),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Кружок с номером операции: выполнено — галочка, активно — цвет primary.
class _NumberBadge extends StatelessWidget {
  const _NumberBadge({required this.state, required this.locked});

  final ChecklistOperationState state;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final bool done = state.isCompleted;
    final Color background = locked
        ? AppPalette.border
        : done
            ? AppPalette.success
            : state.isActive
                ? AppPalette.primary
                : AppPalette.border;
    final Color foreground = locked ? AppPalette.textMuted : Colors.white;

    return Semantics(
      container: true,
      label: '${state.number}. ${state.operation.name}, ${state.status.label}',
      child: ExcludeSemantics(
        child: Container(
          key: Key('checklist_op_status_${state.operation.id}'),
          width: 24,
          height: 24,
          decoration: BoxDecoration(color: background, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: done
              ? Icon(Icons.check, size: 16, color: foreground)
              : Text(
                  '${state.number}',
                  style: TextStyle(
                    fontSize: AppTypography.sizeXS,
                    fontWeight: FontWeight.w600,
                    color: foreground,
                  ),
                ),
        ),
      ),
    );
  }
}

/// Таймер операции: «02:14 · норма 2 мин», сверх нормы — предупреждение.
class _TimerRow extends StatelessWidget {
  const _TimerRow({required this.state, required this.now});

  final ChecklistOperationState state;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final Duration elapsed = state.elapsed(now) ?? Duration.zero;
    final Duration? overNorm = state.overtime(now);
    final Duration overtime = overNorm ?? Duration.zero;
    final bool over = overNorm != null;

    return Row(
      children: <Widget>[
        Text(
          '⏱ ${Formatters.duration(elapsed)}',
          key: Key('checklist_op_timer_${state.operation.id}'),
          style: TextStyle(
            fontSize: AppTypography.sizeSM,
            fontFamily: AppTypography.fontMono,
            color: over ? AppPalette.warningText : AppPalette.textStrong,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          over
              ? ChecklistTexts.overNorm(Formatters.duration(overtime))
              : ChecklistTexts.norm(state.operation.estimatedTimeMin),
          style: TextStyle(
            fontSize: AppTypography.sizeXS,
            color: over ? AppPalette.warningText : AppPalette.textSecondary,
          ),
        ),
      ],
    );
  }
}

/// Раскрытая часть: оборудование и материалы (остатки не показываем — их нет в контракте).
class _Details extends StatelessWidget {
  const _Details({required this.state, required this.roomZone});

  final ChecklistOperationState state;
  final ColorZone roomZone;

  @override
  Widget build(BuildContext context) {
    final List<String> equipment = state.operation.equipmentLines;
    final ColorZone zone = ColorZone.forOperation(state.operation.name, roomZone);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (equipment.isNotEmpty) ...<Widget>[
          const SizedBox(height: AppSpacing.sm),
          // Инвентарь операции — в цвете зоны: оператор берёт с поста
          // инвентарь ровно этого цвета.
          Wrap(
            key: Key('checklist_op_equipment_${state.operation.id}'),
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: <Widget>[
              for (final String item in equipment) ColorZoneChip(zone: zone, label: item, compact: true),
            ],
          ),
          if (zone != roomZone) ...<Widget>[
            const SizedBox(height: AppSpacing.xs),
            Text(
              ChecklistTexts.glassInventory,
              key: Key('checklist_op_glass_${state.operation.id}'),
              style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
            ),
          ],
        ],
        if (state.operation.hasMaterials) ...<Widget>[
          const SizedBox(height: AppSpacing.sm),
          Text(
            ChecklistTexts.materials(state.operation.materials.length),
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
          ),
        ],
      ],
    );
  }
}

/// Заглушка вместо фото, если файл уже удалён (например, после перезапуска).
class _PhotoPlaceholder extends StatelessWidget {
  const _PhotoPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      color: AppPalette.surfaceMuted,
      alignment: Alignment.center,
      child: const Icon(Icons.image_not_supported_outlined, size: 18, color: AppPalette.textMuted),
    );
  }
}
