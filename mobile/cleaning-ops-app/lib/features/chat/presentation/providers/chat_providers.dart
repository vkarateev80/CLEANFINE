import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/failures.dart';
import '../../../../database/database_provider.dart';
import '../../../../services/api_client.dart';
import '../../../../services/chat_socket_service.dart';
import '../../../../services/service_providers.dart';
import '../../../../shared/data/result.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/chat_message_store.dart';
import '../../data/chat_outbox.dart';
import '../../data/models/chat_models.dart';
import '../../data/repositories/chat_repository.dart';
import '../chat_texts.dart';

/// REST chat-service.
final chatRepositoryProvider = Provider<ChatRepository>((Ref ref) {
  return ChatRepository(ref.watch(chatApiProvider));
});

/// Локальная лента чата (`chat_messages`, DS-002 `offline.md` §3).
final chatMessageStoreProvider = Provider<ChatMessageStore>((Ref ref) {
  return ChatMessageStore(ref.watch(appDatabaseProvider));
});

/// Отправка сообщений «через очередь»: локальный пузырь + `pending_actions`.
final chatOutboxProvider = Provider<ChatOutbox>((Ref ref) {
  return ChatOutbox(
    store: ref.watch(chatMessageStoreProvider),
    queue: ref.watch(pendingActionQueueProvider),
    socket: ref.watch(chatSocketProvider),
    rest: ref.watch(chatRepositoryProvider),
  );
});

/// Открытый сейчас чат: по нему список чатов не накручивает непрочитанные
/// (`chat.md` §3.1).
final activeChatIdProvider = StateProvider<String?>((Ref ref) {
  ref.watch(sessionScopeProvider);
  return null;
});

/// Черновики сообщений по чатам (`chat.md` §3.2).
///
/// ⚠️ Живут в памяти приложения: таблицы черновиков нет в списке локального
/// хранения (`offline.md` §3), поэтому после перезапуска черновик не
/// восстанавливается — это зафиксировано в отчёте по вехе.
class ChatDraftsController extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() {
    // Данные пользователя: выход и вход другого пересобирают провайдер с нуля.
    ref.watch(sessionScopeProvider);
    return const <String, String>{};
  }

  void save(String chatId, String text) {
    if (text.isEmpty) {
      if (!state.containsKey(chatId)) return;
      state = <String, String>{...state}..remove(chatId);
      return;
    }
    state = <String, String>{...state, chatId: text};
  }

  void clear(String chatId) => save(chatId, '');
}

final chatDraftsProvider = NotifierProvider<ChatDraftsController, Map<String, String>>(
  ChatDraftsController.new,
);

/// Счётчик непрочитанных для бейджа таба «Чаты» (`chat.md` §1.1).
///
/// Обновляется контроллером списка после успешной загрузки: бейдж в каркасе не
/// запускает запрос сам, иначе список чатов грузился бы на каждом экране.
class ChatUnreadBadgeController extends Notifier<int> {
  @override
  int build() {
    ref.watch(sessionScopeProvider);
    return 0;
  }

  void set(int value) {
    if (state == value) return;
    state = value;
  }
}

final chatUnreadBadgeProvider = NotifierProvider<ChatUnreadBadgeController, int>(
  ChatUnreadBadgeController.new,
);

/// Список чатов оператора (DS-002 `chat.md` §3.1).
///
/// Ответ сервера — **голый массив** `ChatSummary[]`, а не `{items}`: так делает
/// только этот эндпоинт (проверено на живом стенде).
class ChatsListController extends AsyncNotifier<List<ChatSummary>> {
  @override
  Future<List<ChatSummary>> build() async {
    ref.watch(sessionScopeProvider);
    // Любое входящее сообщение перестраивает список: последнее сообщение и
    // счётчик непрочитанных обновляются локально (`chat.md` §3.1).
    final ChatSocket socket = ref.watch(chatSocketProvider);
    final StreamSubscription<ChatSocketEvent> subscription =
        socket.events.listen(_onSocketEvent);
    ref.onDispose(subscription.cancel);
    return _load();
  }

