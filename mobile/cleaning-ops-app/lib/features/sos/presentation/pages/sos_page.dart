import 'dart:io';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/labels.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../../../../shared/services/photo_service.dart';
import '../../domain/emergency_category.dart';
import '../providers/sos_providers.dart';
import '../sos_texts.dart';

/// Аварийная заявка `/sos` (М6.5): тип, обязательное фото, описание, координаты
/// и кнопка «🚨 ОТПРАВИТЬ SOS». Элементы, тексты и `Key` — по
/// `design/screens/mobile/sos.md`.
class SosPage extends ConsumerStatefulWidget {
  const SosPage({super.key, this.roomId});

  /// Помещение, из которого открыли экран (точка маршрута или чек-лист).
  final String? roomId;

  @override
  ConsumerState<SosPage> createState() => _SosPageState();
}

class _SosPageState extends ConsumerState<SosPage> {
  final TextEditingController _description = TextEditingController();

  /// Координаты запрашиваются один раз, как только контекст экрана загружен.
  bool _locationRequested = false;

  SosController get _controller => ref.read(sosProvider(widget.roomId).notifier);

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  /// Координаты определяются при открытии, но форма доступна сразу.
  void _ensureLocationRequested() {
    if (_locationRequested) return;
    _locationRequested = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _controller.refreshLocation();
    });
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<SosState> async = ref.watch(sosProvider(widget.roomId));
    final SosState? state = async.valueOrNull;
    final bool filled = state?.isFilled ?? false;
    final bool sent = state?.isSent ?? false;

    return PopScope(
      // Заполненную форму не теряем молча: «назад» спрашивает подтверждение.
      canPop: !filled || sent,
      onPopInvokedWithResult: (bool didPop, Object? result) async {
        if (didPop || sent) return;
        final bool leave = await _confirmCancel();
        if (!leave || !context.mounted) return;
        Navigator.of(context).pop();
      },
      child: Scaffold(
        key: const Key('sos_page'),
        appBar: AppBar(
          backgroundColor: AppPalette.danger,
          foregroundColor: Colors.white,
          title: const Text(SosTexts.title),
        ),
        backgroundColor: AppPalette.background,
        body: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (Object error, StackTrace stack) => _LoadError(
            failure: error is Failure ? error : const ServerFailure(),
            onRetry: () => ref.invalidate(sosProvider(widget.roomId)),
          ),
          data: (SosState value) {
            if (value.isSent) return _SuccessView(state: value);
            if (!value.hasObject) {
              return _EmptyObject(onBack: () => Navigator.of(context).pop());
            }
            // Координаты нужны только форме: без объекта отправлять нечего.
            _ensureLocationRequested();
            return _form(value);
          },
        ),
      ),
    );
  }

  Widget _form(SosState state) {
    final bool locked = state.submitting;
    return Column(
      children: <Widget>[
        if (state.pendingCount > 0)
          _Banner(
            bannerKey: const Key('sos_offline_banner'),
            text: SosTexts.offlineBanner,
            color: AppPalette.warningText,
            icon: Icons.cloud_off_outlined,
            onTap: () => context.push(AppRoutes.offline),
          ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: <Widget>[
              DropdownButtonFormField<EmergencyCategory>(
                key: const Key('sos_type_dropdown'),
                initialValue: state.category,
                decoration: InputDecoration(
                  labelText: SosTexts.typeLabel,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                  ),
                ),
                items: <DropdownMenuItem<EmergencyCategory>>[
                  for (final EmergencyCategory category in EmergencyCategory.values)
                    DropdownMenuItem<EmergencyCategory>(
                      value: category,
                      child: Text(category.label),
                    ),
                ],
                onChanged: locked ? null : _controller.selectCategory,
              ),
              const SizedBox(height: AppSpacing.lg),
              _photoBlock(state, locked),
              const SizedBox(height: AppSpacing.lg),
              TextFormField(
                key: const Key('sos_description_field'),
                controller: _description,
                enabled: !locked,
                maxLines: 4,
                maxLength: 2000,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  labelText: SosTexts.descriptionLabel,
                  hintText: SosTexts.descriptionHint,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                  ),
                ),
                onChanged: _controller.setDescription,
                // Счётчик символов нужен только у предела (DS-002 §3.3).
                buildCounter: (
                  BuildContext context, {
                  required int currentLength,
                  required bool isFocused,
                  required int? maxLength,
                }) =>
                    currentLength < 1800
                        ? null
                        : Text('$currentLength / ${maxLength ?? 2000}'),
              ),
              const SizedBox(height: AppSpacing.sm),
              _locationBlock(state),
              const SizedBox(height: AppSpacing.md),
              Text(
                state.formError ?? SosTexts.formHint,
                key: const Key('sos_error_text'),
                style: TextStyle(
                  fontSize: AppTypography.sizeSM,
                  color: state.formError == null ? AppPalette.textSecondary : AppPalette.dangerText,
                ),
              ),
              if (state.sendError != null) ...<Widget>[
                const SizedBox(height: AppSpacing.sm),
                _ErrorBanner(text: state.sendError!, onRetry: _submit),
              ],
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: SizedBox(
              width: double.infinity,
              height: 56,
              child: FilledButton(
                key: const Key('sos_submit_button'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppPalette.danger,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                  ),
                ),
                onPressed: locked ? null : _submit,
                child: locked
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Text(
                        SosTexts.submit,
                        style: TextStyle(
                          fontSize: AppTypography.sizeLG,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// Фото: до съёмки — кнопка с подписью «обязательно», после — превью и «Переснять».
  Widget _photoBlock(SosState state, bool locked) {
    final CapturedPhoto? photo = state.photo;
    if (photo == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text(
            SosTexts.photoLabel,
            style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: <Widget>[
              OutlinedButton.icon(
                key: const Key('sos_photo_button'),
                onPressed: locked ? null : _takePhoto,
                icon: const Icon(Icons.camera_alt),
                label: const Text(SosTexts.takePhoto),
              ),
              const SizedBox(width: AppSpacing.md),
              const Text(
                SosTexts.required,
                style: TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.dangerText),
              ),
            ],
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Image.file(
            File(photo.path),
            key: const Key('sos_photo_preview'),
            width: double.infinity,
            fit: BoxFit.cover,
            errorBuilder: (BuildContext context, Object error, StackTrace? stack) => Container(
              height: 160,
              color: AppPalette.surfaceMuted,
              alignment: Alignment.center,
              child: const Text(
                'Снимок недоступен',
                style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textMuted),
              ),
            ),
          ),
        ),
        TextButton(
          key: const Key('sos_retake_photo_button'),
          onPressed: locked ? null : _retake,
          child: const Text(SosTexts.retakePhoto),
        ),
      ],
    );
  }

  /// Локация: ожидание, ошибка с повтором или координаты с местом из маршрута.
  Widget _locationBlock(SosState state) {
    if (state.locating) {
      return const Row(
        key: Key('sos_location_pending'),
        children: <Widget>[
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: AppSpacing.sm),
          Text(
            SosTexts.locating,
            style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
          ),
        ],
      );
    }

    if (state.locationError != null) {
      return Column(
        key: const Key('sos_location_error'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            state.locationError!,
            style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
          ),
          TextButton(
            key: const Key('sos_location_retry_button'),
            onPressed: _controller.refreshLocation,
            child: const Text(SosTexts.retry),
          ),
        ],
      );
    }

    final String coordinates = state.point == null
        ? '—'
        : '${state.point!.lat.toStringAsFixed(6)}, ${state.point!.lng.toStringAsFixed(6)}';
    final String subtitle = state.roomLabel == null ? coordinates : '$coordinates · ${state.roomLabel}';

    return Card(
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: ListTile(
        key: const Key('sos_location_text'),
        leading: const Icon(Icons.location_on, color: AppPalette.primary),
        title: const Text(SosTexts.locationLabel),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontFamily: AppTypography.fontMono, fontSize: AppTypography.sizeSM),
        ),
        onTap: _controller.refreshLocation,
      ),
    );
  }

  /// Камера: проверка размера снимка до отправки (лимит file-service).
  Future<void> _takePhoto() async {
    final PhotoCaptureService photos = ref.read(photoCaptureServiceProvider);
    CapturedPhoto? shot;
    try {
      shot = await photos.capture(operationId: 'sos');
    } on Object {
      if (mounted) _snack(SosTexts.cameraDenied);
      return;
    }
    if (!mounted || shot == null) return;
    if (!shot.isLargeEnough) {
      await photos.delete(shot.path);
      if (mounted) _snack(SosTexts.photoTooSmall);
      return;
    }
    _controller.attachPhoto(shot);
  }

  Future<void> _retake() async {
    await _controller.retakePhoto();
    if (mounted) await _takePhoto();
  }

  /// Отправка по кнопке: текст ошибки валидации показываем snackbar'ом (DS-002 §3.5).
  Future<void> _submit() async {
    final String? message = await _controller.submit();
    if (!mounted || message == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<bool> _confirmCancel() async {
    final bool? leave = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text(SosTexts.cancelTitle),
        content: const Text(SosTexts.cancelBody),
        actions: <Widget>[
          TextButton(
            key: const Key('sos_cancel_continue_button'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text(SosTexts.continueFilling),
          ),
          FilledButton(
            key: const Key('sos_cancel_confirm_button'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text(SosTexts.cancel),
          ),
        ],
      ),
    );
    return leave ?? false;
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

/// Экран успеха: заявка создана (или сохранена в очередь).
class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.state});

  final SosState state;

  @override
  Widget build(BuildContext context) {
    final bool queued = state.queued && state.ticket == null;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          key: const Key('sos_success_view'),
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.check_circle, size: 48, color: AppPalette.success),
            const SizedBox(height: AppSpacing.md),
            Text(
              queued ? SosTexts.queued : SosTexts.sent,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: AppTypography.sizeXL,
                fontWeight: FontWeight.w600,
                color: AppPalette.successText,
              ),
            ),
            if (state.ticket != null) ...<Widget>[
              const SizedBox(height: AppSpacing.sm),
              Text(
                SosTexts.priorityAndStatus(
                  TicketLabels.priority(state.ticket!.priority),
                  TicketLabels.status(state.ticket!.status),
                ),
                style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                SosTexts.notified(state.ticket!.notifiedCount),
                key: const Key('sos_nearby_operators_text'),
                style: const TextStyle(fontSize: AppTypography.sizeSM),
              ),
            ],
            if (state.photoNotAttached) ...<Widget>[
              const SizedBox(height: AppSpacing.sm),
              const Text(
                SosTexts.photoNotAttached,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.warningText),
              ),
            ],
            const SizedBox(height: AppSpacing.xl),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                key: const Key('sos_success_close_button'),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text(SosTexts.close),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Нет активной смены с объектом: отправлять SOS некуда.
