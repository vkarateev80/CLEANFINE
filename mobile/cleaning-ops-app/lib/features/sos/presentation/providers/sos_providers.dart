import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/errors/failures.dart';
import '../../../../database/database_provider.dart';
import '../../../../shared/data/data_providers.dart';
import '../../../../shared/data/models/emergency_ticket.dart';
import '../../../../shared/data/models/file_models.dart';
import '../../../../shared/data/models/operator_models.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../../../shared/data/models/tech_card_models.dart';
import '../../../../shared/data/pending_actions.dart';
import '../../../../shared/data/result.dart';
import '../../../../shared/services/location_service.dart';
import '../../../../shared/services/photo_service.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../domain/emergency_category.dart';
import '../sos_texts.dart';

/// Параметры экрана SOS: помещение, из которого открыли экран (если открыли из
/// точки маршрута или чек-листа) — попадает в заявку и в текст локации.
class SosConstants {
  const SosConstants._();

  /// Радиус поиска ближних операторов, м (значение по умолчанию gps-service).
  static const int nearbyRadiusM = 500;

  /// Таймаут определения координат: дольше ждать оператор не будет.
  static const Duration locationTimeout = Duration(seconds: 10);
}

/// Состояние экрана аварийной заявки.
class SosState {
  const SosState({
    this.objectId,
    this.objectName,
    this.roomId,
    this.roomLabel,
    this.category,
    this.photo,
    this.description = '',
    this.point,
    this.locating = false,
    this.locationError,
    this.submitting = false,
    this.formError,
    this.sendError,
    this.ticket,
    this.queued = false,
    this.photoNotAttached = false,
    this.pendingCount = 0,
  });

  /// `null` — активной смены с объектом нет: отправлять заявку некуда.
  final String? objectId;
  final String? objectName;
  final String? roomId;

  /// «Санузел 101, 3 этаж» — уходит в `floor` события `ticket.emergency`.
  final String? roomLabel;

  final EmergencyCategory? category;
  final CapturedPhoto? photo;
  final String description;
  final GeoPoint? point;
  final bool locating;
  final String? locationError;
  final bool submitting;

  /// Ошибка валидации формы — строка под полями.
  final String? formError;

  /// Ошибка отправки — баннер над кнопкой.
  final String? sendError;

  /// Созданная заявка (успех) либо `queued` — заявка ушла в очередь оффлайна.
  final EmergencyTicket? ticket;
  final bool queued;

  /// Заявка создана, но фото к ней не привязалось: запись осталась в очереди.
  final bool photoNotAttached;

  final int pendingCount;

  bool get hasObject => objectId != null;
  bool get isSent => ticket != null || queued;
  bool get isFilled =>
      category != null || photo != null || description.trim().isNotEmpty;

  SosState copyWith({
    String? objectId,
    String? objectName,
    String? roomId,
    String? roomLabel,
    EmergencyCategory? category,
    CapturedPhoto? photo,
    String? description,
    GeoPoint? point,
    bool? locating,
    String? locationError,
    bool? submitting,
    String? formError,
    String? sendError,
    EmergencyTicket? ticket,
    bool? queued,
    bool? photoNotAttached,
    int? pendingCount,
    bool clearFormError = false,
    bool clearSendError = false,
    bool clearLocationError = false,
    bool clearPhoto = false,
  }) {
    return SosState(
      objectId: objectId ?? this.objectId,
      objectName: objectName ?? this.objectName,
      roomId: roomId ?? this.roomId,
      roomLabel: roomLabel ?? this.roomLabel,
      category: category ?? this.category,
      photo: clearPhoto ? null : photo ?? this.photo,
      description: description ?? this.description,
      point: point ?? this.point,
      locating: locating ?? this.locating,
      locationError: clearLocationError ? null : locationError ?? this.locationError,
      submitting: submitting ?? this.submitting,
      formError: clearFormError ? null : formError ?? this.formError,
      sendError: clearSendError ? null : sendError ?? this.sendError,
      ticket: ticket ?? this.ticket,
      queued: queued ?? this.queued,
      photoNotAttached: photoNotAttached ?? this.photoNotAttached,
      pendingCount: pendingCount ?? this.pendingCount,
    );
  }
}

/// Аварийная заявка (SOS, М6.5).
///
/// Порядок отправки из DS-002 `sos.md` §3.6: фото → file-service, заявка →
/// ticket-service, привязка фото к заявке. Без сети все шаги кладутся в очередь
/// `pending_actions` одной записью с локальным путём к снимку.
class SosController extends FamilyAsyncNotifier<SosState, String?> {
  /// Локальный ключ заявки: снижает риск дубля при повторной отправке
  /// (на сервере идемпотентности нет — DS-002 `sos.md` п. 10.4).
  late final String clientRequestId = const Uuid().v4();

