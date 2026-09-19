import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../providers/route_providers.dart';
import '../widgets/route_plan_view.dart';

/// Маршрут дня `/route/:eventId` (М6.3): план этажа с точками по помещениям,
/// статусы, «Следующая точка» и «Пропустить».
/// Элементы и тексты — по `design/screens/mobile/route_map.md`.
class RouteMapPage extends ConsumerStatefulWidget {
  const RouteMapPage({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<RouteMapPage> createState() => _RouteMapPageState();
}

class _RouteMapPageState extends ConsumerState<RouteMapPage> {
  final TransformationController _transformation = TransformationController();

  @override
  void dispose() {
    _transformation.dispose();
    super.dispose();
  }

  RouteDayController get _controller => ref.read(routeDayProvider(widget.eventId).notifier);

  @override
  Widget build(BuildContext context) {
    final AsyncValue<RouteDay> dayAsync = ref.watch(routeDayProvider(widget.eventId));

    return Scaffold(
      key: const Key('route_map_page'),
      appBar: AppBar(
        title: Text(_title(dayAsync.valueOrNull)),
        actions: <Widget>[
          IconButton(
            key: const Key('route_sos_button'),
            tooltip: 'Аварийная заявка',
            icon: const Icon(Icons.warning_amber),
            onPressed: () => context.push(
              AppRoutes.sosFor(roomId: dayAsync.valueOrNull?.active?.point.roomId),
            ),
          ),
        ],
      ),
      body: dayAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object error, StackTrace stack) => _RouteError(
          failure: error is Failure ? error : const ServerFailure(),
          onRetry: () => ref.invalidate(routeDayProvider(widget.eventId)),
        ),
        data: (RouteDay day) => _RouteBody(
          day: day,
          transformation: _transformation,
          onPointTap: (RoutePointState point) => _openPointSheet(point),
          onSkip: (RoutePointState point) => _openSkipSheet(point),
          onNext: () => _openChecklist(day.nextPending),
          onReset: _controller.reset,
        ),
      ),
    );
  }

  String _title(RouteDay? day) {
    if (day == null) return 'Маршрут';
    final String? floorName = day.floor == null ? null : '${day.floor!.number} этаж';
    return floorName == null ? 'Маршрут' : 'Маршрут · $floorName';
  }

  /// Переход в чек-лист точки; ожидающих точек нет — идти некуда.
  void _openChecklist(RoutePointState? point) {
    if (point == null) return;
    context.push(
      AppRoutes.checklistFor(eventId: widget.eventId, roomId: point.point.roomId),
    );
  }

  /// Шторка точки: название, статус, время и переход в чек-лист.
  void _openPointSheet(RoutePointState point) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext sheetContext) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          key: const Key('route_point_sheet'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              point.point.title,
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              point.status.label,
              style: TextStyle(fontSize: AppTypography.sizeSM, color: point.status.color),
            ),
            if (point.point.estimatedTimeMin != null) ...<Widget>[
              const SizedBox(height: AppSpacing.xs),
              Text('~${point.point.estimatedTimeMin} мин'),
            ],
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              key: const Key('route_checklist_button'),
              onPressed: () {
                Navigator.of(sheetContext).pop();
                _openChecklist(point);
              },
              child: const Text('Открыть чек-лист'),
            ),
          ],
        ),
      ),
    );
  }

  /// Шторка пропуска: причина обязательна (не короче 3 символов).
  void _openSkipSheet(RoutePointState point) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext sheetContext) => _SkipSheet(
        onConfirm: (String reason) {
          Navigator.of(sheetContext).pop();
          _controller.skipRoom(point.point.roomId, reason);
        },
      ),
    );
  }
}

/// Тело экрана: план или список точек, прогресс и кнопки действия.
class _RouteBody extends StatelessWidget {
  const _RouteBody({
    required this.day,
    required this.transformation,
    required this.onPointTap,
    required this.onSkip,
    required this.onNext,
    required this.onReset,
  });

  final RouteDay day;
  final TransformationController transformation;
  final void Function(RoutePointState point) onPointTap;
  final void Function(RoutePointState point) onSkip;
  final VoidCallback onNext;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    if (day.route.id.isEmpty) {
      return const _RouteMessage(
        icon: Icons.alt_route_outlined,
        title: 'Маршрут не назначен',
        hint: 'Обратитесь к бригадиру',
      );
    }
    if (day.points.isEmpty) {
      return const _RouteMessage(
        icon: Icons.playlist_remove,
        title: 'Маршрут пуст',
        hint: 'Обратитесь к бригадиру',
      );
    }

