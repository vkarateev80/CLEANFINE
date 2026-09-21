import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/errors/failures.dart';
import '../shared/data/data_providers.dart';
import '../shared/data/models/emergency_ticket.dart';
import '../features/chat/data/models/chat_models.dart';
import '../features/chat/presentation/providers/chat_providers.dart';
import '../shared/data/models/file_models.dart';
import '../shared/data/models/operation_completion.dart';
import '../features/chat/data/chat_message_store.dart';
import '../features/chat/data/repositories/chat_repository.dart';
import '../shared/data/pending_actions.dart';
import '../shared/data/repositories/files_repository.dart';
import '../shared/data/repositories/operator_repositories.dart';
import '../shared/data/result.dart';
import '../shared/services/photo_service.dart';

/// Итог отправки одного действия из очереди.
class QueueSendResult {
  const QueueSendResult._(this.isSuccess, this.error, this.permanent);

  const QueueSendResult.success() : this._(true, null, false);

  /// Временная ошибка: сеть, 5xx, 429 — запись вернётся в очередь по backoff.
  const QueueSendResult.retryable(String error) : this._(false, error, false);

  /// 4xx: повтор не поможет, оператор должен увидеть причину (DS-002 `offline.md` §5.2.7).
  const QueueSendResult.permanent(String error) : this._(false, error, true);

  final bool isSuccess;
  final String? error;
  final bool permanent;
}

/// Отправка действий из очереди (`pending_actions`).
///
/// Знает только репозитории и полезную нагрузку записи, поэтому синхронизатор не
/// зависит от экранов, которые эти действия создали.
class QueueActionSender {
  QueueActionSender({
    required FilesRepository files,
    required TicketsRepository tickets,
    required PhotoCaptureService photos,
    ChatRepository? chat,
    ChatMessageStore? chatStore,
  })  : _files = files,
        _tickets = tickets,
        _photos = photos,
        _chat = chat,
        _chatStore = chatStore;

  final FilesRepository _files;
  final TicketsRepository _tickets;
  final PhotoCaptureService _photos;

  /// Чат (М6.8): `kind: 'chat_message'` уходит REST-фолбэком, потому что сокет
  /// живёт только на открытом экране переписки (`chat.md` §3.4).
  final ChatRepository? _chat;
  final ChatMessageStore? _chatStore;

  Future<QueueSendResult> send(PendingAction action) {
    switch (action.type) {
      case PendingActionTypes.sos:
        return _sendSos(action);
      case PendingActionTypes.sosAttachPhoto:
        return _sendAttach(action);
      case PendingActionTypes.operationCompleted:
        return _sendOperation(action);
      case PendingActionTypes.chatMessage:
        return _sendChatMessage(action);
      default:
        return Future<QueueSendResult>.value(
          QueueSendResult.permanent('Неизвестный тип действия: ${action.type}'),
        );
    }
  }

  /// Аварийная заявка: фото → заявка → привязка фото (DS-002 `sos.md` §3.6).
  Future<QueueSendResult> _sendSos(PendingAction action) async {
    final Map<String, dynamic> payload = action.payload;
    final String? objectId = _text(payload['objectId']);
    final String? description = _text(payload['description']);
    final double? lat = _double(payload['lat']);
    final double? lng = _double(payload['lng']);
    final String? photoPath = _text(payload['localPhotoPath']);

    if (objectId == null || description == null || lat == null || lng == null) {
      return const QueueSendResult.permanent(
        'В записи нет обязательных полей: объект, описание или координаты',
      );
    }

    String? fileId;
    if (photoPath != null) {
      final Result<UploadedFile> upload = await _files.uploadPhoto(
        filePath: photoPath,
        takenAt: _date(payload['takenAt']),
        lat: lat,
        lng: lng,
      );
      final Failure? failure = upload.failureOrNull;
      if (failure != null) return _failure(failure);
      fileId = upload.dataOrNull!.id;
    }

    final Result<EmergencyTicket> created = await _tickets.createEmergency(
      objectId: objectId,
      description: description,
      lat: lat,
      lng: lng,
      roomId: _text(payload['roomId']),
      objectName: _text(payload['objectName']),
      floor: _text(payload['floor']),
      radiusM: _int(payload['radiusM']),
    );
    final Failure? failure = created.failureOrNull;
    if (failure != null) return _failure(failure);

    if (fileId != null) {
      // Падение привязки не делает заявку неуспешной: она уже создана, а снимок
      // лежит в бакете. Оператор увидит «Фото не прикреплено» на экране успеха.
      await _files.attachToTicket(fileId: fileId, ticketId: created.dataOrNull!.id);
    }
    await _photos.delete(photoPath);
    return const QueueSendResult.success();
  }

