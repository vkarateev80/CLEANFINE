/// Модели чата (chat-service, М5.1–М5.2) для экранов М6.8.
///
/// Поля — ровно те, что отдаёт API (`ChatsService` в chat-service): `ChatSummary`
/// для списка, `ChatDetail` — для шапки переписки, `MessageView` — для ленты.
/// Ничего не додумывается: если поля в ответе нет, модель его не изобретает.
library;

import '../../../../core/constants/api_constants.dart';

/// Тип чата (`CHAT_TYPES` в `shared/types/chat.ts`).
class ChatTypes {
  const ChatTypes._();

  static const String object = 'object';
  static const String ticket = 'ticket';
  static const String direct = 'direct';
  static const String system = 'system';
}

/// Превью последнего сообщения в списке чатов (`ChatSummary.lastMessage`).
class LastMessagePreview {
  const LastMessagePreview({
    required this.id,
    required this.authorId,
    required this.text,
    required this.createdAt,
    this.attachmentIds = const <String>[],
  });

  final String id;
  final String authorId;
  final String text;
  final DateTime? createdAt;
  final List<String> attachmentIds;

  static LastMessagePreview? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String id = body['id']?.toString() ?? '';
    if (id.isEmpty) return null;
    return LastMessagePreview(
      id: id,
      authorId: body['authorId']?.toString() ?? '',
      text: body['text']?.toString() ?? '',
      createdAt: parseDate(body['createdAt']),
      attachmentIds: stringList(body['attachmentIds']),
    );
  }
}

/// Элемент списка «мои чаты» (`GET /api/chat/chats`).
///
/// ⚠️ Асимметрия API: этот эндпоинт отдаёт **голый массив**, а не `{items}` —
/// в отличие от остальных списков проекта.
class ChatSummary {
  const ChatSummary({
    required this.id,
    required this.type,
    required this.createdAt,
    required this.unreadCount,
    this.title,
    this.objectId,
    this.ticketId,
    this.lastMessage,
  });

  final String id;

  /// `object` | `ticket` | `direct` | `system`.
  final String type;

  /// Серверное название; у `ticket`/`object` в демо-данных бывает `null`.
  final String? title;

  final String? objectId;
  final String? ticketId;
  final DateTime? createdAt;
  final LastMessagePreview? lastMessage;

  /// Считается сервером по `lastReadAt` участника.
  final int unreadCount;

  bool get hasUnread => unreadCount > 0;

  bool get hasPreview => (lastMessage?.text ?? '').isNotEmpty;

  /// Локальное обновление строки списка при входящем сообщении (`chat.md` §3.1).
  ChatSummary copyWith({LastMessagePreview? lastMessage, int? unreadCount, String? title}) {
    return ChatSummary(
      id: id,
      type: type,
      createdAt: createdAt,
      unreadCount: unreadCount ?? this.unreadCount,
      title: title ?? this.title,
      objectId: objectId,
      ticketId: ticketId,
      lastMessage: lastMessage ?? this.lastMessage,
    );
  }

  static ChatSummary? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String id = body['id']?.toString() ?? '';
    if (id.isEmpty) return null;
    return ChatSummary(
      id: id,
      type: body['type']?.toString() ?? ChatTypes.direct,
      title: _text(body['title']),
      objectId: _text(body['objectId']),
      ticketId: _text(body['ticketId']),
      createdAt: parseDate(body['createdAt']),
      lastMessage: LastMessagePreview.tryParse(body['lastMessage']),
      unreadCount: parseInt(body['unreadCount']),
    );
  }

  /// Голый массив в ответе — разбор отдельным методом (см. замечание к классу).
  static List<ChatSummary> listFrom(dynamic body) {
    if (body is! List) return const <ChatSummary>[];
    final List<ChatSummary> result = <ChatSummary>[];
    for (final dynamic item in body) {
      final ChatSummary? chat = tryParse(item);
      if (chat != null) result.add(chat);
    }
    return result;
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}

/// Участник чата (`ChatDetail.members`).
///
/// ⚠️ Из API приходит только `userId`: имени участника нет (`chat.md` п. 11.7),
/// поэтому показать «Петров Пётр» в шапке и в `direct`-превью пока нечем.
class ChatMember {
  const ChatMember({
    required this.userId,
    this.role,
    this.joinedAt,
    this.lastReadAt,
  });

  final String userId;
  final String? role;
  final DateTime? joinedAt;

