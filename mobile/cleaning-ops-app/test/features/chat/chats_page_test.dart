import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/features/chat/data/models/chat_models.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/features/chat/presentation/pages/chats_page.dart';
import 'package:cleaning_ops_app/features/chat/presentation/providers/chat_providers.dart';
import 'package:cleaning_ops_app/services/chat_socket_service.dart';
import 'package:cleaning_ops_app/services/connectivity_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/chat_fakes.dart';
import '../../helpers/offline_fakes.dart';

/// М6.8: список чатов `/chats` — DS-002 `chat.md` §3.1, §5, §10.4.
void main() {
  late FakeChatSocket socket;

  setUp(() => socket = FakeChatSocket());
  tearDown(() => socket.dispose());

  Widget wrap(FakeChatRepository repository, {FakeConnectivityService? connectivity}) {
    return ProviderScope(
      overrides: <Override>[
        chatRepositoryProvider.overrideWithValue(repository),
        chatSocketProvider.overrideWithValue(socket),
        connectivityServiceProvider.overrideWithValue(connectivity ?? FakeConnectivityService()),
      ],
      child: const MaterialApp(home: ChatsPage()),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('§10.4: пустой список — «Чатов пока нет» и бейджа непрочитанных нет', (
    WidgetTester tester,
  ) async {
    final container = ProviderContainer(
      overrides: <Override>[
        chatRepositoryProvider.overrideWithValue(FakeChatRepository(chats: const <ChatSummary>[])),
        chatSocketProvider.overrideWithValue(socket),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService()),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const MaterialApp(home: ChatsPage())),
    );
    await settle(tester);

    expect(find.byKey(const Key('chats_empty_text')), findsOneWidget);
    expect(find.text('Чатов пока нет'), findsOneWidget);
    expect(find.text('Чат появится, когда бригадир создаст его по объекту или заявке'), findsOneWidget);
    // Таб «Чаты» без бейджа: суммарный `unreadCount` равен нулю.
    expect(container.read(chatUnreadBadgeProvider), 0);
  });

  testWidgets('список: заголовок по типу, превью, «Вы:», бейдж непрочитанных', (
    WidgetTester tester,
  ) async {
    final FakeChatRepository repository = FakeChatRepository(
      chats: <ChatSummary>[
        chatSummary(id: 'chat-1', unreadCount: 2),
        chatSummary(
          id: 'chat-2',
          type: 'object',
          title: 'БЦ «Север»',
          lastText: 'Фото отправил',
          lastAuthorId: 'me',
          lastAt: DateTime.now().subtract(const Duration(days: 1, minutes: 5)),
        ),
      ],
    );

    // «Вы: {текст}» требует моего id: в тесте сессия задаётся вручную.
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        chatRepositoryProvider.overrideWithValue(repository),
        chatSocketProvider.overrideWithValue(socket),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService()),
      ],
    );
    addTearDown(container.dispose);
    container.read(sessionProvider.notifier).state = const SessionState(
      status: SessionStatus.authenticated,
      userId: 'me',
      role: 'OPERATOR',
    );

    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const MaterialApp(home: ChatsPage())),
    );
    await settle(tester);

    expect(find.byKey(const Key('chats_list')), findsOneWidget);
    expect(find.byKey(const Key('chat_tile_chat-1')), findsOneWidget);
    // `title == null` у ticket-чата — имя берётся из правила по типу.
    expect(find.text('Чат заявки'), findsOneWidget);
    expect(find.text('БЦ «Север»'), findsOneWidget);

    // Бейдж непрочитанных — только у чата с `unreadCount > 0`.
    expect(find.byKey(const Key('chat_unread_badge_chat-1')), findsOneWidget);
    expect(find.byKey(const Key('chat_unread_badge_chat-2')), findsNothing);
    expect(find.text('2'), findsOneWidget);

    // «Вы: {текст}» — у сообщения, автор которого я.
    expect(find.text('Вы: Фото отправил'), findsOneWidget);
    expect(find.text('Вчера'), findsOneWidget);
  });

  testWidgets('ошибка загрузки — «Не удалось загрузить чаты» и «Повторить»', (
    WidgetTester tester,
  ) async {
    final FakeChatRepository repository = FakeChatRepository(
      chatsFailure: const ServerFailure('Сервис недоступен'),
    );

    await tester.pumpWidget(wrap(repository));
    await settle(tester);

    expect(find.byKey(const Key('chats_error_text')), findsOneWidget);
    expect(find.text('Не удалось загрузить чаты'), findsOneWidget);
    expect(find.byKey(const Key('chat_retry_button')), findsOneWidget);

    // «Повторить» повторяет запрос.
    final int before = repository.listCalls;
    repository.chatsFailure = null;
    repository.chats = <ChatSummary>[chatSummary()];
    await tester.tap(find.byKey(const Key('chat_retry_button')));
    await settle(tester);

    expect(repository.listCalls, greaterThan(before));
    expect(find.byKey(const Key('chat_tile_chat-1')), findsOneWidget);
  });

  testWidgets('входящее сообщение обновляет список и счётчик непрочитанных', (
    WidgetTester tester,
  ) async {
    final FakeChatRepository repository = FakeChatRepository(
      chats: <ChatSummary>[chatSummary(id: 'chat-1')],
    );
    await tester.pumpWidget(wrap(repository));
    await settle(tester);

    socket.emitMessage(
      chatMessage(id: 'new-1', chatId: 'chat-1', text: 'Санузел 101 закрыт на ремонт'),
    );
    await settle(tester);

    expect(find.text('Санузел 101 закрыт на ремонт'), findsOneWidget);
    expect(find.byKey(const Key('chat_unread_badge_chat-1')), findsOneWidget);
  });

  testWidgets('оффлайн: баннер на /chats виден, список остаётся', (WidgetTester tester) async {
    final FakeConnectivityService connectivity = FakeConnectivityService(online: false);
    addTearDown(connectivity.dispose);

    await tester.pumpWidget(
      wrap(FakeChatRepository(chats: <ChatSummary>[chatSummary()]), connectivity: connectivity),
    );
    await settle(tester);

    expect(find.byKey(const Key('chats_offline_banner')), findsOneWidget);
    expect(find.text('Нет соединения — данные могут быть устаревшими'), findsOneWidget);
    expect(find.byKey(const Key('chat_tile_chat-1')), findsOneWidget);
  });

  test('подписи времени в списке: сегодня, вчера, дата', () {
    final DateTime now = DateTime(2026, 9, 16, 12, 0);
    expect(listTimeLabel(DateTime(2026, 9, 16, 10, 42), now), '10:42');
    expect(listTimeLabel(DateTime(2026, 9, 15, 10, 42), now), 'Вчера');
    expect(listTimeLabel(DateTime(2026, 9, 1, 10, 42), now), '01.09');
    expect(dayLabel(DateTime(2026, 9, 16, 10, 42), now), 'Сегодня');
    expect(dayLabel(DateTime(2026, 9, 15, 10, 42), now), 'Вчера');
    expect(dayLabel(DateTime(2026, 9, 1, 10, 42), now), '01.09.2026');
  });

  test('превью без сообщений — «Сообщений пока нет»', () {
    final ChatSummary empty = ChatSummary(
      id: 'chat-3',
      type: 'direct',
      createdAt: DateTime(2026, 9, 16),
      unreadCount: 0,
    );
    expect(previewText(empty, 'me'), 'Сообщений пока нет');
    expect(chatTitle(empty), 'Личные сообщения');
  });
}