    final RoutePointState? active = day.active;
    return Column(
      children: <Widget>[
        Expanded(
          child: day.hasPlan
              ? Stack(
                  children: <Widget>[
                    RoutePlanView(
                      day: day,
                      transformationController: transformation,
                      onPointTap: onPointTap,
                    ),
                    Positioned(
                      right: AppSpacing.md,
                      bottom: AppSpacing.md,
                      child: _PlanControls(
                        day: day,
                        transformation: transformation,
                        onReset: onReset,
                      ),
                    ),
                  ],
                )
              : _RoutePointsList(day: day, onPointTap: onPointTap, onSkip: onSkip),
        ),
        if (active != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xs),
            child: Text(
              'Текущая точка: ${active.point.orderIndex + 1} из ${day.total} · ${active.point.title}',
              key: const Key('route_current_point_text'),
              style: const TextStyle(fontSize: AppTypography.sizeSM),
            ),
          ),
        _RouteProgressBar(day: day),
        _RouteActions(day: day, onNext: onNext, onSkip: onSkip),
      ],
    );
  }
}

/// Зум, сброс и центрирование на текущей точке (кнопки для работы в перчатках).
class _PlanControls extends StatelessWidget {
  const _PlanControls({required this.day, required this.transformation, required this.onReset});

  final RouteDay day;
  final TransformationController transformation;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    void zoom(double factor) {
      final Matrix4 matrix = transformation.value.clone()..scaleByDouble(factor, factor, factor, 1.0);
      transformation.value = matrix;
    }

    return Column(
      children: <Widget>[
        _RoundButton(icon: Icons.add, tooltip: 'Приблизить', onPressed: () => zoom(1.25)),
        const SizedBox(height: AppSpacing.xs),
        _RoundButton(icon: Icons.remove, tooltip: 'Отдалить', onPressed: () => zoom(0.8)),
        const SizedBox(height: AppSpacing.xs),
        _RoundButton(
          key: const Key('route_zoom_reset'),
          icon: Icons.crop_free,
          tooltip: 'Сброс',
          onPressed: () {
            transformation.value = Matrix4.identity();
            onReset();
          },
        ),
        const SizedBox(height: AppSpacing.xs),
        _RoundButton(
          key: const Key('route_center_button'),
          icon: Icons.my_location,
          tooltip: 'К текущей',
          onPressed: () => _centerOnActive(context),
        ),
        const SizedBox(height: AppSpacing.xs),
        _RoundButton(
          key: const Key('route_legend_button'),
          icon: Icons.help_outline,
          tooltip: 'Легенда',
          onPressed: () => _showLegend(context),
        ),
      ],
    );
  }

  /// Центрирование на активной точке: сдвигаем матрицу так, чтобы маркер попал в кадр.
  void _centerOnActive(BuildContext context) {
    final RoutePointState? active = day.active;
    if (active == null || !active.point.hasCoords) return;
    final Size size = MediaQuery.of(context).size;
    final double dx = size.width / 2 - (active.point.coordsX ?? 0);
    final double dy = size.height / 3 - (active.point.coordsY ?? 0);
    transformation.value = Matrix4.identity()..translateByDouble(dx, dy, 0.0, 1.0);
  }

  void _showLegend(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext context) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          key: const Key('route_legend_sheet'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'Легенда',
              style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.md),
            for (final RoutePointStatus status in RoutePointStatus.values)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Row(
                  children: <Widget>[
                    Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(color: status.color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Text(status.label),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppPalette.surface,
      shape: const CircleBorder(),
      elevation: 2,
      child: IconButton(
        tooltip: tooltip,
        icon: Icon(icon),
        onPressed: onPressed,
      ),
    );
  }
}

/// Режим списка: план недоступен, но точки и статусы видны.
class _RoutePointsList extends StatelessWidget {
  const _RoutePointsList({required this.day, required this.onPointTap, required this.onSkip});

  final RouteDay day;
  final void Function(RoutePointState point) onPointTap;
  final void Function(RoutePointState point) onSkip;

