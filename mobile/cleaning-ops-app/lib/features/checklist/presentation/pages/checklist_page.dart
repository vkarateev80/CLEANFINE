import 'dart:async';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/clock.dart';
import '../../../../router/app_router.dart';
import '../../../../shared/services/photo_service.dart';
import '../../../route_map/presentation/providers/route_providers.dart';
import '../checklist_texts.dart';
import '../providers/checklist_providers.dart';
import '../widgets/operation_tile.dart';
import '../widgets/photo_preview_sheet.dart';

/// Чек-лист помещения `/route/:eventId/room/:roomId` (М6.4).
///
/// Операции техкарты строго по порядку, таймер по каждой, обязательное фото с
/// загрузкой в file-service и «Завершить помещение» с отметкой точки маршрута.
/// Элементы, тексты и `Key` — по `design/screens/mobile/checklist.md`.
class ChecklistPage extends ConsumerStatefulWidget {
  const ChecklistPage({super.key, required this.eventId, required this.roomId});

  /// id смены (`ScheduleEvent`).
  final String eventId;

  /// id помещения (core `Room`).
  final String roomId;

  @override
  ConsumerState<ChecklistPage> createState() => _ChecklistPageState();
}

class _ChecklistPageState extends ConsumerState<ChecklistPage> with WidgetsBindingObserver {
  Timer? _ticker;
  late DateTime _now;

  ChecklistArgs get _args => ChecklistArgs(eventId: widget.eventId, roomId: widget.roomId);