  Future<List<ChatSummary>> _load() async {
    final Result<List<ChatSummary>> result = await ref.read(chatRepositoryProvider).listChats();
    final Failure? failure = result.failureOrNull;
    if (failure != null) throw failure;
    final List<ChatSummary> chats = result.dataOrNull ?? const <ChatSummary>[];
    _publishUnread(chats);
    return chats;
  }

  /// Pull-to-refresh и возврат из переписки: серверный `unreadCount` важнее
  /// локально накрученного (`chat.md` п. 11.8).
  Future<void> refresh() async {
    final List<ChatSummary> chats = await _load();
    try {
      state = AsyncData<List<ChatSummary>>(chats);
    } on StateError {
      // Провайдер закрыт — обновлять нечего.
    }
  }

  /// Тихий проход: ошибку не показываем, на экране уже есть данные.
  Future<void> refreshQuietly() async {
    try {
      await refresh();
    } on Object {
      return;
    }
  }

  void _onSocketEvent(ChatSocketEvent event) {
    // Удалённое сообщение могло быть превью чата — список перечитываем с сервера.
    if (event is ChatSocketDeleted) {
      unawaited(refreshQuietly());
      return;
    }
    if (event is! ChatSocketMessage) return;
    final List<ChatSummary>? current = state.valueOrNull;
    if (current == null) return;
    final ChatMessage message = event.message;
    final String? activeChatId = ref.read(activeChatIdProvider);

    state = AsyncData<List<ChatSummary>>(
      current
          .map(
            (ChatSummary chat) => chat.id == message.chatId
                ? chat.copyWith(
                    lastMessage: LastMessagePreview(
                      id: message.id,
                      authorId: message.authorId,
                      text: message.text.isEmpty && message.attachmentIds.isNotEmpty
                          ? '📎 Вложение'
                          : message.text,
                      createdAt: message.createdAt,
                      attachmentIds: message.attachmentIds,
                    ),
                    unreadCount: activeChatId == message.chatId
                        ? chat.unreadCount
                        : chat.unreadCount + 1,
                  )
                : chat,
          )
          .toList(growable: false),
    );
    _publishUnread(state.valueOrNull ?? const <ChatSummary>[]);
  }

  void _publishUnread(List<ChatSummary> chats) {
    ref.read(chatUnreadBadgeProvider.notifier).set(sumUnread(chats));
  }
}

final chatsListProvider = AsyncNotifierProvider<ChatsListController, List<ChatSummary>>(
  ChatsListController.new,
);

/// `sum(ChatSummary.unreadCount)` — индикатор непрочитанных (`chat.md` §1.1).
int sumUnread(List<ChatSummary> chats) =>
    chats.fold<int>(0, (int total, ChatSummary chat) => total + chat.unreadCount);

/// Состояние соединения переписки (`chat.md` §3.4, §5).
enum ChatConnection {
  connecting('соединение…'),
  online('в сети'),
  offline('был(а) недавно');

  const ChatConnection(this.label);

  final String label;
}

/// Состояние экрана переписки.
class ChatThreadState {
  const ChatThreadState({
    required this.detail,
    required this.messages,
    this.hasMore = false,
    this.nextBefore,
    this.connection = ChatConnection.connecting,
    this.onlineUsers = const <String>{},
    this.historyFailure,
    this.sendError,
    this.loadingMore = false,
    this.lastSentReadId,
  });

  final ChatDetail detail;

  /// Лента от старых к новым (рисуется `ListView(reverse: true)`).
  final List<ChatMessage> messages;

  final bool hasMore;
  final DateTime? nextBefore;
  final ChatConnection connection;
  final Set<String> onlineUsers;

  /// Ошибка истории сообщений: шапка и composer остаются, лента — с баннером
  /// (`chat.md` §5, «Ошибка истории»).
  final Failure? historyFailure;

  /// Текст ошибки отправки (пустое сообщение, слишком длинное, отказ сервера).
  final String? sendError;

  final bool loadingMore;