  @override
  Future<SosState> build(String? arg) async {
    // Данные пользователя: выход и вход другого пересобирают провайдер с нуля.
    ref.watch(sessionScopeProvider);
    final String? roomId = arg;
    final ScheduleEvent? event = await _activeEvent();

    String? objectName;
    if (event?.objectId != null) {
      objectName = (await ref.read(coreRepositoryProvider).object(event!.objectId!)).dataOrNull?.name;
    }

    String? roomLabel;
    if (roomId != null) {
      final RoomDetail? room = (await ref.read(coreRepositoryProvider).room(roomId)).dataOrNull;
      if (room != null) {
        final FloorPlan? floor = room.floorId == null
            ? null
            : (await ref.read(coreRepositoryProvider).floor(room.floorId!)).dataOrNull;
        roomLabel = floor == null ? room.name : '${room.name}, ${floor.number} этаж';
      }
    }

    return SosState(
      objectId: event?.objectId,
      objectName: objectName,
      roomId: roomId,
      roomLabel: roomLabel,
      pendingCount: await ref.read(pendingActionQueueProvider).pendingCount(),
    );
  }

  /// Смена, из которой берём `objectId`: сначала открытая, иначе последняя с объектом.
  Future<ScheduleEvent?> _activeEvent() async {
    final Result<List<ScheduleEvent>> result =
        await ref.read(scheduleRepositoryProvider).myEvents();
    final List<ScheduleEvent> events = result.dataOrNull ?? const <ScheduleEvent>[];
    for (final ScheduleEvent event in events) {
      if (event.isCheckedIn && event.objectId != null) return event;
    }
    for (final ScheduleEvent event in events) {
      if (event.objectId != null) return event;
    }
    return null;
  }

  void selectCategory(EmergencyCategory? category) {
    _patch(category: category, clearFormError: true);
  }

  void setDescription(String value) => _patch(description: value);

  void attachPhoto(CapturedPhoto photo) => _patch(photo: photo, clearFormError: true);

  /// «Переснять»: локальный файл удаляется, оператор снимает заново.
  Future<void> retakePhoto() async {
    final CapturedPhoto? photo = state.valueOrNull?.photo;
    await ref.read(photoCaptureServiceProvider).delete(photo?.path);
    _patch(clearPhoto: true, clearFormError: true);
  }

  /// Координаты места аварии: запрашиваются при открытии и по тапу на строку локации.
  Future<void> refreshLocation() async {
    // Экран мог ещё не загрузить контекст (смена, объект, помещение) — ждём его,
    // иначе запрос координат потерялся бы вместе с пустым состоянием.
    if (state.valueOrNull == null) {
      await future;
    }
    final SosState? current = state.valueOrNull;
    if (current == null || current.locating) return;
    _patch(locating: true, clearLocationError: true);
    try {
      final GeoPoint point = await ref
          .read(locationServiceProvider)
          .currentPosition()
          .timeout(SosConstants.locationTimeout);
      _patch(point: point, locating: false);
    } on Object {
      // Отказ в разрешении, выключенный GPS или таймаут — для оператора одно и то же.
      _patch(locating: false, locationError: SosTexts.locationDenied);
    }
  }