  ChecklistController get _controller => ref.read(checklistProvider(_args).notifier);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _now = ref.read(nowProvider)();
    _startTicker();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // В фоне тикать незачем: значение считается по wall-clock при возврате.
    if (state == AppLifecycleState.resumed) {
      _startTicker();
      _tick();
    } else {
      _stopTicker();
    }
  }

  void _startTicker() => _ticker ??= Timer.periodic(const Duration(seconds: 1), (_) => _tick());

  void _stopTicker() {
    _ticker?.cancel();
    _ticker = null;
  }

  void _tick() {
    if (!mounted) return;
    setState(() => _now = ref.read(nowProvider)());
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ChecklistState> async = ref.watch(checklistProvider(_args));
    final ChecklistState? state = async.valueOrNull;

    return Scaffold(
      key: const Key('checklist_page'),
      appBar: AppBar(
        title: Text(_title(state)),
        actions: <Widget>[
          _SyncStatusButton(count: state?.pendingCount ?? 0),
          IconButton(
            key: const Key('checklist_sos_button'),
            tooltip: 'Аварийная заявка',
            icon: const Icon(Icons.warning_amber),
            onPressed: () => context.push(AppRoutes.sos),
          ),
        ],
      ),
      body: async.when(
        loading: () => const _ChecklistSkeleton(),
        error: (Object error, StackTrace stack) => _LoadError(
          failure: error is Failure ? error : const ServerFailure(),
          onRetry: () => ref.invalidate(checklistProvider(_args)),
        ),
        data: _body,
      ),
    );
  }

  String _title(ChecklistState? state) {
    if (state == null) return 'Чек-лист';
    final int? floor = state.floor?.number;
    return floor == null ? state.room.name : ChecklistTexts.title(state.room.name, floor);
  }

  Widget _body(ChecklistState state) {
    final bool noTechCard = state.room.techCardId == null;
    return Column(
      children: <Widget>[
        _ProgressHeader(args: _args, state: state),
        if (!state.shiftOpen)
          const _Banner(
            bannerKey: Key('checklist_shift_banner'),
            text: ChecklistTexts.shiftNotOpen,
            color: AppPalette.warningText,
            icon: Icons.lock_clock,
          ),
        if (state.shiftOpen && state.ticketId == null)
          const _Banner(
            bannerKey: Key('checklist_ticket_banner'),
            text: ChecklistTexts.noTicket,
            color: AppPalette.dangerText,
            icon: Icons.report_gmailerrorred_outlined,
          ),
        if (state.pendingCount > 0)
          _Banner(
            bannerKey: const Key('checklist_offline_banner'),
            text: ChecklistTexts.offline,
            color: AppPalette.warningText,
            icon: Icons.cloud_off_outlined,
            onTap: () => context.push(AppRoutes.offline),
          ),
        if (state.errorBanner != null)
          _Banner(
            bannerKey: const Key('checklist_action_error'),
            text: state.errorBanner!,
            color: AppPalette.dangerText,
            icon: Icons.error_outline,
            onTap: _controller.retryFailed,
          ),
        Expanded(child: _content(state)),
        if (!noTechCard) _roomCompleteButton(state),
      ],
    );
  }

  Widget _content(ChecklistState state) {
    if (state.room.techCardId == null) {
      return _EmptyState(
        icon: Icons.assignment_late_outlined,
        title: ChecklistTexts.noTechCard,
        action: FilledButton(
          key: const Key('checklist_no_techcard_complete_button'),
          onPressed: _completeRoom,
          child: const Text(ChecklistTexts.countRoomDone),
        ),
      );
    }
    if (state.operations.isEmpty) {
      return const _EmptyState(
        icon: Icons.playlist_remove,
        title: ChecklistTexts.noOperations,
        hint: ChecklistTexts.askSupervisor,
      );
    }

    return ListView.builder(
      key: const Key('checklist_operations_list'),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      itemCount: state.operations.length,
      itemBuilder: (BuildContext context, int index) {
        final ChecklistOperationState operation = state.operations[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          child: OperationTile(
            state: operation,
            index: index,
            locked: state.isLocked(index),
            lockedBy: index == 0 ? null : state.operations[index - 1].operation.name,
            submittable: state.canSubmit,
            now: _now,
            onStart: () => _controller.startOperation(operation.operation.id),
            onTakePhoto: () => _takePhoto(operation.operation.id),
            onComplete: () => _complete(operation.operation.id),
            onOpenPhoto: () => _openPhotoSheet(operation.operation.id),
          ),
        );
      },
    );
  }

  Widget _roomCompleteButton(ChecklistState state) {
    final int left = state.remaining;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (state.allCompleted) ...<Widget>[
              const Text(
                ChecklistTexts.allOperationsDone,
                key: Key('checklist_all_done_text'),
                style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.successText),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                key: const Key('checklist_room_complete_button'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppPalette.successText,
                  disabledBackgroundColor: AppPalette.border,
                  disabledForegroundColor: AppPalette.textMuted,
                ),
                onPressed: left == 0 && state.canSubmit ? _completeRoom : null,
                child: Text(
                  left == 0 ? ChecklistTexts.completeRoom : ChecklistTexts.completeRoomWithLeft(left),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Съёмка фото операции: камера → проверка размера → шторка превью.
  Future<void> _takePhoto(String operationId) async {
    final PhotoCaptureService photos = ref.read(photoCaptureServiceProvider);
    CapturedPhoto? shot;
    try {
      shot = await photos.capture(operationId: operationId);
    } on Object {
      if (mounted) _snack(ChecklistTexts.cameraFailed);
      return;
    }
    if (!mounted || shot == null) return;

    if (!shot.isLargeEnough) {
      await photos.delete(shot.path);
      if (!mounted) return;
      _snack(ChecklistTexts.photoTooSmall);
      return;
    }

    _controller.attachPhoto(operationId, shot);
    if (!mounted) return;
    _openPhotoSheet(operationId);
  }

  /// Переснять: локальный файл удаляется, камера открывается заново.
  Future<void> _retake(String operationId) async {
    await _controller.retakePhoto(operationId);
    if (!mounted) return;
    await _takePhoto(operationId);
  }

  void _openPhotoSheet(String operationId) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext sheetContext) => PhotoPreviewSheet(
        args: _args,
        operationId: operationId,
        now: _now,
        onRetake: () {
          Navigator.of(sheetContext).pop();
          unawaited(_retake(operationId));
        },
        onComplete: () {
          Navigator.of(sheetContext).pop();
          unawaited(_complete(operationId));
        },
      ),
    );
  }

  Future<void> _complete(String operationId) async {
    final String? message = await _controller.completeOperation(operationId);
    if (!mounted) return;
    if (message != null) {
      _snack(message);
      return;
    }
    final ChecklistState? state = ref.read(checklistProvider(_args)).valueOrNull;
    if (state == null) return;
    for (final ChecklistOperationState op in state.operations) {
      if (op.operation.id == operationId && op.isQueued) {
        _snack(ChecklistTexts.offline);
        return;
      }
    }
  }

  Future<void> _completeRoom() async {
    final bool done = await _controller.completeRoom();
    if (!mounted || !done) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(ChecklistTexts.roomCompleted)),
    );
    // Возврат на маршрут: чек-лист всегда открыт поверх `/route/:eventId`.
    // `maybeOf`, а не `of`: экран должен собираться и без GoRouter (widget-тесты).
    final GoRouter? router = GoRouter.maybeOf(context);
    if (router != null && router.canPop()) context.pop();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

