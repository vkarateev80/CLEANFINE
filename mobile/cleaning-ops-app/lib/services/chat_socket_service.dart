import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/constants/api_constants.dart';
import '../features/chat/data/models/chat_models.dart';

/// Событие шлюза чата, приведённое к моделям приложения.
///
/// Имена событий сверены с `backend/chat-service/src/chats/chat.gateway.ts`:
/// клиент шлёт `message:send` и `message:read`, сервер — `message:new`,
/// `message:read`, `user:status`, `error`.
sealed class ChatSocketEvent {
  const ChatSocketEvent();
}

/// Соединение установлено: «в сети» и досылка очереди (`chat.md` §3.4).
class ChatSocketConnected extends ChatSocketEvent {
  const ChatSocketConnected();
}

/// Соединение потеряно: баннер «Нет соединения — сообщения уйдут при подключении».
class ChatSocketDisconnected extends ChatSocketEvent {
  const ChatSocketDisconnected({this.reason});
  final String? reason;
}

/// Идёт попытка подключения: в шапке «соединение…».
class ChatSocketConnecting extends ChatSocketEvent {
  const ChatSocketConnecting();
}

/// `message:new` — новое сообщение чата.
class ChatSocketMessage extends ChatSocketEvent {
  const ChatSocketMessage(this.message);
  final ChatMessage message;
}

/// `message:read` — собеседник прочитал сообщение (`{chatId, messageId, readBy, readAt}`).
class ChatSocketRead extends ChatSocketEvent {
  const ChatSocketRead({
    required this.chatId,
    required this.messageId,
    required this.readBy,
    this.readAt,
  });

  final String chatId;
  final String messageId;
  final String readBy;
  final DateTime? readAt;
}

/// `user:status` — присутствие участника (`{userId, online}`).
class ChatSocketPresence extends ChatSocketEvent {
  const ChatSocketPresence({required this.userId, required this.online});
  final String userId;
  final bool online;
}

/// `error` — сервер отклонил соединение или событие (например, авторизация).
class ChatSocketFailure extends ChatSocketEvent {
  const ChatSocketFailure({required this.message, this.status});
  final String message;
  final int? status;
}

/// Ответ сервера на отправку/прочтение (ack Socket.IO).
class ChatSendAck {
  const ChatSendAck({required this.ok, this.message, this.error});

  const ChatSendAck.success(ChatMessage message) : this(ok: true, message: message);

  const ChatSendAck.failure(String error) : this(ok: false, error: error);

  final bool ok;
  final ChatMessage? message;
  final String? error;
}

/// Транспорт чата. Абстракция, а не класс: тесты подменяют реализацию, не
/// поднимая настоящий сокет, — иначе widget-тест зависел бы от стенда.
abstract class ChatSocket {
  /// Поток событий шлюза (broadcast: слушают и список, и переписка).
  Stream<ChatSocketEvent> get events;

  bool get isConnected;

  /// Подключение к namespace `chat`: `io('$host/chat', auth: {token})`.
  ///
  /// Токен обязателен — шлюз отклоняет соединение без валидного JWT
  /// (`ws-auth.ts`, `authenticateSocket`).
  Future<void> connect(String accessToken);

  Future<void> disconnect();

  /// `emit('message:send', {chatId, text, attachmentIds})` с ожиданием ack.
  ///
  /// `clientMessageId` в payload не уходит: сервер его не принимает
  /// (`parseSendPayload`, `chat.md` п. 11.1) — идентификатор нужен только
  /// приложению, чтобы связать ack с локальным пузырём.
  Future<ChatSendAck> sendMessage({
    required String chatId,
    required String text,
    List<String> attachmentIds = const <String>[],
  });

  /// `emit('message:read', {chatId, lastMessageId})`.
  Future<void> markRead({required String chatId, required String lastMessageId});
}

/// Реализация поверх `socket_io_client` 3.x (`chat.md` §3.4).
///
/// Одно соединение на экран переписки: `dispose` вызывается при уходе с экрана,
/// иначе на телефоне остаётся висеть сокет и расходоваться батарея.
class SocketIoChatSocket implements ChatSocket {
  SocketIoChatSocket({String? baseUrl, io.Socket? socket, this.ackTimeout = const Duration(seconds: 15)})
      : _baseUrl = baseUrl ?? ApiConstants.chatBaseUrl,
        _socket = socket;

  /// Namespace шлюза (`CHAT_NAMESPACE` в `ws-auth.ts`).
  static const String namespace = 'chat';

  /// Хост WebSocket: тот же, что у REST chat-service, но без `http://`-схемы
  /// его понимает и `io()` — оставляем адрес как есть и добавляем namespace.
  final String _baseUrl;

  /// Готовый сокет (тесты и повторное подключение с обновлённым токеном).
  io.Socket? _socket;

  /// Сколько ждать ack, прежде чем считать отправку неуспешной.
  final Duration ackTimeout;

  final StreamController<ChatSocketEvent> _events =
      StreamController<ChatSocketEvent>.broadcast();