class _EmptyObject extends StatelessWidget {
  const _EmptyObject({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.location_off_outlined, size: 56, color: AppPalette.textMuted),
            const SizedBox(height: AppSpacing.md),
            const Text(
              SosTexts.noObject,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(
              key: const Key('sos_no_object_back_button'),
              onPressed: onBack,
              child: const Text(SosTexts.back),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ошибка загрузки контекста экрана (смена, объект, помещение).
class _LoadError extends StatelessWidget {
  const _LoadError({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off_outlined, size: 56, color: AppPalette.textMuted),
            const SizedBox(height: AppSpacing.md),
            const Text(
              SosTexts.serviceUnavailable,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              failure.message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(
              key: const Key('sos_error_retry'),
              onPressed: onRetry,
              child: const Text(SosTexts.retry),
            ),
          ],
        ),
      ),
    );
  }
}

/// Баннер состояния экрана (оффлайн-очередь).
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
        color: color.withValues(alpha: 0.08),
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

/// Ошибка отправки над кнопкой SOS.
class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.text, required this.onRetry});

  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('sos_send_error'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        border: Border.all(color: AppPalette.danger),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        children: <Widget>[
          const Icon(Icons.error_outline, color: AppPalette.danger),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
            ),
          ),
          TextButton(
            key: const Key('sos_send_retry_button'),
            onPressed: onRetry,
            child: const Text(SosTexts.retry),
          ),
        ],
      ),
    );
  }
}