  /// Отправка SOS. Возвращает текст для snackbar, если оператору нужно что-то
  /// исправить в форме; серверные ошибки показываются баннером.
  Future<String?> submit() async {
    final SosState current = state.valueOrNull ?? const SosState();
    if (current.submitting || !current.hasObject) return null;

    if (current.category == null || current.photo == null) {
      _patch(formError: SosTexts.validation);
      return SosTexts.validation;
    }
    final GeoPoint? point = current.point;
    if (point == null) {
      _patch(locationError: SosTexts.locationDenied);
      return SosTexts.locationDenied;
    }

    _patch(submitting: true, clearSendError: true);
    final String description = current.category!.toDescription(current.description);

    // 1. Фото с водяным знаком (его рисует сервер).
    String? fileId;
    final CapturedPhoto? photo = current.photo;
    if (photo != null && photo.path.isNotEmpty) {
      final Result<UploadedFile> upload = await ref.read(filesRepositoryProvider).uploadPhoto(
            filePath: photo.path,
            takenAt: photo.takenAt,
            lat: point.lat,
            lng: point.lng,
          );
      final Failure? failure = upload.failureOrNull;
      if (failure != null) {
        if (failure is NetworkFailure) return _enqueue(current, description, point);
        _patch(submitting: false, sendError: SosTexts.photoRejected(failure.message));
        return null;
      }
      fileId = upload.dataOrNull!.id;
    }

    // 2. Аварийная заявка.
    final Result<EmergencyTicket> created =
        await ref.read(ticketsRepositoryProvider).createEmergency(
              objectId: current.objectId!,
              description: description,
              lat: point.lat,
              lng: point.lng,
              roomId: current.roomId,
              objectName: current.objectName,
              floor: current.roomLabel,
              radiusM: SosConstants.nearbyRadiusM,
            );
    final Failure? failure = created.failureOrNull;
    if (failure != null) {
      if (failure is NetworkFailure) return _enqueue(current, description, point);
      _patch(submitting: false, sendError: _errorText(failure));
      return null;
    }
    final EmergencyTicket ticket = created.dataOrNull!;

    // 3. Привязка фото: без неё снимок остаётся в бакете без сущности.
    //    Падение этого шага не делает заявку неуспешной — запись ждёт в очереди.
    bool photoNotAttached = false;
    if (fileId != null) {
      final Result<String> attached =
          await ref.read(filesRepositoryProvider).attachToTicket(fileId: fileId, ticketId: ticket.id);
      if (attached.failureOrNull != null) {
        photoNotAttached = true;
        await ref.read(pendingActionQueueProvider).add(
              type: PendingActionTypes.sosAttachPhoto,
              idempotencyKey: 'sos-attach:$fileId',
              payload: <String, dynamic>{'fileId': fileId, 'ticketId': ticket.id},
            );
      }
    }

    await ref.read(photoCaptureServiceProvider).delete(photo?.path);
    _patch(
      submitting: false,
      ticket: ticket,
      photoNotAttached: photoNotAttached,
      pendingCount: await ref.read(pendingActionQueueProvider).pendingCount(),
    );
    return null;
  }

  /// Без сети: заявка и фото уходят в очередь одной записью (DS-002 `sos.md` §3.6).
  Future<String?> _enqueue(SosState current, String description, GeoPoint point) async {
    await ref.read(pendingActionQueueProvider).add(
          type: PendingActionTypes.sos,
          // У SOS серверной идемпотентности нет (DS-002 `sos.md` п. 10.4), поэтому
          // ключ локальный — по нему видно, что запись уже отправлялась.
          idempotencyKey: 'sos:$clientRequestId',
          payload: <String, dynamic>{
            'clientRequestId': clientRequestId,
            'objectId': current.objectId,
            if (current.roomId != null) 'roomId': current.roomId,
            'description': description,
            'lat': point.lat,
            'lng': point.lng,
            if (current.objectName != null) 'objectName': current.objectName,
            if (current.roomLabel != null) 'roomName': current.roomLabel,
            if (current.roomLabel != null) 'floor': current.roomLabel,
            'radiusM': SosConstants.nearbyRadiusM,
            if (current.photo != null) 'localPhotoPath': current.photo!.path,
          },
        );
    _patch(
      submitting: false,
      queued: true,
      pendingCount: await ref.read(pendingActionQueueProvider).pendingCount(),
    );
    return null;
  }

  /// 400 — текст сервера («Опишите аварию»), 5xx — общая формулировка.
  String _errorText(Failure failure) {
    if (failure is ValidationFailure) return failure.message;
    if (failure is ServerFailure) return SosTexts.serviceUnavailable;
    return SosTexts.generic(failure.message);
  }

  void _patch({
    EmergencyCategory? category,
    CapturedPhoto? photo,
    String? description,
    GeoPoint? point,
    bool? locating,
    String? locationError,
    bool? submitting,
    String? formError,
    String? sendError,
    EmergencyTicket? ticket,
    bool? queued,
    bool? photoNotAttached,
    int? pendingCount,
    bool clearFormError = false,
    bool clearSendError = false,
    bool clearLocationError = false,
    bool clearPhoto = false,
  }) {
    final SosState? current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData<SosState>(
      current.copyWith(
        category: category,
        photo: photo,
        description: description,
        point: point,
        locating: locating,
        locationError: locationError,
        submitting: submitting,
        formError: formError,
        sendError: sendError,
        ticket: ticket,
        queued: queued,
        photoNotAttached: photoNotAttached,
        pendingCount: pendingCount,
        clearFormError: clearFormError,
        clearSendError: clearSendError,
        clearLocationError: clearLocationError,
        clearPhoto: clearPhoto,
      ),
    );
  }
}

final sosProvider = AsyncNotifierProvider.family<SosController, SosState, String?>(
  SosController.new,
);