/// Прогресс маршрута и сводка техкарты.
class _ProgressHeader extends ConsumerWidget {
  const _ProgressHeader({required this.args, required this.state});

  final ChecklistArgs args;
  final ChecklistState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Прогресс маршрута живёт в приложении (сервер его не хранит) — см. route_map.
    final RouteDay? day = ref.watch(routeDayProvider(args.eventId)).valueOrNull;
    final int done = day?.done ?? 0;
    final int total = day?.total ?? 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (day != null) ...<Widget>[
            LinearProgressIndicator(
              key: const Key('checklist_progress_bar'),
              value: total == 0 ? 0 : done / total,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              ChecklistTexts.routeProgress(done, total),
              key: const Key('checklist_progress_text'),
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (state.techCard != null)
            Text(
              ChecklistTexts.techCardSummary(
                state.techCard!.name,
                state.operations.length,
                state.techCard!.totalEstimatedTimeMin,
              ),
              key: const Key('checklist_techcard_summary'),
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
        ],
      ),
    );
  }
}

/// Счётчик очереди в шапке: сколько действий ждёт отправки.
class _SyncStatusButton extends StatelessWidget {
  const _SyncStatusButton({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      key: const Key('checklist_sync_status'),
      onPressed: () => context.push(AppRoutes.offline),
      icon: Icon(count > 0 ? Icons.bolt : Icons.bolt_outlined, size: 18),
      label: Text('$count'),
    );
  }
}

/// Цветной баннер состояния экрана.
class _Banner extends StatelessWidget {
  const _Banner({
    required this.bannerKey,
    required this.text,
    required this.color,
    required this.icon,
    this.onTap,
  });

  final Key bannerKey;
  final String text;
  final Color color;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: bannerKey,
      onTap: onTap,
      child: Container(
        width: double.infinity,
        color: color.withOpacity(0.08),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
        child: Row(
          children: <Widget>[
            Icon(icon, size: 18, color: color),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(text, style: TextStyle(fontSize: AppTypography.sizeSM, color: color)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Пустое состояние: техкарты нет или в ней нет операций.
class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.title, this.hint, this.action});

  final IconData icon;
  final String title;
  final String? hint;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 56, color: AppPalette.textMuted),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            if (hint != null) ...<Widget>[
              const SizedBox(height: AppSpacing.sm),
              Text(
                hint!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
              ),
            ],
            if (action != null) ...<Widget>[const SizedBox(height: AppSpacing.lg), action!],
          ],
        ),
      ),
    );
  }
}

/// Скелетон загрузки: спиннер и три строки операций.
class _ChecklistSkeleton extends StatelessWidget {
  const _ChecklistSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        const Padding(
          padding: EdgeInsets.all(AppSpacing.lg),
          child: Center(child: CircularProgressIndicator()),
        ),
        for (int i = 0; i < 3; i++)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
            child: Container(
              height: 72,
              decoration: BoxDecoration(
                color: AppPalette.border,
                borderRadius: BorderRadius.circular(AppRadius.lg),
              ),
            ),
          ),
      ],
    );
  }
}

/// Ошибка загрузки чек-листа.
class _LoadError extends StatelessWidget {
  const _LoadError({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _EmptyState(
      icon: Icons.cloud_off_outlined,
      title: ChecklistTexts.loadFailed,
      hint: failure.message,
      action: OutlinedButton(
        key: const Key('checklist_error_retry'),
        onPressed: onRetry,
        child: const Text(ChecklistTexts.retry),
      ),
    );
  }
}
