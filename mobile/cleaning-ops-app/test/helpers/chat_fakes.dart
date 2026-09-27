import 'dart:async';

import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/features/chat/data/models/chat_models.dart';
import 'package:cleaning_ops_app/features/chat/data/repositories/chat_repository.dart';
import 'package:cleaning_ops_app/services/chat_socket_service.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';

import 'auth_fakes.dart';

/// Подмены чата для widget-тестов М6.8: ни одного настоящего сокета и ни одного
/// HTTP-запроса — иначе тест зависел бы от поднятого стенда.

/// Сокет без сети: события выдаёт тест, отправку подтверждает по сценарию.
class FakeChatSocket implements ChatSocket {
  FakeChatSocket({this.connected = false, this.sendFailure, this.ackError});

  /// Поднято ли соединение к моменту вызова.
  bool connected;

  /// Ошибка отправки: `null` — сервер подтверждает сообщение.
  String? sendFailure;

  /// Ошибка авторизации, которую сервер может вернуть в ack.
  String? ackError;

  final StreamController<ChatSocketEvent> _events =
      StreamController<ChatSocketEvent>.broadcast();

  int connectCalls = 0;
  int disconnectCalls = 0;
  String? lastToken;

  /// Что именно отправляли: `{chatId, text, attachmentIds}`.
  final List<Map<String, Object?>> sends = <Map<String, Object?>>[];

  /// Что именно отмечали прочитанным.
  final List<Map<String, Object?>> reads = <Map<String, Object?>>[];

  @override
  Stream<ChatSocketEvent> get events => _events.stream;

  @override
  bool get isConnected => connected;

  @override
  Future<void> connect(String accessToken) async {
    connectCalls += 1;
    lastToken = accessToken;
  }

  @override
  Future<void> disconnect() async {
    disconnectCalls += 1;
    connected = false;
  }

  @override
  Future<ChatSendAck> sendMessage({
    required String chatId,
    required String text,
    List<String> attachmentIds = const <String>[],
    String? clientMessageId,
  }) async {
    sends.add(<String, Object?>{
      'chatId': chatId,
      'text': text,
      'attachmentIds': attachmentIds,
      if (clientMessageId != null && clientMessageId.isNotEmpty)
        'clientMessageId': clientMessageId,
    });
    if (sendFailure != null) return ChatSendAck.failure(sendFailure!);
    if (!connected) return const ChatSendAck.failure('Нет соединения');
    return ChatSendAck.success(
      ChatMessage(
        id: 'server-${sends.length}',
        chatId: chatId,
        authorId: 'me',
        text: text,
        createdAt: DateTime(2026, 9, 16, 10, 45),
        attachmentIds: attachmentIds,
      ),
    );
  }

  @override
  Future<void> markRead({required String chatId, required String lastMessageId}) async {
    reads.add(<String, Object?>{'chatId': chatId, 'lastMessageId': lastMessageId});
  }

  /// Сервер авторизовал соединение (мок `onConnect` из `chat.md` §10.1).
  void emitConnected() {
    connected = true;
    _events.add(const ChatSocketConnected());
  }

  void emitDisconnected({String? reason}) {
    connected = false;
    _events.add(ChatSocketDisconnected(reason: reason));
  }

  void emitMessage(ChatMessage message) => _events.add(ChatSocketMessage(message));

  void emitRead({
    required String chatId,
    required String messageId,
    String readBy = 'peer',
    DateTime? readAt,
  }) {
    _events.add(
      ChatSocketRead(
        chatId: chatId,
        messageId: messageId,
        readBy: readBy,
        readAt: readAt ?? DateTime(2026, 9, 16, 10, 47),
      ),
    );
  }

  void emitPresence(String userId, bool online) =>
      _events.add(ChatSocketPresence(userId: userId, online: online));

  Future<void> dispose() => _events.close();
}

/// REST чата без сети: ответы задаёт тест.
class FakeChatRepository extends ChatRepository {
  FakeChatRepository({
    this.chats = const <ChatSummary>[],
    this.detail,
    this.page,
    this.chatsFailure,
    this.detailFailure,
    this.messagesFailure,
    this.sendFailure,
    this.readFailure,
  }) : super(
          fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
        );

  List<ChatSummary> chats;
  ChatDetail? detail;
  ChatMessagesPage? page;
  Failure? chatsFailure;
  Failure? detailFailure;
  Failure? messagesFailure;
  Failure? sendFailure;
  Failure? readFailure;

  int listCalls = 0;
  int detailCalls = 0;
  int messageCalls = 0;
  final List<Map<String, Object?>> readCalls = <Map<String, Object?>>[];