  bool _connected = false;
  String? _token;

  @override
  Stream<ChatSocketEvent> get events => _events.stream;

  @override
  bool get isConnected => _connected;

  /// Адрес подключения: `http://host:3009/chat`.
  String get url => '$_baseUrl/$namespace';

  @override
  Future<void> connect(String accessToken) async {
    if (_connected || (_socket != null && _token == accessToken)) {
      if (!_connected) _socket?.connect();
      return;
    }
    _token = accessToken;
    _events.add(const ChatSocketConnecting());

    final io.Socket socket = _socket ?? io.io(
          url,
          io.OptionBuilder()
              // Только websocket: polling в мобильной сети даёт лишние запросы.
              .setTransports(<String>['websocket'])
              // Основной путь авторизации — auth-payload, не `?token=` в query:
              // query попадает в логи прокси, а access-токен — полный доступ.
              .setAuth(<String, dynamic>{'token': accessToken})
              .disableAutoConnect()
              .enableReconnection()
              .build(),
        );
    _socket = socket;
    _bind(socket);
    socket.connect();
  }

  void _bind(io.Socket socket) {
    socket.onConnect((dynamic _) {
      _connected = true;
      _events.add(const ChatSocketConnected());
    });
    socket.onDisconnect((dynamic reason) {
      _connected = false;
      _events.add(ChatSocketDisconnected(reason: reason?.toString()));
    });
    socket.onConnectError((dynamic error) {
      _connected = false;
      _events.add(ChatSocketFailure(message: error?.toString() ?? 'Нет соединения'));
    });
    socket.on('message:new', (dynamic data) {
      final ChatMessage? message = ChatMessage.tryParse(data);
      if (message != null) _events.add(ChatSocketMessage(message));
    });
    socket.on('message:read', (dynamic data) {
      if (data is! Map) return;
      final String messageId = data['messageId']?.toString() ?? '';
      if (messageId.isEmpty) return;
      _events.add(
        ChatSocketRead(
          chatId: data['chatId']?.toString() ?? '',
          messageId: messageId,
          readBy: data['readBy']?.toString() ?? '',
          readAt: parseDate(data['readAt']),
        ),
      );
    });
    socket.on('user:status', (dynamic data) {
      if (data is! Map) return;
      final String userId = data['userId']?.toString() ?? '';
      if (userId.isEmpty) return;
      _events.add(
        ChatSocketPresence(userId: userId, online: data['online'] == true),
      );
    });
    socket.on('error', (dynamic data) {
      final String message = data is Map
          ? data['message']?.toString() ?? 'Ошибка соединения'
          : data?.toString() ?? 'Ошибка соединения';
      _events.add(ChatSocketFailure(message: message));
    });
  }

  @override
  Future<ChatSendAck> sendMessage({
    required String chatId,
    required String text,
    List<String> attachmentIds = const <String>[],
  }) async {
    final io.Socket? socket = _socket;
    if (socket == null || !_connected) {
      return const ChatSendAck.failure('Нет соединения');
    }
    final Completer<ChatSendAck> completer = Completer<ChatSendAck>();
    socket.emitWithAck(
      'message:send',
      <String, dynamic>{
        'chatId': chatId,
        'text': text,
        if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
      },
      ack: (dynamic response) {
        if (completer.isCompleted) return;
        completer.complete(_parseAck(response, chatId));
      },
    );
    return completer.future.timeout(
      ackTimeout,
      onTimeout: () => const ChatSendAck.failure('Сервер не подтвердил отправку'),
    );
  }

  /// Ack шлюза: `{ok: true, message}` либо `{ok: false, error, status?}`.
  ChatSendAck _parseAck(dynamic response, String chatId) {
    if (response is! Map) return const ChatSendAck.failure('Некорректный ответ сервера');
    if (response['ok'] == true) {
      final ChatMessage? message = ChatMessage.tryParse(response['message'], chatId: chatId);
      if (message == null) return const ChatSendAck.failure('Некорректный ответ сервера');
      return ChatSendAck.success(message);
    }
    return ChatSendAck.failure(response['error']?.toString() ?? 'Не удалось отправить сообщение');
  }

  @override
  Future<void> markRead({required String chatId, required String lastMessageId}) async {
    final io.Socket? socket = _socket;
    if (socket == null || !_connected) return;
    socket.emit('message:read', <String, dynamic>{
      'chatId': chatId,
      'lastMessageId': lastMessageId,
    });
  }

  @override
  Future<void> disconnect() async {
    _connected = false;
    // `dispose` (а не `disconnect`): он снимает слушатели и уничтожает сокет,
    // поэтому следующий вход в чат поднимает соединение с нуля.
    _socket?.dispose();
    _socket = null;
    _token = null;
  }
}

final chatSocketProvider = Provider<ChatSocket>((Ref ref) {
  final ChatSocket socket = SocketIoChatSocket();
  ref.onDispose(socket.disconnect);
  return socket;
});
