import 'package:drift/drift.dart';

import 'app_database.dart';

/// Низкоуровневый доступ к таблице `chat_messages` (DS-002 `offline.md` §3).
///
/// Таблица отдельная от `app_cache.dart`: это не кэш чтения, а **данные
/// оператора** — неотправленные сообщения. Поэтому «Очистить кэш» в профиле их
/// не трогает (`profile.md` п. 11.7), а строки живут до подтверждения сервером.
extension AppChatMessageQueries on AppDatabase {
  Future<void> upsertChatMessage(ChatMessagesCompanion row) =>
      into(chatMessages).insertOnConflictUpdate(row);

  /// Лента чата: свежие ниже (лента рисуется `ListView(reverse: true)`).
  Future<List<ChatMessageRow>> chatMessagesFor(String chatId) {
    return (select(chatMessages)
          ..where((ChatMessages t) => t.chatId.equals(chatId))
          ..orderBy(<OrderClauseGenerator<ChatMessages>>[
            (ChatMessages t) => OrderingTerm.asc(t.createdAtLocal),
          ]))
        .get();
  }

  Future<ChatMessageRow?> chatMessageByClientId(String clientId) {
    return (select(chatMessages)..where((ChatMessages t) => t.clientId.equals(clientId)))
        .getSingleOrNull();
  }

  Future<ChatMessageRow?> chatMessageByServerId(String serverId) {
    return (select(chatMessages)..where((ChatMessages t) => t.serverId.equals(serverId)))
        .getSingleOrNull();
  }

  /// Сообщение подтверждено сервером: появляется `serverId`, статус — `sent`.
  Future<void> markChatMessageSent(String clientId, {required String serverId}) {
    return (update(chatMessages)..where((ChatMessages t) => t.clientId.equals(clientId))).write(
      ChatMessagesCompanion(
        serverId: Value<String>(serverId),
        status: const Value<String>('sent'),
      ),
    );
  }

  Future<void> setChatMessageStatus(String clientId, {required String status}) {
    return (update(chatMessages)..where((ChatMessages t) => t.clientId.equals(clientId)))
        .write(ChatMessagesCompanion(status: Value<String>(status)));
  }

  /// Сервер сообщил, что сообщение прочитано (`message:read` с нашим `messageId`).
  /// Удаление по серверному id (`message:deleted`): локальная копия не должна
  /// вернуться в ленту при слиянии с историей.
  Future<int> deleteChatMessageByServerId(String serverId) {
    return (delete(chatMessages)..where((ChatMessages t) => t.serverId.equals(serverId))).go();
  }

  Future<void> markChatMessageReadByServerId(String serverId) {
    return (update(chatMessages)..where((ChatMessages t) => t.serverId.equals(serverId)))
        .write(const ChatMessagesCompanion(status: Value<String>('read')));
  }
}
