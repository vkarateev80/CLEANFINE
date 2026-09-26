import 'dart:convert';

import '../../../core/errors/failures.dart';
import '../../../services/chat_socket_service.dart';
import '../../../shared/data/pending_actions.dart';
import '../../../shared/data/result.dart';
import 'models/chat_models.dart';
import 'chat_message_store.dart';
import 'repositories/chat_repository.dart';

/// Итог досылки одного сообщения.
class ChatDeliveryResult {
  const ChatDeliveryResult({required this.ok, this.error, this.permanent = false});

  const ChatDeliveryResult.success() : this(ok: true);

  const ChatDeliveryResult.retryable(String error) : this(ok: false, error: error);

  const ChatDeliveryResult.permanent(String error) : this(ok: false, error: error, permanent: true);

  final bool ok;
  final String? error;
  final bool permanent;
}

/// Отправка сообщений чата «через очередь» (DS-002 `chat.md` §3.4, `offline.md` §4.1).
///
/// Два следа одного сообщения:
///  * `chat_messages` — пузырь ленты («Отправляется…», «Не отправлено · Повторить»);
///  * `pending_actions` (`kind: 'chat_message'`) — запись очереди, её видит
///    `/offline` и общий проход синхронизации.
///
/// Досылка идёт **сначала сокетом** (основной путь по спецификации), а если
/// сокет не поднялся — REST-фолбэком. Идемпотентности на сервере нет
/// (`chat.md` п. 11.1), поэтому запись переводится в `sending` до отправки:
/// так её не заберёт параллельный проход [SyncService].
class ChatOutbox {
  ChatOutbox({
    required ChatMessageStore store,
    required PendingActionQueue queue,
    required ChatSocket socket,
    required ChatRepository rest,
    DateTime Function()? now,
  })  : _store = store,
        _queue = queue,
        _socket = socket,
        _rest = rest,
        _now = now ?? DateTime.now;

  final ChatMessageStore _store;
  final PendingActionQueue _queue;
  final ChatSocket _socket;
  final ChatRepository _rest;
  final DateTime Function() _now;

  /// Сколько ожидает отправки в этом чате — для бейджа и тестов.
  Future<List<PendingAction>> queuedFor(String chatId) async {
    final List<PendingAction> all = await _queue.all();
    return all
        .where(
          (PendingAction action) =>
              action.type == PendingActionTypes.chatMessage &&
              action.payload['chatId'] == chatId &&
              action.isOutgoing,
        )
        .toList(growable: false);
  }

  /// Поставить сообщение в очередь: локальный пузырь + запись `pending_actions`.
  ///
  /// Идемпотентность держит `idempotencyKey = 'chat:<clientId>'`
  /// (DS-002 `offline.md` §4.2): повтор с тем же `clientMessageId` не создаёт
  /// второй записи в очереди.
  Future<PendingAction> enqueue({
    required String chatId,
    required String text,
    String? authorId,
    List<String> attachmentIds = const <String>[],
    String? clientId,
    DateTime? createdAt,
  }) async {
    final LocalChatMessage message = await _store.append(
      chatId: chatId,
      text: text,
      clientId: clientId,
      authorId: authorId,
      attachmentIds: attachmentIds,
      createdAt: createdAt ?? _now(),
      status: ChatMessageStatus.pending,
    );

    final String key = idempotencyKey(message.clientId);
    final List<PendingAction> existing = await _queue.all();
    for (final PendingAction action in existing) {
      if (action.idempotencyKey == key && action.isOutgoing) return action;
    }

    return _queue.add(
      type: PendingActionTypes.chatMessage,
      idempotencyKey: key,
      createdAt: message.createdAtLocal,
      payload: <String, dynamic>{
        'chatId': chatId,
        'text': text,
        'clientMessageId': message.clientId,
        if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
      },
    );
  }

  /// Досылка очереди **этого** чата — вызывается при `onConnect` (`chat.md` §3.4).
  Future<void> flushChat(String chatId) async {
    for (final PendingAction action in await queuedFor(chatId)) {
      await _deliver(action);
    }
  }

