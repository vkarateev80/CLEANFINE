import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/features/chat/data/chat_message_store.dart';
import 'package:cleaning_ops_app/features/chat/data/models/chat_models.dart';
import 'package:cleaning_ops_app/features/chat/presentation/pages/chat_thread_page.dart';
import 'package:cleaning_ops_app/features/chat/presentation/providers/chat_providers.dart';
import 'package:cleaning_ops_app/services/chat_socket_service.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:cleaning_ops_app/services/service_providers.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';
import '../../helpers/chat_fakes.dart';
import '../../helpers/offline_fakes.dart';
import '../../helpers/screen_harness.dart';

/// М6.8: переписка `/chats/:chatId` — DS-002 `chat.md` §3.2–§3.5, §10.
///
/// База — настоящий drift в памяти: проверяется и запись в `pending_actions`, и
/// локальная лента `chat_messages`. Сеть и сокет подменены.
///
/// Уборка (снять дерево, закрыть базу) выполняется **внутри тела теста** — иначе
/// `close()` в `tearDown` не завершается никогда (грабли М6.7, см.
/// `test/helpers/screen_harness.dart`).
void chatScreenTest(
  String description,
  FakeChatRepository repository, {
  bool online = true,
  bool socketConnected = false,
  List<Override> extraOverrides = const <Override>[],
  required Future<void> Function(
          WidgetTester tester, ProviderContainer container)
      body,
}) {
  testWidgets(description, (WidgetTester tester) async {
    final AppDatabase database = AppDatabase.memory();
    final FakeChatSocket socket = FakeChatSocket(connected: socketConnected);
    final InMemorySecureStorage storage = InMemorySecureStorage()
      ..values[StorageKeys.accessToken] = 'access-token';
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        appDatabaseProvider.overrideWithValue(database),
        chatRepositoryProvider.overrideWithValue(repository),
        chatSocketProvider.overrideWithValue(socket),
        secureStorageProvider.overrideWithValue(storage),
        connectivityServiceProvider
            .overrideWithValue(FakeConnectivityService(online: online)),
        ...extraOverrides,
      ],
    );
    // Мой id: «свои» пузыри, «Вы: {текст}» и отметка прочтения зависят от него.
    container.read(sessionProvider.notifier).state = const SessionState(
      status: SessionStatus.authenticated,
      userId: 'me',
      role: 'OPERATOR',
    );

    try {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: const ChatThreadPage(chatId: 'chat-1'),
            // Сокет и хранилище нужны тесту напрямую.
            builder: (BuildContext context, Widget? child) =>
                child ?? const SizedBox.shrink(),
          ),
        ),
      );
      await settle(tester);
      await body(tester, container);
    } finally {
      await disposeScreen(tester);
      container.dispose();
      await closeDatabase(database);
    }
  });
}

Future<void> settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

/// Сегодняшний полдень (+сдвиг): метка «Сегодня» не зависит от времени запуска —
/// «now минуты» около 00:00 перепрыгивают на вчера и роняют тест.
DateTime _todayNoon({int addMinutes = 0}) {
  final DateTime now = DateTime.now();
  return DateTime(now.year, now.month, now.day, 12, 0)
      .add(Duration(minutes: addMinutes));
}