  /// «Прочитано до {HH:mm}» — агрегат по участнику (`chat.md` §3.5).
  final DateTime? lastReadAt;

  static ChatMember? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String userId = body['userId']?.toString() ?? '';
    if (userId.isEmpty) return null;
    return ChatMember(
      userId: userId,
      role: body['role']?.toString(),
      joinedAt: parseDate(body['joinedAt']),
      lastReadAt: parseDate(body['lastReadAt']),
    );
  }
}

/// Деталь чата (`GET /api/chat/chats/:id`).
class ChatDetail {
  const ChatDetail({
    required this.id,
    required this.type,
    required this.members,
    this.title,
    this.objectId,
    this.ticketId,
    this.createdAt,
  });

  final String id;
  final String type;
  final String? title;
  final String? objectId;
  final String? ticketId;
  final DateTime? createdAt;
  final List<ChatMember> members;

  /// «Прочитано до {HH:mm}»: самое свежее `lastReadAt` среди **других** участников.
  DateTime? lastReadAtOfOthers(String meId) {
    DateTime? latest;
    for (final ChatMember member in members) {
      if (member.userId == meId) continue;
      final DateTime? readAt = member.lastReadAt;
      if (readAt == null) continue;
      if (latest == null || readAt.isAfter(latest)) latest = readAt;
    }
    return latest;
  }

  static ChatDetail? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String id = body['id']?.toString() ?? '';
    if (id.isEmpty) return null;
    final dynamic rawMembers = body['members'];
    return ChatDetail(
      id: id,
      type: body['type']?.toString() ?? ChatTypes.direct,
      title: ChatSummary._text(body['title']),
      objectId: ChatSummary._text(body['objectId']),
      ticketId: ChatSummary._text(body['ticketId']),
      createdAt: parseDate(body['createdAt']),
      members: rawMembers is List
          ? rawMembers
              .map(ChatMember.tryParse)
              .whereType<ChatMember>()
              .toList(growable: false)
          : const <ChatMember>[],
    );
  }
}

/// Статус доставки сообщения в интерфейсе (`chat.md` §3.5).
///
/// «Доставлено» отдельным статусом пока не показывается: сервер отдаёт
/// `MessageView.deliveredAt` (М6), но UI-состояние между «Отправлено» и
/// «Прочитано» не реализовано (`chat.md` п. 11.2) — две галочки означают
/// «прочитано».
enum ChatMessageStatus {
  pending('pending', 'Отправляется…'),
  sent('sent', 'Отправлено'),
  read('read', 'Прочитано'),
  failed('failed', 'Не отправлено · Повторить');

  const ChatMessageStatus(this.code, this.label);

  final String code;
  final String label;

  static ChatMessageStatus of(String value) => ChatMessageStatus.values.firstWhere(
        (ChatMessageStatus status) => status.code == value,
        orElse: () => ChatMessageStatus.sent,
      );
}

/// Сообщение ленты (`MessageView`) либо локальный пузырь до подтверждения.
///
/// Один тип на оба случая: у локального сообщения `clientId != null`, а `id`
/// равен `clientId` — так пузырь получает `Key('chat_message_bubble_<id>')`
/// ещё до ответа сервера.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.chatId,
    required this.authorId,
    required this.text,
    this.createdAt,
    this.attachmentIds = const <String>[],
    this.clientId,
    this.status = ChatMessageStatus.sent,
  });

  final String id;
  final String chatId;
  final String authorId;
  final String text;
  final DateTime? createdAt;
  final List<String> attachmentIds;

  /// Локальный идентификатор: `null` у сообщений, пришедших с сервера.
  final String? clientId;

  final ChatMessageStatus status;

  bool get isLocal => clientId != null;

  bool get isRead => status == ChatMessageStatus.read;

  bool get isFailed => status == ChatMessageStatus.failed;

  /// «Отправляется…» / «Отправлено» / «Прочитано» / «Не отправлено · Повторить» —
  /// показывается только у своих сообщений.
  bool get showsStatus => isLocal || status == ChatMessageStatus.read;

  ChatMessage copyWith({ChatMessageStatus? status, String? id}) {
    return ChatMessage(
      id: id ?? this.id,
      chatId: chatId,
      authorId: authorId,
      text: text,
      createdAt: createdAt,
      attachmentIds: attachmentIds,
      clientId: clientId,
      status: status ?? this.status,
    );
  }

  static ChatMessage? tryParse(dynamic body, {String? chatId}) {
    if (body is! Map) return null;
    final String id = body['id']?.toString() ?? '';
    if (id.isEmpty) return null;
    return ChatMessage(
      id: id,
      chatId: body['chatId']?.toString() ?? chatId ?? '',
      authorId: body['authorId']?.toString() ?? '',
      text: body['text']?.toString() ?? '',
      createdAt: parseDate(body['createdAt']),
      attachmentIds: stringList(body['attachmentIds']),
    );
  }
}