  /// Последнее сообщение, за которое уже отправлено `message:read`
  /// (`chat.md` §3.5: повторно за то же сообщение не отправляем).
  final String? lastSentReadId;

  /// Участники чата, кроме меня.
  List<ChatMember> others(String meId) =>
      detail.members.where((ChatMember member) => member.userId != meId).toList(growable: false);

  ChatThreadState copyWith({
    ChatDetail? detail,
    List<ChatMessage>? messages,
    bool? hasMore,
    DateTime? nextBefore,
    bool clearNextBefore = false,
    ChatConnection? connection,
    Set<String>? onlineUsers,
    Failure? historyFailure,
    bool clearHistoryFailure = false,
    String? sendError,
    bool clearSendError = false,
    bool? loadingMore,
    String? lastSentReadId,
  }) {
    return ChatThreadState(
      detail: detail ?? this.detail,
      messages: messages ?? this.messages,
      hasMore: hasMore ?? this.hasMore,
      nextBefore: clearNextBefore ? null : nextBefore ?? this.nextBefore,
      connection: connection ?? this.connection,
      onlineUsers: onlineUsers ?? this.onlineUsers,
      historyFailure: clearHistoryFailure ? null : historyFailure ?? this.historyFailure,
      sendError: clearSendError ? null : sendError ?? this.sendError,
      loadingMore: loadingMore ?? this.loadingMore,
      lastSentReadId: lastSentReadId ?? this.lastSentReadId,
    );
  }
}

/// Переписка `/chats/:chatId`: история, отправка, доставка и прочтение.
class ChatThreadController extends FamilyAsyncNotifier<ChatThreadState, String> {
  String get _chatId => arg;

  String get _meId => ref.read(sessionProvider).userId ?? '';

  @override
  Future<ChatThreadState> build(String arg) async {
    ref.watch(sessionScopeProvider);
    final String chatId = arg;
    // 403 «Вы не участник этого чата» приходит именно здесь — экран покажет
    // «Чат недоступен» без composer (`chat.md` §5, §10.3).
    final Result<ChatDetail> detailResult = await ref.read(chatRepositoryProvider).chatDetail(chatId);
    final Failure? detailFailure = detailResult.failureOrNull;
    if (detailFailure != null) throw detailFailure;
    final ChatDetail detail = detailResult.dataOrNull!;

    final ChatSocket socket = ref.watch(chatSocketProvider);
    final StreamSubscription<ChatSocketEvent> subscription =
        socket.events.listen(_onSocketEvent);
    ref.onDispose(subscription.cancel);

    // История: ошибка не роняет экран — лента покажет баннер и «Повторить».
    final Result<ChatMessagesPage> pageResult =
        await ref.read(chatRepositoryProvider).messages(chatId, limit: _pageSize);
    ChatThreadState state = ChatThreadState(
      detail: detail,
      messages: await _merged(pageResult.dataOrNull?.items ?? const <ChatMessage>[]),
      hasMore: pageResult.dataOrNull?.hasMore ?? false,
      nextBefore: pageResult.dataOrNull?.nextBefore,
      historyFailure: pageResult.failureOrNull,
    );

    // Сокет поднимаем только при наличии access-токена (`chat.md` §3.4).
    final String? token = await _accessToken();
    if (token != null) {
      unawaited(_connect(socket, token));
    } else {
      state = state.copyWith(connection: ChatConnection.offline);
    }
    return state;
  }

  static const int _pageSize = 30;

  Future<String?> _accessToken() async {
    try {
      return await ref.read(secureStorageProvider).readAccessToken();
    } on Object {
      return null;
    }
  }

  Future<void> _connect(ChatSocket socket, String token) async {
    try {
      await socket.connect(token);
    } on Object {
      // Ошибку соединения покажет баннер: событие `disconnected` придёт само.
    }
  }

  /// Сокет: соединение, входящие, прочтение, присутствие (`chat.md` §3.4).
  void _onSocketEvent(ChatSocketEvent event) {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null) return;