void main() {
  testWidgets(
      'лента: входящее, моё сообщение, разделитель дня, «Начало переписки»', (
    WidgetTester tester,
  ) async {
    final AppDatabase database = AppDatabase.memory();
    final FakeChatSocket socket = FakeChatSocket();
    final FakeChatRepository repository = FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
        // Даты — относительно «сейчас»: разделитель дня считается по локальной
        // дате устройства (`chat.md` §3.2).
        items: <ChatMessage>[
          chatMessage(
            id: 'm1',
            authorId: 'peer',
            text: 'Прорыв трубы в санузле 101',
            createdAt: _todayNoon(addMinutes: -10),
          ),
          chatMessage(
            id: 'm2',
            authorId: 'me',
            text: 'Принял, иду',
            createdAt: _todayNoon(addMinutes: -5),
          ),
        ],
      ),
    );
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        appDatabaseProvider.overrideWithValue(database),
        chatRepositoryProvider.overrideWithValue(repository),
        chatSocketProvider.overrideWithValue(socket),
        secureStorageProvider.overrideWithValue(
          InMemorySecureStorage()
            ..values[StorageKeys.accessToken] = 'access-token',
        ),
        connectivityServiceProvider
            .overrideWithValue(FakeConnectivityService()),
      ],
    );
    container.read(sessionProvider.notifier).state = const SessionState(
      status: SessionStatus.authenticated,
      userId: 'me',
      role: 'OPERATOR',
    );

    try {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: ChatThreadPage(chatId: 'chat-1')),
        ),
      );
      await settle(tester);

      expect(find.byKey(const Key('chat_message_list')), findsOneWidget);
      expect(find.byKey(const Key('chat_message_bubble_m1')), findsOneWidget);
      expect(find.byKey(const Key('chat_message_bubble_m2')), findsOneWidget);
      expect(find.text('Сегодня'), findsOneWidget);
      expect(find.byKey(const Key('chat_history_start_text')), findsOneWidget);
      expect(find.text('Начало переписки'), findsOneWidget);
      // Сокет поднят с access-токеном из хранилища (`chat.md` §3.4).
      expect(socket.connectCalls, 1);
      expect(socket.lastToken, 'access-token');
    } finally {
      await disposeScreen(tester);
      container.dispose();
      await socket.dispose();
      await closeDatabase(database);
    }
  });

  chatScreenTest(
    '§10.3: чужой чат (403) — «Чат недоступен» без composer',
    FakeChatRepository(
        detailFailure: const ForbiddenFailure('Вы не участник этого чата')),
    body: (WidgetTester tester, ProviderContainer container) async {
      expect(find.byKey(const Key('chat_forbidden_text')), findsOneWidget);
      // Текст виден и в шапке, и в пустом состоянии — проверяем наличие текста.
      expect(find.text('Чат недоступен'), findsWidgets);
      // Composer отсутствует: писать в чужой чат нечем.
      expect(find.byKey(const Key('chat_input_field')), findsNothing);
      expect(find.byKey(const Key('chat_send_button')), findsNothing);
      expect(find.byKey(const Key('chat_back_to_list_button')), findsOneWidget);
    },
  );

  chatScreenTest(
    '§10.1: отправка без сети — «Отправляется…» и запись в pending_actions',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: const ChatMessagesPage(items: <ChatMessage>[]),
    ),
    online: false,
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      final AppDatabase database = container.read(appDatabaseProvider);

      // Соединения нет: баннер оффлайна виден, composer активен (`chat.md` §5).
      expect(socket.isConnected, isFalse);
      expect(find.byKey(const Key('chat_offline_banner')), findsOneWidget);
      expect(find.text('Нет соединения — сообщения уйдут при подключении'),
          findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('chat_input_field')), 'Принял');
      await settle(tester);
      await tester.tap(find.byKey(const Key('chat_send_button')));
      await settle(tester);

      // 1. Оптимистичный пузырь со статусом «Отправляется…».
      expect(find.text('Принял'), findsOneWidget);
      expect(find.text('Отправляется…'), findsOneWidget);

      // 2. Запись очереди: `kind = chat_message`, `status = pending`, есть clientMessageId.
      final List<PendingAction> queued =
          await container.read(pendingActionQueueProvider).all();
      expect(queued, hasLength(1));
      final PendingAction action = queued.single;
      expect(action.type, PendingActionTypes.chatMessage);
      expect(action.status, PendingActionStatus.pending);
      expect(action.payload['chatId'], 'chat-1');
      expect(action.payload['text'], 'Принял');
      expect(action.payload['clientMessageId'], isNotEmpty);
      expect(
          action.idempotencyKey, 'chat:${action.payload['clientMessageId']}');

      // 3. Локальная лента тоже помнит сообщение (`chat_messages`, `offline.md` §3).
      final List<LocalChatMessage> local =
          await ChatMessageStore(database).forChat('chat-1');
      expect(local, hasLength(1));
      expect(local.single.status, ChatMessageStatus.pending);
      expect(local.single.text, 'Принял');

      // 4. Мок `onConnect`: очередь уходит сокетом, статус становится «Отправлено».
      socket.emitConnected();
      await settle(tester);

      expect(socket.sends, hasLength(1));
      expect(socket.sends.single['text'], 'Принял');
      expect(find.text('Отправляется…'), findsNothing);
      expect(find.byKey(const Key('chat_message_status_server-1')),
          findsOneWidget);

      final List<PendingAction> after =
          await container.read(pendingActionQueueProvider).all();
      expect(after.single.status, PendingActionStatus.synced);
      expect(after.single.syncedAt, isNotNull);

      final LocalChatMessage sent =
          (await ChatMessageStore(database).forChat('chat-1')).single;
      expect(sent.status, ChatMessageStatus.sent);
      expect(sent.serverId, 'server-1');
    },
  );

  chatScreenTest(
    '§10.2: событие message:read ставит своему сообщению «Прочитано»',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(items: <ChatMessage>[
        chatMessage(id: 'm2', authorId: 'me', text: 'Принял, иду')
      ]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      socket.emitConnected();
      socket.emitRead(chatId: 'chat-1', messageId: 'm2', readBy: 'peer');
      await settle(tester);

      // `Semantics(label: 'Прочитано')` у статуса своего сообщения.
      expect(
        tester
            .getSemantics(find.byKey(const Key('chat_message_status_m2')))
            .label,
        contains('Прочитано'),
      );
    },
  );

  chatScreenTest(
    '15.10: событие message:deleted убирает сообщение из ленты',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(items: <ChatMessage>[
        chatMessage(id: 'm1', authorId: 'peer', text: 'Это удалят'),
        chatMessage(id: 'm2', authorId: 'me', text: 'Это останется'),
      ]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await settle(tester);
      expect(find.byKey(const Key('chat_message_bubble_m1')), findsOneWidget);
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      socket.emitConnected();
      socket.emitDeleted(chatId: 'chat-1', messageId: 'm1');
      await settle(tester);
      expect(find.byKey(const Key('chat_message_bubble_m1')), findsNothing);
      expect(find.byKey(const Key('chat_message_bubble_m2')), findsOneWidget);
      // Чужой чат — не трогаем.
      socket.emitDeleted(chatId: 'other', messageId: 'm2');
      await settle(tester);
      expect(find.byKey(const Key('chat_message_bubble_m2')), findsOneWidget);
    },
  );

  chatScreenTest(
    '§11.2: своё сообщение с deliveredAt показывает «Доставлено»',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
        items: <ChatMessage>[
          chatMessage(
            id: 'm3',
            authorId: 'me',
            text: 'Принял',
            deliveredAt: DateTime(2026, 9, 16, 11, 0),
          ),
          chatMessage(id: 'm4', authorId: 'me', text: 'В пути'),
        ],
      ),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await settle(tester);

      // Доставлено — серверный признак: две галочки с подписью.
      expect(
        tester
            .getSemantics(find.byKey(const Key('chat_message_status_m3')))
            .label,
        contains('Доставлено'),
      );
      // Без deliveredAt остаётся «Отправлено» (одна галочка).
      expect(
        tester
            .getSemantics(find.byKey(const Key('chat_message_status_m4')))
            .label,
        isNot(contains('Доставлено')),
      );
    },
  );

  chatScreenTest(
    'отметка прочтения входящего уходит в сокет один раз',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
          items: <ChatMessage>[chatMessage(id: 'm1', authorId: 'peer')]),
    ),
    // Соединение уже поднято: отметка прочтения идёт основным путём — сокетом.
    socketConnected: true,
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      await settle(tester);

      expect(socket.reads, hasLength(1));
      expect(socket.reads.single['lastMessageId'], 'm1');

      // Повторно за то же сообщение не отправляем (`chat.md` §3.5).
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      expect(socket.reads, hasLength(1));
    },
  );

  chatScreenTest(
    'без сокета отметка прочтения уходит HTTP-путём (`chat.md` §8)',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
          items: <ChatMessage>[chatMessage(id: 'm1', authorId: 'peer')]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatRepository repository =
          container.read(chatRepositoryProvider) as FakeChatRepository;
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      await settle(tester);

      expect(socket.reads, isEmpty);
      expect(repository.readCalls, hasLength(1));
      expect(repository.readCalls.single['lastMessageId'], 'm1');
    },
  );

  chatScreenTest(
    'новое входящее по сокету появляется в ленте',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
          items: <ChatMessage>[chatMessage(id: 'm1', authorId: 'peer')]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      socket.emitConnected();
      socket.emitMessage(
        chatMessage(
            id: 'm3', authorId: 'peer', text: 'Санузел 101 закрыт на ремонт'),
      );
      await settle(tester);

      expect(find.text('Санузел 101 закрыт на ремонт'), findsOneWidget);
      expect(find.byKey(const Key('chat_message_bubble_m3')), findsOneWidget);
    },
  );

  chatScreenTest(
    'ошибка истории: баннер и активный composer',
    FakeChatRepository(
      detail: chatDetailFixture(),
      messagesFailure: const ServerFailure('Чат временно недоступен'),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      expect(find.byKey(const Key('chat_history_error_text')), findsOneWidget);
      expect(find.text('Не удалось загрузить переписку'), findsOneWidget);
      expect(find.byKey(const Key('chat_input_field')), findsOneWidget);
      expect(find.byKey(const Key('chat_send_button')), findsOneWidget);
    },
  );

  chatScreenTest(
    'пустая переписка: «Напишите первое сообщение»',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: const ChatMessagesPage(items: <ChatMessage>[]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      expect(find.byKey(const Key('chat_empty_text')), findsOneWidget);
      expect(find.text('Напишите первое сообщение'), findsOneWidget);
      expect(find.text('Опишите вопрос — ответ придёт в это окно'),
          findsOneWidget);
    },
  );

  chatScreenTest(
    'кнопка отправки неактивна при пустом поле и на пробелах',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: const ChatMessagesPage(items: <ChatMessage>[]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      socket.emitConnected();
      await settle(tester);

      expect(
        tester
            .widget<IconButton>(find.byKey(const Key('chat_send_button')))
            .onPressed,
        isNull,
      );

      await tester.enterText(find.byKey(const Key('chat_input_field')), '   ');
      await settle(tester);
      expect(
        tester
            .widget<IconButton>(find.byKey(const Key('chat_send_button')))
            .onPressed,
        isNull,
      );
    },
  );

  chatScreenTest(
    'черновик чата сохраняется локально (`chat.md` §3.2)',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: const ChatMessagesPage(items: <ChatMessage>[]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      await tester.enterText(
          find.byKey(const Key('chat_input_field')), 'Нужен доступ в 305');
      await settle(tester);
      expect(
          container.read(chatDraftsProvider)['chat-1'], 'Нужен доступ в 305');
    },
  );

  chatScreenTest(
    'ошибка отправки от сервера: «Не отправлено · Повторить»',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: const ChatMessagesPage(items: <ChatMessage>[]),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      socket.emitConnected();
      await settle(tester);

      socket.sendFailure = 'Вы не участник этого чата';
      await tester.enterText(
          find.byKey(const Key('chat_input_field')), 'Нужен доступ в 305');
      await settle(tester);
      await tester.tap(find.byKey(const Key('chat_send_button')));
      await settle(tester);

      expect(find.text('Не отправлено · Повторить'), findsOneWidget);
      expect(find.byKey(const Key('chat_send_error_text')), findsOneWidget);
    },
  );

  chatScreenTest(
    'вложение: подпись и имя файла приходят из резолвера вложений',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
        items: <ChatMessage>[
          chatMessage(
              id: 'm1',
              authorId: 'peer',
              text: 'Фото',
              attachmentIds: <String>['file-1']),
        ],
      ),
    ),
    extraOverrides: <Override>[
      chatAttachmentResolverProvider
          .overrideWithValue(FakeAttachmentResolver()),
    ],
    body: (WidgetTester tester, ProviderContainer container) async {
      // Картинка (15.10.2026) — превью в пузыре; в тестах сеть недоступна, и
      // `errorBuilder` подставляет прежнюю строку с именем — она и проверяется.
      expect(find.byKey(const Key('chat_attachment_m1')), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
      expect(find.text('📷 Фото фото_2026-09-17.jpg'), findsOneWidget);
    },
  );

  chatScreenTest(
    'вложение-документ: строка с именем файла из резолвера',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
        items: <ChatMessage>[
          chatMessage(
              id: 'm1',
              authorId: 'peer',
              text: 'Смета',
              attachmentIds: <String>['file-2']),
        ],
      ),
    ),
    extraOverrides: <Override>[
      chatAttachmentResolverProvider
          .overrideWithValue(FakeAttachmentResolver(document: true)),
    ],
    body: (WidgetTester tester, ProviderContainer container) async {
      expect(find.byKey(const Key('chat_attachment_m1')), findsOneWidget);
      expect(find.text('📄 Документ смета.xlsx'), findsOneWidget);
    },
  );

  chatScreenTest(
    '15.10: скрепка открывает выбор источника (камера, галерея, файл)',
    FakeChatRepository(detail: chatDetailFixture(), page: chatPage()),
    body: (WidgetTester tester, ProviderContainer container) async {
      await settle(tester);
      await tester.tap(find.byKey(const Key('chat_attach_button')));
      await settle(tester);
      expect(find.byKey(const Key('chat_attach_camera')), findsOneWidget);
      expect(find.byKey(const Key('chat_attach_gallery')), findsOneWidget);
      expect(find.byKey(const Key('chat_attach_file')), findsOneWidget);
    },
  );

  test('PendingAttachment: запрещённые расширения и значки по типу', () async {
    expect(const PendingAttachment(path: '/x/setup.exe', name: 'setup.exe').isBlocked, isTrue);
    expect(const PendingAttachment(path: '/x/page.HTML', name: 'page.HTML').isBlocked, isTrue);
    expect(const PendingAttachment(path: '/x/смета.xlsx', name: 'смета.xlsx').isBlocked, isFalse);
    expect(const PendingAttachment(path: '/x/a.jpg', name: 'a.jpg').isImage, isTrue);
    expect(const PendingAttachment(path: '/x/a.zip', name: 'a.zip').icon, Icons.folder_zip_outlined);
    expect(
      await const PendingAttachment(path: '/x/setup.exe', name: 'setup.exe').validate(),
      contains('прикреплять нельзя'),
    );
    // Несуществующий путь: размер не узнали — решает сервер.
    expect(await const PendingAttachment(path: '/nope/смета.xlsx', name: 'смета.xlsx').validate(), isNull);
  });

  chatScreenTest(
    'переподключение сокета: пропущенные входящие дочитываются из истории',
    FakeChatRepository(
      detail: chatDetailFixture(),
      page: chatPage(
        items: <ChatMessage>[
          chatMessage(id: 'm1', text: 'Первое', createdAt: _todayNoon(addMinutes: -10)),
        ],
      ),
    ),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      final FakeChatRepository repository =
          container.read(chatRepositoryProvider) as FakeChatRepository;
      socket.emitConnected();
      await settle(tester);
      final int callsBefore = repository.messageCalls;

      // Сокет пропал — за это время пришло сообщение, которого по сокету не было.
      socket.emitDisconnected(reason: 'transport close');
      repository.page = chatPage(
        items: <ChatMessage>[
          chatMessage(id: 'm1', text: 'Первое', createdAt: _todayNoon(addMinutes: -10)),
          chatMessage(id: 'm2', text: 'Пропущенное', createdAt: _todayNoon(addMinutes: -1)),
        ],
      );
      await settle(tester);
      expect(find.text('Пропущенное'), findsNothing);

      socket.emitConnected();
      await settle(tester);
      expect(repository.messageCalls, callsBefore + 1);
      expect(find.text('Первое'), findsOneWidget);
      expect(find.text('Пропущенное'), findsOneWidget);
    },
  );

  chatScreenTest(
    'отказ авторизации сокета: токен обновляется, соединение с новым токеном',
    FakeChatRepository(detail: chatDetailFixture(), page: chatPage()),
    body: (WidgetTester tester, ProviderContainer container) async {
      final FakeChatSocket socket =
          container.read(chatSocketProvider) as FakeChatSocket;
      final InMemorySecureStorage storage =
          container.read(secureStorageProvider) as InMemorySecureStorage;
      int refreshCalls = 0;
      container.read(sessionBridgeProvider).onRefresh = () async {
        refreshCalls += 1;
        storage.values[StorageKeys.accessToken] = 'fresh-token';
        return true;
      };
      final int connectsBefore = socket.connectCalls;

      // Шлюз отклоняет просроченный токен двумя событиями подряд.
      socket.emitFailure('Неавторизованное соединение: нужен access-токен');
      socket.emitFailure('Неавторизованное соединение: нужен access-токен');
      await settle(tester);

      expect(refreshCalls, 1);
      expect(socket.disconnectCalls, greaterThanOrEqualTo(1));
      expect(socket.connectCalls, connectsBefore + 1);
      expect(socket.lastToken, 'fresh-token');
    },
  );
}

/// Резолвер вложений без file-service: имя файла задано заранее.
class FakeAttachmentResolver extends ChatAttachmentResolver {
  FakeAttachmentResolver({this.document = false})
      : super(
          fakeApiClient(
            FakeHttpAdapter(
                (_) async => const FakeResponse(200, <String, Object>{})),
          ),
        );

  final bool document;

  @override
  Future<ChatAttachment?> resolve(String fileId) async {
    if (document) {
      return ChatAttachment(
        fileId: fileId,
        url: 'http://files.test/smeta.xlsx',
        originalName: 'смета.xlsx',
      );
    }
    return ChatAttachment(
      fileId: fileId,
      url: 'http://files.test/photo.jpg',
      originalName: 'фото_2026-09-17.jpg',
      isImage: true,
    );
  }
}