  /// Ручной повтор сообщения из пузыря («Повторить», `chat.md` §4).
  Future<void> retryClientMessage(String chatId, String clientId) async {
    final List<PendingAction> all = await _queue.all();
    for (final PendingAction action in all) {
      if (action.idempotencyKey != idempotencyKey(clientId)) continue;
      await _queue.retryNow(action.id);
      await _deliver(action);
      return;
    }
    // Записи в очереди нет (сообщение пытались отправить онлайн) — досылаем
    // локальную строку напрямую, тем же `clientMessageId`.
    final LocalChatMessage? message = await _store.byClientId(clientId);
    if (message == null) return;
    await _sendViaSocketOrRest(
      chatId: chatId,
      clientId: clientId,
      text: message.text,
      attachmentIds: message.attachmentIds,
    );
  }

  /// Отправка записи очереди: WS → REST.
  Future<ChatDeliveryResult> _deliver(PendingAction action) async {
    final String? chatId = _text(action.payload['chatId']);
    final String? text = _text(action.payload['text']);
    final String? clientId = _text(action.payload['clientMessageId']);
    if (chatId == null || text == null || clientId == null) {
      await _queue.markFailed(
        action.id,
        error: 'В записи нет chatId, текста или clientMessageId',
        attempts: action.attempts + 1,
      );
      await _store.markStatus(clientId ?? '', ChatMessageStatus.failed);
      return const ChatDeliveryResult.permanent('Некорректная запись очереди');
    }

    await _queue.markSending(action.id);
    final ChatDeliveryResult result = await _sendViaSocketOrRest(
      chatId: chatId,
      clientId: clientId,
      text: text,
      attachmentIds: _ids(action.payload['attachmentIds']),
    );

    if (result.ok) {
      await _queue.markSynced(action.id, at: _now());
      return result;
    }

    final int attempts = action.attempts + 1;
    if (result.permanent) {
      await _queue.markFailed(action.id, error: result.error ?? 'Не отправлено', attempts: attempts);
      await _store.markStatus(clientId, ChatMessageStatus.failed);
      return result;
    }
    await _queue.scheduleRetry(
      action.id,
      error: result.error ?? 'Нет соединения',
      attempts: attempts,
      nextAttemptAt: _now().add(const Duration(seconds: 5)),
    );
    return result;
  }

  /// Отправка сообщения: сокет — основной путь, REST — фолбэк.
  Future<ChatDeliveryResult> _sendViaSocketOrRest({
    required String chatId,
    required String clientId,
    required String text,
    required List<String> attachmentIds,
  }) async {
    if (_socket.isConnected) {
      final ChatSendAck ack = await _socket.sendMessage(
        chatId: chatId,
        text: text,
        attachmentIds: attachmentIds,
        clientMessageId: clientId,
      );
      final ChatMessage? message = ack.message;
      if (ack.ok && message != null) {
        await _store.markSent(clientId, serverId: message.id);
        return const ChatDeliveryResult.success();
      }
      // Сокет поднят, но сервер отказал: повтор бессмысленен, пока не изменится
      // причина (403 «Вы не участник этого чата» и подобное).
      if (ack.error != null) {
        return ChatDeliveryResult.permanent(ack.error!);
      }
    }

    final Result<ChatMessage> sent = await _rest.sendMessage(
      chatId,
      text: text,
      attachmentIds: attachmentIds,
      clientMessageId: clientId,
    );
    final ChatMessage? message = sent.dataOrNull;
    if (message != null) {
      await _store.markSent(clientId, serverId: message.id);
      return const ChatDeliveryResult.success();
    }
    final failure = sent.failureOrNull;
    final String error = failure?.message ?? 'Не удалось отправить сообщение';
    if (failure != null && _isRetryable(failure)) {
      return ChatDeliveryResult.retryable(error);
    }
    return ChatDeliveryResult.permanent(error);
  }

  /// Та же граница, что у очереди действий (`offline.md` §5.2.7): сеть, 5xx,
  /// 429 и 401 — временные, остальные 4xx оператор должен увидеть сам.
  static bool _isRetryable(Failure failure) {
    return failure is NetworkFailure ||
        failure is ServerFailure ||
        failure is TooManyRequestsFailure ||
        failure is UnauthorizedFailure;
  }

  /// `chat:<clientId>` — ключ идемпотентности записи очереди.
  static String idempotencyKey(String clientId) => 'chat:$clientId';

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static List<String> _ids(dynamic value) {
    if (value is List) return value.map((dynamic item) => item.toString()).toList(growable: false);
    if (value is String && value.isNotEmpty) {
      try {
        final dynamic decoded = jsonDecode(value);
        if (decoded is List) {
          return decoded.map((dynamic item) => item.toString()).toList(growable: false);
        }
      } on FormatException {
        return const <String>[];
      }
    }
    return const <String>[];
  }
}