    switch (event) {
      case ChatSocketConnecting():
        _setState(current.copyWith(connection: ChatConnection.connecting));
      case ChatSocketConnected():
        _setState(current.copyWith(connection: ChatConnection.online));
        // «Досылка очереди сообщений этого чата» — сразу после подключения.
        // Пока сокета не было (фон, смена сети, перезапуск сервера), входящие
        // сюда не приходили — после переподключения дочитываем их из истории.
        // Строго после досылки: она пишет ленту из своего снимка и затёрла бы
        // дочитанное.
        final bool resync = _wasDisconnected;
        _wasDisconnected = false;
        unawaited(_flush().then((_) => resync ? _resyncLatest() : null));
      case ChatSocketDisconnected():
        _wasDisconnected = true;
        _setState(current.copyWith(connection: ChatConnection.offline));
      case ChatSocketMessage(:final ChatMessage message):
        if (message.chatId != _chatId || message.authorId == _meId) return;
        _setState(
          current.copyWith(messages: _sorted(<ChatMessage>[...current.messages, message])),
        );
      case ChatSocketRead(:final String messageId):
        _markReadByPeer(current, messageId);
      case ChatSocketDeleted(:final String chatId, :final String messageId):
        if (chatId != _chatId) return;
        _removeDeleted(current, messageId);
      case ChatSocketPresence(:final String userId, :final bool online):
        final Set<String> users = <String>{...current.onlineUsers};
        if (online) {
          users.add(userId);
        } else {
          users.remove(userId);
        }
        _setState(current.copyWith(onlineUsers: users));
      case ChatSocketFailure(:final String message, :final int? status):
        _wasDisconnected = true;
        // Ошибка авторизации: обновляем токен и переподключаемся.
        if (status == 401 || message.contains('авторизован')) unawaited(_reconnect());
    }
  }

  /// Был ли разрыв с прошлого подключения: тогда история дочитывается.
  bool _wasDisconnected = false;

  /// Когда последний раз обновляли токен ради сокета: шлюз отклоняет
  /// соединение двумя событиями подряд (`error` + disconnect), а refresh
  /// нужен один — и не чаще раза в 10 с, если сервер упорно отказывает.
  DateTime? _lastAuthRefresh;

  /// Access-токен живёт 15 минут, в хранилище после него лежит просроченный —
  /// сначала refresh (тот же, что у HTTP при 401), потом новое соединение.
  Future<void> _reconnect() async {
    final DateTime now = DateTime.now();
    final DateTime? last = _lastAuthRefresh;
    if (last != null && now.difference(last) < const Duration(seconds: 10)) return;
    _lastAuthRefresh = now;
    final bool refreshed = await ref.read(sessionBridgeProvider).refresh();
    if (!refreshed) return;
    final ChatSocket socket = ref.read(chatSocketProvider);
    final String? token = await _accessToken();
    if (token == null) return;
    await socket.disconnect();
    await _connect(socket, token);
  }

  /// Свежая страница истории поверх ленты: новые сообщения добавляются,
  /// уже подгруженные «вверх» страницы остаются. Ошибка — без баннера:
  /// лента уже на экране, следующий заход в чат перечитает её целиком.
  Future<void> _resyncLatest() async {
    final Result<ChatMessagesPage> result =
        await ref.read(chatRepositoryProvider).messages(_chatId, limit: _pageSize);
    final ChatMessagesPage? page = result.dataOrNull;
    final ChatThreadState? current = state.valueOrNull;
    if (page == null || current == null) return;
    final Set<String> fresh = page.items.map((ChatMessage m) => m.id).toSet();
    final List<ChatMessage> older = current.messages
        .where((ChatMessage m) => !m.isLocal && !fresh.contains(m.id))
        .toList(growable: false);
    final List<ChatMessage> merged = await _merged(<ChatMessage>[...older, ...page.items]);
    final ChatThreadState latest = state.valueOrNull ?? current;
    _setState(latest.copyWith(messages: merged));
  }

  /// `message:deleted` от администратора: пузырь исчезает у всех участников,
  /// локальная копия (drift) удаляется — иначе она вернулась бы при слиянии.
  void _removeDeleted(ChatThreadState current, String messageId) {
    final List<ChatMessage> updated = current.messages
        .where((ChatMessage message) => message.id != messageId)
        .toList(growable: false);
    if (updated.length == current.messages.length) return;
    _setState(current.copyWith(messages: updated));
    unawaited(ref.read(chatMessageStoreProvider).deleteByServerId(messageId));
  }

  /// `message:read` от собеседника: у своих сообщений статус «Прочитано».
  void _markReadByPeer(ChatThreadState current, String messageId) {
    final List<ChatMessage> updated = current.messages
        .map(
          (ChatMessage message) => message.id == messageId
              ? message.copyWith(status: ChatMessageStatus.read)
              : message,
        )
        .toList(growable: false);
    _setState(current.copyWith(messages: updated));
    unawaited(ref.read(chatMessageStoreProvider).markReadByServerId(messageId));
  }

  void _setState(ChatThreadState next) {
    try {
      state = AsyncData<ChatThreadState>(next);
    } on StateError {
      // Провайдер закрыт — обновлять нечего.
    }
  }

  /// Досылка очереди этого чата (после `onConnect` и по кнопке «Повторить»).
  Future<void> _flush() async {
    try {
      await ref.read(chatOutboxProvider).flushChat(_chatId);
    } on Object {
      return;
    }
    await reloadLocalMessages();
  }

  /// Локальные сообщения из drift — то, что показывает «Отправляется…».
  Future<List<ChatMessage>> _localMessages() async {
    final List<LocalChatMessage> rows =
        await ref.read(chatMessageStoreProvider).forChat(_chatId);
    return rows.map((LocalChatMessage row) => row.toMessage()).toList(growable: false);
  }

  /// Слияние истории сервера и локальных пузырей.
  ///
  /// Сообщение, уже подтверждённое сервером (`serverId` в истории), берётся из
  /// истории: она источник правды по тексту, времени и `deliveredAt`.
  Future<List<ChatMessage>> _merged(List<ChatMessage> serverMessages) async {
    final List<ChatMessage> local = await _localMessages();
    final List<ChatMessage> server = _deriveStatuses(serverMessages);
    final Set<String> serverIds = server.map((ChatMessage m) => m.id).toSet();
    final List<ChatMessage> pending = local
        .where((ChatMessage message) => !serverIds.contains(message.id))
        .toList(growable: false);
    return _sorted(<ChatMessage>[...server, ...pending]);
  }

  /// Свои сообщения из истории: серверный `deliveredAt` → «Доставлено».
  /// Приоритеты: pending/fail живут только локально, «Прочитано» приходит
  /// живым событием и здесь не встретится, у чужих сообщений статус не наш.
  List<ChatMessage> _deriveStatuses(List<ChatMessage> serverMessages) {
    return serverMessages.map((ChatMessage message) {
      if (message.authorId != _meId) return message;
      if (message.status != ChatMessageStatus.sent) return message;
      if (message.deliveredAt == null) return message;
      return message.copyWith(status: ChatMessageStatus.delivered);
    }).toList(growable: false);
  }

  static List<ChatMessage> _sorted(List<ChatMessage> messages) {
    final List<ChatMessage> list = <ChatMessage>[...messages];
    list.sort((ChatMessage a, ChatMessage b) {
      final DateTime left = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final DateTime right = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return left.compareTo(right);
    });
    return list;
  }

  /// Перечитать локальные пузыри (после досылки статусы изменились).
  Future<void> reloadLocalMessages() async {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null) return;
    final List<ChatMessage> serverMessages = current.messages
        .where((ChatMessage message) => !message.isLocal)
        .toList(growable: false);
    final List<ChatMessage> merged = await _merged(serverMessages);
    _setState(current.copyWith(messages: merged));
  }

  /// Подгрузка истории вверх: `before = nextBefore` (`chat.md` §3.2).
  Future<void> loadMore() async {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null || current.loadingMore || !current.hasMore) return;
    final DateTime? before = current.nextBefore;
    if (before == null) return;

    _setState(current.copyWith(loadingMore: true));
    final Result<ChatMessagesPage> result =
        await ref.read(chatRepositoryProvider).messages(_chatId, before: before, limit: _pageSize);
    final ChatMessagesPage page = result.dataOrNull ?? const ChatMessagesPage.empty();
    final ChatThreadState latest = state.valueOrNull ?? current;
    _setState(
      latest.copyWith(
        messages: _sorted(<ChatMessage>[..._deriveStatuses(page.items), ...latest.messages]),
        hasMore: page.hasMore,
        nextBefore: page.nextBefore,
        clearNextBefore: page.nextBefore == null,
        loadingMore: false,
        historyFailure: result.failureOrNull,
        clearHistoryFailure: result.failureOrNull == null,
      ),
    );
  }

  /// Повторная загрузка переписки после ошибки («Повторить»).
  Future<void> retryHistory() async {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null) return;
    final Result<ChatMessagesPage> result =
        await ref.read(chatRepositoryProvider).messages(_chatId, limit: _pageSize);
    final ChatMessagesPage page = result.dataOrNull ?? const ChatMessagesPage.empty();
    final ChatThreadState latest = state.valueOrNull ?? current;
    _setState(
      latest.copyWith(
        messages: await _merged(page.items),
        hasMore: page.hasMore,
        nextBefore: page.nextBefore,
        clearNextBefore: page.nextBefore == null,
        historyFailure: result.failureOrNull,
        clearHistoryFailure: result.failureOrNull == null,
      ),
    );
  }

  /// Границы сообщения (DS-002 `chat.md` §3.3).
  static const int maxMessageLength = 4000;
  static const int maxAttachments = 20;

  /// Отправка: optimistic-пузырь → WS → очередь при отсутствии соединения
  /// (`chat.md` §3.4).
  Future<bool> send(String text, {List<String> attachmentIds = const <String>[]}) async {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null) return false;

    final String trimmed = text.trim();
    // Пустой текст допустим, если есть вложения (сервер — так же, 12.10.2026).
    if (trimmed.isEmpty && attachmentIds.isEmpty) {
      _setState(current.copyWith(sendError: ChatTexts.emptyMessage));
      return false;
    }
    if (trimmed.length > maxMessageLength) {
      _setState(current.copyWith(sendError: ChatTexts.tooLongMessage));
      return false;
    }
    if (attachmentIds.length > maxAttachments) {
      _setState(current.copyWith(sendError: ChatTexts.tooManyAttachments));
      return false;
    }

    final ChatMessageStore store = ref.read(chatMessageStoreProvider);
    final String clientId = store.newClientId();
    // 1) optimistic-пузырь «Отправляется…».
    final LocalChatMessage local = await store.append(
      chatId: _chatId,
      text: trimmed,
      clientId: clientId,
      authorId: _meId,
      attachmentIds: attachmentIds,
    );
    final ChatThreadState afterAppend = state.valueOrNull ?? current;
    _setState(
      afterAppend.copyWith(
        messages: _sorted(<ChatMessage>[...afterAppend.messages, local.toMessage()]),
        clearSendError: true,
      ),
    );

    // 2) основной путь — сокет с ack.
    final ChatSocket socket = ref.read(chatSocketProvider);
    if (socket.isConnected) {
      final ChatSendAck ack = await socket.sendMessage(
        chatId: _chatId,
        text: trimmed,
        attachmentIds: attachmentIds,
        clientMessageId: clientId,
      );
      final ChatMessage? message = ack.message;
      if (ack.ok && message != null) {
        await store.markSent(clientId, serverId: message.id);
        // Получатель онлайн → сервер вернул `deliveredAt` уже в ack.
        final ChatMessageStatus acked = message.deliveredAt != null
            ? ChatMessageStatus.delivered
            : ChatMessageStatus.sent;
        if (acked == ChatMessageStatus.delivered) {
          await store.markStatus(clientId, acked);
        }
        _applyStatus(clientId, acked, serverId: message.id);
        return true;
      }
      if (ack.error != null) {
        await store.markStatus(clientId, ChatMessageStatus.failed);
        _applyStatus(clientId, ChatMessageStatus.failed);
        final ChatThreadState failed = state.valueOrNull ?? current;
        _setState(failed.copyWith(sendError: ack.error));
        return false;
      }
    }

    // 3) соединения нет — запись в очередь, уйдёт при подключении.
    await ref.read(chatOutboxProvider).enqueue(
      chatId: _chatId,
      text: trimmed,
      clientId: clientId,
      authorId: _meId,
      attachmentIds: attachmentIds,
      createdAt: local.createdAtLocal,
    );
    return true;
  }

  /// «Повторить» в пузыре (`chat.md` §4): тот же текст с тем же `clientMessageId`.
  Future<void> retry(String clientId) async {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null) return;
    _setState(
      current.copyWith(
        messages: current.messages
            .map(
              (ChatMessage message) => message.clientId == clientId
                  ? message.copyWith(status: ChatMessageStatus.pending)
                  : message,
            )
            .toList(growable: false),
        clearSendError: true,
      ),
    );
    await ref.read(chatOutboxProvider).retryClientMessage(_chatId, clientId);
    await reloadLocalMessages();
  }

  void _applyStatus(String clientId, ChatMessageStatus status, {String? serverId}) {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null) return;
    _setState(
      current.copyWith(
        messages: current.messages
            .map(
              (ChatMessage message) => message.clientId == clientId
                  ? message.copyWith(status: status, id: serverId)
                  : message,
            )
            .toList(growable: false),
      ),
    );
  }

  /// Отметка прочтения (`chat.md` §3.5): вызывается экраном, когда входящее
  /// сообщение видно и приложение на переднем плане.
  ///
  /// Повторно за то же сообщение не отправляем — держим `lastSentReadId`.
  Future<void> markRead(String messageId) async {
    final ChatThreadState? current = state.valueOrNull;
    if (current == null || messageId.isEmpty) return;
    if (current.lastSentReadId == messageId) return;
    _setState(current.copyWith(lastSentReadId: messageId));

    final ChatSocket socket = ref.read(chatSocketProvider);
    if (socket.isConnected) {
      await socket.markRead(chatId: _chatId, lastMessageId: messageId);
    } else {
      // HTTP-путь, когда сокет не поднялся (`chat.md` §8).
      await ref.read(chatRepositoryProvider).markRead(_chatId, lastMessageId: messageId);
    }
    // Прочтение изменило `unreadCount` на сервере — список чатов перечитываем.
    // Провайдер списка мог быть закрыт (экран переписки открыт глубокой ссылкой).
    try {
      unawaited(ref.read(chatsListProvider.notifier).refreshQuietly());
    } on StateError {
      return;
    }
  }
}