  @override
  Widget build(BuildContext context) {
    return ListView(
      key: const Key('route_points_list'),
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: <Widget>[
        const Text(
          'План этажа недоступен',
          style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final RoutePointState point in day.points)
          Card(
            key: Key('route_point_tile_${point.point.id}'),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: point.status.color,
                child: Text(
                  '${point.point.orderIndex + 1}',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ),
              title: Text(point.point.title),
              subtitle: Text(point.status.label),
              trailing: point.status == RoutePointStatus.done
                  ? const Icon(Icons.check, color: AppPalette.success)
                  : IconButton(
                      tooltip: 'Пропустить',
                      icon: const Icon(Icons.block_outlined),
                      onPressed: () => onSkip(point),
                    ),
              onTap: () => onPointTap(point),
            ),
          ),
      ],
    );
  }
}

/// Прогресс маршрута: полоса и текст «Маршрут: {done} из {total} помещений».
class _RouteProgressBar extends StatelessWidget {
  const _RouteProgressBar({required this.day});

  final RouteDay day;

  @override
  Widget build(BuildContext context) {
    final double value = day.total == 0 ? 0 : day.done / day.total;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          LinearProgressIndicator(key: const Key('route_progress'), value: value),
          const SizedBox(height: AppSpacing.xs),
          Text(
            day.isFinished && day.done > 0
                ? 'Маршрут пройден'
                : 'Маршрут: ${day.done} из ${day.total} помещений',
            key: const Key('route_progress_text'),
            style: const TextStyle(fontSize: AppTypography.sizeSM),
          ),
        ],
      ),
    );
  }
}

/// Кнопки «Следующая точка ▸» и «Пропустить».
class _RouteActions extends StatelessWidget {
  const _RouteActions({required this.day, required this.onNext, required this.onSkip});

  final RouteDay day;
  final VoidCallback onNext;
  final void Function(RoutePointState point) onSkip;

  @override
  Widget build(BuildContext context) {
    final RoutePointState? next = day.nextPending;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: <Widget>[
            Expanded(
              child: FilledButton.icon(
                key: const Key('route_next_button'),
                onPressed: next == null ? null : onNext,
                icon: const Icon(Icons.arrow_forward),
                label: Text(next == null ? 'Маршрут пройден' : 'Следующая точка'),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: OutlinedButton(
                key: const Key('route_skip_button'),
                onPressed: next == null ? null : () => onSkip(next),
                child: const Text('Пропустить'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Шторка «Причина пропуска» с валидацией и подсказкой про бригадира.
class _SkipSheet extends StatefulWidget {
  const _SkipSheet({required this.onConfirm});

  final void Function(String reason) onConfirm;

  @override
  State<_SkipSheet> createState() => _SkipSheetState();
}

class _SkipSheetState extends State<_SkipSheet> {
  final TextEditingController _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final String reason = _controller.text.trim();
    if (reason.length < 3) {
      setState(() => _error = 'Укажите причину (не короче 3 символов)');
      return;
    }
    widget.onConfirm(reason);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.lg,
        right: AppSpacing.lg,
        top: AppSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
      ),
      child: Column(
        key: const Key('route_skip_sheet'),
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text(
            'Причина пропуска',
            style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            key: const Key('route_skip_reason_field'),
            controller: _controller,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Например: нет доступа, дверь закрыта',
              errorText: _error,
            ),
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
          ),
          const SizedBox(height: AppSpacing.sm),
          const Text(
            'Пропуск сохранится и уйдёт бригадиру',
            style: TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          FilledButton(
            key: const Key('route_skip_confirm_button'),
            onPressed: _submit,
            child: const Text('Пропустить точку'),
          ),
        ],
      ),
    );
  }
}

class _RouteError extends StatelessWidget {
  const _RouteError({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _RouteMessage(
      icon: Icons.cloud_off_outlined,
      title: 'Не удалось загрузить маршрут',
      hint: failure.message,
      action: OutlinedButton(
        key: const Key('route_error_retry'),
        onPressed: onRetry,
        child: const Text('Повторить'),
      ),
    );
  }
}

class _RouteMessage extends StatelessWidget {
  const _RouteMessage({
    required this.icon,
    required this.title,
    required this.hint,
    this.action,
  });

  final IconData icon;
  final String title;
  final String hint;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 56, color: AppPalette.textSecondary),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
            if (action != null) ...<Widget>[const SizedBox(height: AppSpacing.lg), action!],
          ],
        ),
      ),
    );
  }
}