  /// Привязка фото к уже созданной заявке.
  Future<QueueSendResult> _sendAttach(PendingAction action) async {
    final String? fileId = _text(action.payload['fileId']);
    final String? ticketId = _text(action.payload['ticketId']);
    if (fileId == null || ticketId == null) {
      return const QueueSendResult.permanent('В записи нет fileId или ticketId');
    }
    final Result<String> attached = await _files.attachToTicket(fileId: fileId, ticketId: ticketId);
    final Failure? failure = attached.failureOrNull;
    return failure == null ? const QueueSendResult.success() : _failure(failure);
  }

  /// Завершение операции техкарты: `alreadyCompleted` — успех, а не ошибка.
  Future<QueueSendResult> _sendOperation(PendingAction action) async {
    final Map<String, dynamic> payload = action.payload;
    final String? ticketId = _text(payload['ticketId']);
    final String? operationId = _text(payload['operationId']);
    if (ticketId == null || operationId == null) {
      return const QueueSendResult.permanent('В записи нет ticketId или operationId');
    }

    final Result<CompleteOperationResult> result = await _tickets.completeOperation(
      ticketId: ticketId,
      operationId: operationId,
      completedAt: _date(payload['completedAt']),
      photoUrl: _text(payload['photoUrl']),
      requiresPhoto: payload['requiresPhoto'] == true,
      totalOperations: _int(payload['totalOperations']),
    );
    final Failure? failure = result.failureOrNull;
    return failure == null ? const QueueSendResult.success() : _failure(failure);
  }

  /// Сообщение в чат из очереди: REST-фолбэк `POST /api/chat/chats/:id/messages`
  /// (DS-002 `offline.md` §8). Локальная строка `chat_messages` переводится в
  /// `sent`, чтобы пузырь в ленте перестал показывать «Отправляется…».
  Future<QueueSendResult> _sendChatMessage(PendingAction action) async {
    final ChatRepository? chat = _chat;
    final String? chatId = _text(action.payload['chatId']);
    final String? text = _text(action.payload['text']);
    final String? clientMessageId = _text(action.payload['clientMessageId']);
    if (chat == null) {
      return const QueueSendResult.permanent('Отправка сообщений чата не настроена');
    }
    if (chatId == null || text == null) {
      return const QueueSendResult.permanent('В записи нет chatId или текста сообщения');
    }

    final Result<ChatMessage> sent = await chat.sendMessage(
      chatId,
      text: text,
      attachmentIds: _ids(action.payload['attachmentIds']),
    );
    final Failure? failure = sent.failureOrNull;
    if (failure != null) return _failure(failure);

    final ChatMessage? message = sent.dataOrNull;
    if (clientMessageId != null && message != null) {
      // Best-effort: сообщение уже ушло, ошибка локальной записи не должна
      // возвращать его в очередь и создавать дубль (идемпотентности нет).
      try {
        await _chatStore?.markSent(clientMessageId, serverId: message.id);
      } on Object {
        // Локальный статус обновится при следующем чтении ленты.
      }
    }
    return const QueueSendResult.success();
  }

  /// Временная ошибка — сеть и 5xx/429; всё остальное оператор должен увидеть сам.
  QueueSendResult _failure(Failure failure) {
    if (failure is NetworkFailure ||
        failure is ServerFailure ||
        failure is TooManyRequestsFailure ||
        failure is UnauthorizedFailure) {
      return QueueSendResult.retryable(failure.message);
    }
    return QueueSendResult.permanent(failure.message);
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static double? _double(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }

  static int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '');
  }

  static DateTime? _date(dynamic value) {
    final String? text = _text(value);
    return text == null ? null : DateTime.tryParse(text);
  }

  static List<String> _ids(dynamic value) {
    if (value is List) return value.map((dynamic item) => item.toString()).toList(growable: false);
    return const <String>[];
  }
}

final queueActionSenderProvider = Provider<QueueActionSender>((Ref ref) {
  return QueueActionSender(
    files: ref.watch(filesRepositoryProvider),
    tickets: ref.watch(ticketsRepositoryProvider),
    photos: ref.watch(photoCaptureServiceProvider),
    chat: ref.watch(chatRepositoryProvider),
    chatStore: ref.watch(chatMessageStoreProvider),
  );
});