/// Страница истории: `{items, limit, hasMore, nextBefore}`.
///
/// `items` идут от старых к новым внутри страницы (`chat.md` §3.2).
class ChatMessagesPage {
  const ChatMessagesPage({
    required this.items,
    this.hasMore = false,
    this.nextBefore,
    this.limit = 0,
  });

  const ChatMessagesPage.empty()
      : items = const <ChatMessage>[],
        hasMore = false,
        nextBefore = null,
        limit = 0;

  final List<ChatMessage> items;
  final bool hasMore;

  /// Курсор для следующей страницы (`before`).
  final DateTime? nextBefore;
  final int limit;

  static ChatMessagesPage tryParse(dynamic body, {required String chatId}) {
    if (body is! Map) return const ChatMessagesPage.empty();
    final dynamic rawItems = body['items'];
    final List<ChatMessage> items = rawItems is List
        ? rawItems
            .map((dynamic item) => ChatMessage.tryParse(item, chatId: chatId))
            .whereType<ChatMessage>()
            .toList(growable: false)
        : const <ChatMessage>[];
    return ChatMessagesPage(
      items: items,
      hasMore: body['hasMore'] == true,
      nextBefore: parseDate(body['nextBefore']),
      limit: parseInt(body['limit']),
    );
  }
}

/// Вложение сообщения (`MessageView.attachmentIds` → `GET /api/files/:id`).
///
/// `MessageView` содержит только id файлов, а URL и имя приходят отдельным
/// запросом (`chat.md` п. 11.5) и кладутся в кэш `chat_attachments`; здесь —
/// разобранный ответ, сам кэш живёт в провайдере ленты.
class ChatAttachment {
  const ChatAttachment({
    required this.fileId,
    this.url,
    this.originalName,
    this.thumbnailUrl,
    this.isImage = false,
  });

  final String fileId;
  final String? url;
  final String? thumbnailUrl;
  final String? originalName;

  /// Картинку показываем превью, документ — строкой с именем.
  final bool isImage;

  /// Подпись по спецификации: «📷 Фото» / «📄 Документ» плюс имя файла.
  String get label => isImage ? '📷 Фото' : '📄 Документ';

  String get displayName => originalName ?? url ?? fileId;

  static ChatAttachment? tryParse(String fileId, dynamic body) {
    if (body is! Map) return null;
    final String url = body['url']?.toString() ?? '';
    final String mime = body['mimeType']?.toString() ?? '';
    final String? originalName = _nonEmpty(body['originalName']);
    return ChatAttachment(
      fileId: fileId,
      // Ссылки вложений приходят с хоста file-service; на телефоне `localhost`
      // означает само устройство (см. `ApiConstants.deviceUrl`).
      url: url.isEmpty ? null : ApiConstants.deviceUrl(url),
      thumbnailUrl: _nonEmpty(ApiConstants.deviceUrl(_nonEmpty(body['thumbnailUrl']))),
      originalName: originalName ?? _nameFromUrl(url),
      isImage: mime.startsWith('image/') || _looksLikeImage(originalName ?? url),
    );
  }

  static String? _nonEmpty(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static String? _nameFromUrl(String url) {
    if (url.isEmpty) return null;
    final String name = url.split('/').last.split('?').first;
    return name.isEmpty ? null : name;
  }

  static bool _looksLikeImage(String name) {
    final String lower = name.toLowerCase();
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.heic') ||
        lower.endsWith('.webp');
  }
}

/// `createdAt` в API — ISO-8601 UTC; в модели храним как есть.
DateTime? parseDate(dynamic value) {  if (value is DateTime) return value;
  final String text = value?.toString() ?? '';
  return text.isEmpty ? null : DateTime.tryParse(text);
}

int parseInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

List<String> stringList(dynamic value) {
  if (value is! List) return const <String>[];
  return value.map((dynamic item) => item.toString()).toList(growable: false);
}
