import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../services/api_client.dart';
import '../../../../shared/data/result.dart';
import '../models/chat_models.dart';

/// REST-часть chat-service (`backend/chat-service/src/chats/chats.controller.ts`).
///
/// WebSocket — основной путь отправки и прочтения (`chat.md` §3.4); здесь —
/// список, деталь, история и REST-фолбэк отправки, когда сокет не поднялся.
class ChatRepository {
  ChatRepository(this._api);

  static const String _base = '${ApiConstants.apiPrefix}/chat';

  final ApiClient _api;

  /// `GET /api/chat/chats` → **голый массив** `ChatSummary[]`.
  ///
  /// Черту спецификации подтвердил живой стенд: `{items}` здесь нет (в отличие
  /// от остальных списков проекта). Чужой чат в списке не появится: сервер
  /// отдаёт только чаты, где пользователь участник.
  Future<Result<List<ChatSummary>>> listChats() {
    return guard(() async {
      final response = await _api.get('$_base/chats');
      return ChatSummary.listFrom(response.data);
    });
  }

  /// `GET /api/chat/chats/:id`. Чужой чат → 403 «Вы не участник этого чата».
  Future<Result<ChatDetail>> chatDetail(String chatId) {
    return guard(() async {
      final response = await _api.get('$_base/chats/$chatId');
      final ChatDetail? detail = ChatDetail.tryParse(response.data);
      if (detail == null) {
        throw const ServerException('Некорректный ответ сервера: не удалось разобрать чат');
      }
      return detail;
    });
  }

  /// `GET /api/chat/chats/:id/messages?limit=30&before=<ISO>`.
  ///
  /// Приложение просит 30 сообщений на страницу (`chat.md` §3.2), сервер
  /// ограничивает `limit` сотней (`MAX_PAGE_LIMIT`).
  Future<Result<ChatMessagesPage>> messages(
    String chatId, {
    DateTime? before,
    int limit = 30,
  }) {
    return guard(() async {
      final response = await _api.get(
        '$_base/chats/$chatId/messages',
        query: <String, dynamic>{
          'limit': limit,
          if (before != null) 'before': before.toUtc().toIso8601String(),
        },
      );
      return ChatMessagesPage.tryParse(response.data, chatId: chatId);
    });
  }

  /// `POST /api/chat/chats/:id/messages` — REST-фолбэк (201 `MessageView`).
  Future<Result<ChatMessage>> sendMessage(
    String chatId, {
    required String text,
    List<String> attachmentIds = const <String>[],
  }) {
    return guard(() async {
      final response = await _api.post(
        '$_base/chats/$chatId/messages',
        data: <String, dynamic>{
          'text': text,
          if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
        },
      );
      final ChatMessage? message = ChatMessage.tryParse(response.data, chatId: chatId);
      if (message == null) {
        throw const ServerException('Некорректный ответ сервера: не удалось разобрать сообщение');
      }
      return message;
    });
  }

  /// `POST /api/chat/chats/:id/read` — отметка прочтения (HTTP-путь, `chat.md` §8).
  Future<Result<String>> markRead(String chatId, {required String lastMessageId}) {
    return guard(() async {
      final response = await _api.post(
        '$_base/chats/$chatId/read',
        data: <String, dynamic>{'lastMessageId': lastMessageId},
      );
      final dynamic body = response.data;
      final String readAt = body is Map ? body['readAt']?.toString() ?? '' : '';
      return readAt;
    });
  }
}