final chatThreadProvider =
    AsyncNotifierProvider.family<ChatThreadController, ChatThreadState, String>(
  ChatThreadController.new,
);

/// Кэш вложений: `MessageView.attachmentIds` — только id файлов, URL и имя
/// приходят из `GET /api/files/:id` (`chat.md` §3.2, п. 11.5).
class ChatAttachmentResolver {
  ChatAttachmentResolver(this._api);

  final ApiClient _api;
  final Map<String, ChatAttachment> _cache = <String, ChatAttachment>{};

  ChatAttachment? cached(String fileId) => _cache[fileId];

  /// Best-effort: недоступный файл не должен ломать ленту — покажем подпись
  /// «📄 Документ» без имени.
  Future<ChatAttachment?> resolve(String fileId) async {
    final ChatAttachment? cachedValue = _cache[fileId];
    if (cachedValue != null) return cachedValue;
    try {
      final response = await _api.get('${ApiConstants.apiPrefix}/files/$fileId');
      final ChatAttachment? attachment = ChatAttachment.tryParse(fileId, response.data);
      if (attachment != null) _cache[fileId] = attachment;
      return attachment;
    } on Object {
      return null;
    }
  }
}

final chatAttachmentResolverProvider = Provider<ChatAttachmentResolver>((Ref ref) {
  ref.watch(sessionScopeProvider);
  return ChatAttachmentResolver(ref.watch(filesApiProvider));
});
