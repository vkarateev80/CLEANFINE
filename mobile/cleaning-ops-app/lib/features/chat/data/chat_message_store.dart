import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../database/app_chat_messages.dart';
import '../../../database/app_database.dart';
import 'models/chat_models.dart';

/// Строка таблицы `chat_messages` в доменной форме.
class LocalChatMessage {
  const LocalChatMessage({
    required this.clientId,
    required this.chatId,
    required this.text,
    required this.createdAtLocal,
    required this.status,
    this.serverId,
    this.authorId,
    this.attachmentIds = const <String>[],
  });

  /// Локальный идентификатор: он же ключ интерфейса до подтверждения сервером.
  final String clientId;
  final String? serverId;
  final String chatId;
  final String? authorId;
  final String text;

  /// `attachmentIds` приходят из JSON-колонки (`attachment_ids_json`).
  final List<String> attachmentIds;

  final DateTime createdAtLocal;
  final ChatMessageStatus status;

  /// Пузырь ленты: `id` — серверный, если он уже есть, иначе локальный.
  ChatMessage toMessage() {
    return ChatMessage(
      id: serverId ?? clientId,
      chatId: chatId,
      authorId: authorId ?? '',
      text: text,
      createdAt: createdAtLocal,
      attachmentIds: attachmentIds,
      clientId: clientId,
      status: status,
    );
  }
}

/// Локальное хранилище сообщений чата (DS-002 `offline.md` §3, `chat_messages`).
///
/// Держит **только** то, что написал оператор: сообщения собеседников приходят
/// из истории сервера и в базе не дублируются. Задача строки — показать пузырь
/// до ответа сервера и пережить перезапуск приложения, пока сообщение не ушло.
class ChatMessageStore {
  ChatMessageStore(this._db, {Uuid? uuid, DateTime Function()? now})
      : _uuid = uuid ?? const Uuid(),
        _now = now ?? DateTime.now;

  final AppDatabase _db;
  final Uuid _uuid;
  final DateTime Function() _now;

  /// Новый локальный идентификатор сообщения (`clientMessageId`).
  String newClientId() => _uuid.v4();

  /// Запись пузыря в локальную ленту.
  Future<LocalChatMessage> append({
    required String chatId,
    required String text,
    String? clientId,
    String? authorId,
    List<String> attachmentIds = const <String>[],
    DateTime? createdAt,
    ChatMessageStatus status = ChatMessageStatus.pending,
  }) async {
    final LocalChatMessage message = LocalChatMessage(
      clientId: clientId ?? newClientId(),
      chatId: chatId,
      authorId: authorId,
      text: text,
      attachmentIds: attachmentIds,
      createdAtLocal: createdAt ?? _now(),
      status: status,
    );
    await _db.upsertChatMessage(_companion(message));
    return message;
  }

  Future<List<LocalChatMessage>> forChat(String chatId) async {
    final List<ChatMessageRow> rows = await _db.chatMessagesFor(chatId);
    return rows.map(_domain).toList(growable: false);
  }

  /// Сообщения, которые ещё не подтверждены сервером, — их досылает outbox.
  Future<List<LocalChatMessage>> pendingForChat(String chatId) async {
    final List<LocalChatMessage> all = await forChat(chatId);
    return all
        .where(
          (LocalChatMessage message) =>
              message.status == ChatMessageStatus.pending ||
              message.status == ChatMessageStatus.failed,
        )
        .toList(growable: false);
  }

  Future<LocalChatMessage?> byClientId(String clientId) async {
    final ChatMessageRow? row = await _db.chatMessageByClientId(clientId);
    return row == null ? null : _domain(row);
  }

  Future<void> markSent(String clientId, {required String serverId}) {
    return _db.markChatMessageSent(clientId, serverId: serverId);
  }

  Future<void> markStatus(String clientId, ChatMessageStatus status) {
    return _db.setChatMessageStatus(clientId, status: status.code);
  }

  /// Аналог `markSent`, если серверный id уже известен (повторная досылка).
  Future<void> markReadByServerId(String serverId) =>
      _db.markChatMessageReadByServerId(serverId);

  ChatMessagesCompanion _companion(LocalChatMessage message) {
    return ChatMessagesCompanion(
      clientId: Value<String>(message.clientId),
      serverId: Value<String?>(message.serverId),
      chatId: Value<String>(message.chatId),
      authorId: Value<String?>(message.authorId),
      messageText: Value<String>(message.text),
      attachmentIdsJson: Value<String?>(jsonEncode(message.attachmentIds)),
      createdAtLocal: Value<DateTime>(message.createdAtLocal),
      status: Value<String>(message.status.code),
    );
  }

  LocalChatMessage _domain(ChatMessageRow row) {
    return LocalChatMessage(
      clientId: row.clientId,
      serverId: row.serverId,
      chatId: row.chatId,
      authorId: row.authorId,
      text: row.messageText,
      attachmentIds: _decodeIds(row.attachmentIdsJson),
      createdAtLocal: row.createdAtLocal,
      status: ChatMessageStatus.of(row.status),
    );
  }

  /// Битая или пустая JSON-колонка не должна ронять ленту.
  static List<String> _decodeIds(String? raw) {
    if (raw == null || raw.isEmpty) return const <String>[];
    try {
      final dynamic decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.map((dynamic item) => item.toString()).toList(growable: false);
      }
    } on FormatException {
      return const <String>[];
    }
    return const <String>[];
  }
}