  @override
  Future<Result<List<ChatSummary>>> listChats() async {
    listCalls += 1;
    if (chatsFailure != null) return Err<List<ChatSummary>>(chatsFailure!);
    return Ok<List<ChatSummary>>(chats);
  }

  @override
  Future<Result<ChatDetail>> chatDetail(String chatId) async {
    detailCalls += 1;
    if (detailFailure != null) return Err<ChatDetail>(detailFailure!);
    final ChatDetail? value = detail;
    if (value == null) return const Err<ChatDetail>(NotFoundFailure('Чат не найден'));
    return Ok<ChatDetail>(value);
  }

  @override
  Future<Result<ChatMessagesPage>> messages(
    String chatId, {
    DateTime? before,
    int limit = 30,
  }) async {
    messageCalls += 1;
    if (messagesFailure != null) return Err<ChatMessagesPage>(messagesFailure!);
    return Ok<ChatMessagesPage>(page ?? const ChatMessagesPage.empty());
  }

  @override
  Future<Result<ChatMessage>> sendMessage(
    String chatId, {
    required String text,
    List<String> attachmentIds = const <String>[],
    String? clientMessageId,
  }) async {
    if (sendFailure != null) return Err<ChatMessage>(sendFailure!);
    return Ok<ChatMessage>(
      ChatMessage(
        id: 'rest-1',
        chatId: chatId,
        authorId: 'me',
        text: text,
        createdAt: DateTime(2026, 9, 16, 10, 45),
        attachmentIds: attachmentIds,
      ),
    );
  }

  @override
  Future<Result<String>> markRead(String chatId, {required String lastMessageId}) async {
    readCalls.add(<String, Object?>{'chatId': chatId, 'lastMessageId': lastMessageId});
    if (readFailure != null) return Err<String>(readFailure!);
    return const Ok<String>('2026-09-16T10:47:00.000Z');
  }
}

/// Чат по заявке — базовая фикстура тестов: заголовка нет, поэтому имя берётся
/// из правила по типу (`chat.md` §3.1).
ChatSummary chatSummary({
  String id = 'chat-1',
  String type = ChatTypes.ticket,
  String? title,
  String lastText = 'Прорыв трубы в санузле 101',
  String lastAuthorId = 'peer',
  DateTime? lastAt,
  int unreadCount = 0,
}) {
  return ChatSummary(
    id: id,
    type: type,
    title: title,
    objectId: 'object-1',
    ticketId: 'ticket-1',
    createdAt: DateTime(2026, 9, 16, 10, 0),
    unreadCount: unreadCount,
    lastMessage: LastMessagePreview(
      id: 'message-$id',
      authorId: lastAuthorId,
      text: lastText,
      createdAt: lastAt ?? DateTime(2026, 9, 16, 10, 42),
      attachmentIds: const <String>[],
    ),
  );
}

ChatDetail chatDetailFixture({
  String id = 'chat-1',
  String type = ChatTypes.ticket,
  String? title,
  List<ChatMember>? members,
  DateTime? lastReadAt,
}) {
  return ChatDetail(
    id: id,
    type: type,
    title: title,
    objectId: 'object-1',
    ticketId: 'ticket-1',
    createdAt: DateTime(2026, 9, 16, 10, 0),
    members: members ??
        <ChatMember>[
          ChatMember(
            userId: 'me',
            role: 'OPERATOR',
            joinedAt: DateTime(2026, 9, 16, 10, 0),
            lastReadAt: lastReadAt,
          ),
          ChatMember(
            userId: 'peer',
            role: 'SUPERVISOR',
            joinedAt: DateTime(2026, 9, 16, 10, 0),
            lastReadAt: lastReadAt,
          ),
        ],
  );
}

ChatMessage chatMessage({
  String id = 'message-1',
  String chatId = 'chat-1',
  String authorId = 'peer',
  String text = 'Прорыв трубы в санузле 101. Вода на полу.',
  DateTime? createdAt,
  DateTime? deliveredAt,
  List<String> attachmentIds = const <String>[],
}) {
  return ChatMessage(
    id: id,
    chatId: chatId,
    authorId: authorId,
    text: text,
    createdAt: createdAt ?? DateTime(2026, 9, 16, 10, 5),
    deliveredAt: deliveredAt,
    attachmentIds: attachmentIds,
  );
}

ChatMessagesPage chatPage({List<ChatMessage>? items, bool hasMore = false, DateTime? nextBefore}) {
  return ChatMessagesPage(
    items: items ?? <ChatMessage>[chatMessage()],
    hasMore: hasMore,
    nextBefore: nextBefore,
    limit: 30,
  );
}
