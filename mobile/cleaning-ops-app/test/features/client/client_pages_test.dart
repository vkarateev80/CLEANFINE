import 'package:cleaning_ops_app/core/utils/clock.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/features/client/client_texts.dart';
import 'package:cleaning_ops_app/features/client/data/client_models.dart';
import 'package:cleaning_ops_app/features/client/presentation/client_providers.dart';
import 'package:cleaning_ops_app/features/client/presentation/pages/client_home_page.dart';
import 'package:cleaning_ops_app/features/client/presentation/pages/client_ticket_detail_page.dart';
import 'package:cleaning_ops_app/features/client/presentation/pages/client_tickets_page.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../../helpers/client_fakes.dart';

/// Портал заказчика в «Команде»: главная («Статус объекта»), список заявок с
/// фильтрами, создание и карточка заявки — поверх фейкового репозитория.
void main() {
  setUpAll(() async => initializeDateFormatting('ru'));

  final DateTime now = DateTime.utc(2026, 10, 8, 12);

  List<Override> overrides(FakeClientRepository repo) => <Override>[
        clientRepositoryProvider.overrideWithValue(repo),
        sessionProvider.overrideWith(SignedInClient.new),
        nowProvider.overrideWithValue(() => now),
      ];

  Widget app(FakeClientRepository repo, String initialLocation) {
    final GoRouter router = GoRouter(
      initialLocation: initialLocation,
      routes: <RouteBase>[
        GoRoute(
          path: '/client',
          builder: (_, __) => const ClientHomePage(),
          routes: <RouteBase>[
            GoRoute(
              path: 'tickets',
              builder: (_, GoRouterState state) =>
                  ClientTicketsPage(initialFilter: state.uri.queryParameters['status']),
              routes: <RouteBase>[
                GoRoute(path: 'new', builder: (_, __) => const ClientTicketCreatePage()),
                GoRoute(
                  path: ':id',
                  builder: (_, GoRouterState state) =>
                      ClientTicketDetailPage(ticketId: state.pathParameters['id']!),
                ),
              ],
            ),
          ],
        ),
      ],
    );
    return ProviderScope(overrides: overrides(repo), child: MaterialApp.router(routerConfig: router));
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// Высокий «экран»: ленивый ListView не строит карточки за кадром, а тесты
  /// проверяют нижние блоки (последние заявки, кнопка отправки комментария).
  Future<void> pumpApp(WidgetTester tester, FakeClientRepository repo, String location) async {
    tester.view.physicalSize = const Size(1080, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app(repo, location));
    await settle(tester);
  }

  ScheduleEvent shift(String id, String status, String start) => ScheduleEvent.tryParse(<String, dynamic>{
        'id': id,
        'scheduleName': 'Дневная уборка',
        'date': start.substring(0, 10),
        'plannedStart': start,
        'status': status,
      })!;

  testWidgets('главная: паспорт, KPI, ближайшая смена и последние заявки', (WidgetTester tester) async {
    final FakeClientRepository repo = FakeClientRepository(
      object: demoObject(),
      detail: const ClientObjectDetail(floors: <ClientFloor>[
        ClientFloor(id: 'f1', name: '1', number: 1, rooms: <ClientRoom>[ClientRoom(id: 'r1', name: 'Холл')]),
      ]),
      ticketList: <ClientTicket>[
        demoTicket(id: 't-open', status: 'in_progress', created: '2026-10-07T10:00:00.000Z'),
        demoTicket(id: 't-done', status: 'completed', created: '2026-10-06T10:00:00.000Z'),
      ],
      eventList: <ScheduleEvent>[
        shift('e1', 'PLANNED', '2026-10-09T06:00:00.000Z'),
        shift('e0', 'PLANNED', '2026-10-01T06:00:00.000Z'),
      ],
    );
    await pumpApp(tester, repo, '/client');

    expect(find.byKey(const Key('client_home_page')), findsOneWidget);
    expect(find.text('БЦ «Ромашка»'), findsOneWidget);
    expect(find.text('Активен'), findsOneWidget);
    expect(find.text('1500 м²'), findsOneWidget);
    expect(find.text(ClientTexts.passportRooms), findsOneWidget);
    // Открытых — одна (in_progress), выполненных за 30 дней — одна.
    expect(find.descendant(of: find.byKey(const Key('client_kpi_open')), matching: find.text('1')),
        findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('client_kpi_done')), matching: find.text('1')),
        findsOneWidget);
    expect(find.text(ClientTexts.notPlanned), findsNothing);
    expect(find.text('Дневная уборка'), findsOneWidget);
    expect(find.byKey(const Key('client_ticket_t-open')), findsOneWidget);
    expect(find.byKey(const Key('client_create_ticket_fab')), findsOneWidget);
  });

  testWidgets('главная без привязанного объекта — подсказка обратиться к менеджеру',
      (WidgetTester tester) async {
    await pumpApp(tester, FakeClientRepository(object: null), '/client');

    expect(find.byKey(const Key('client_no_object')), findsOneWidget);
    expect(find.text(ClientTexts.noObjectTitle), findsOneWidget);
    expect(find.byKey(const Key('client_create_ticket_fab')), findsNothing);
  });

  testWidgets('приостановленный объект показывает предупреждение', (WidgetTester tester) async {
    await pumpApp(tester, FakeClientRepository(object: demoObject(status: 'PAUSED')), '/client');

    expect(find.byKey(const Key('client_paused_notice')), findsOneWidget);
    expect(find.byKey(const Key('client_no_shifts')), findsOneWidget);
    expect(find.byKey(const Key('client_no_tickets')), findsOneWidget);
  });

  testWidgets('список заявок: фильтр «Выполненные» оставляет только выполненные',
      (WidgetTester tester) async {
    final FakeClientRepository repo = FakeClientRepository(
      object: demoObject(),
      ticketList: <ClientTicket>[
        demoTicket(id: 't-open', status: 'new'),
        demoTicket(id: 't-done', status: 'closed', created: '2026-10-05T10:00:00.000Z'),
      ],
    );
    await pumpApp(tester, repo, '/client/tickets');

    expect(find.byKey(const Key('client_tickets_page')), findsOneWidget);
    expect(find.byKey(const Key('client_ticket_t-open')), findsOneWidget);
    expect(find.byKey(const Key('client_ticket_t-done')), findsOneWidget);

    await tester.tap(find.byKey(const Key('client_ticket_filter_done')));
    await settle(tester);
    expect(find.byKey(const Key('client_ticket_t-done')), findsOneWidget);
    expect(find.byKey(const Key('client_ticket_t-open')), findsNothing);
  });

  testWidgets('список заявок: пустой фильтр предлагает показать все', (WidgetTester tester) async {
    final FakeClientRepository repo = FakeClientRepository(
      object: demoObject(),
      ticketList: <ClientTicket>[demoTicket(id: 't-open', status: 'new')],
    );
    await pumpApp(tester, repo, '/client/tickets?status=done');

    expect(find.byKey(const Key('client_tickets_filter_empty')), findsOneWidget);
    await tester.tap(find.text(ClientTexts.showAll));
    await settle(tester);
    expect(find.byKey(const Key('client_ticket_t-open')), findsOneWidget);
  });

  testWidgets('создание заявки: короткое описание отклоняется, валидная — уходит в репозиторий',
      (WidgetTester tester) async {
    final FakeClientRepository repo = FakeClientRepository(object: demoObject());
    await pumpApp(tester, repo, '/client/tickets/new');

    expect(find.byKey(const Key('client_ticket_create_page')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('client_ticket_description')), 'Коротко');
    await tester.tap(find.byKey(const Key('client_ticket_submit')));
    await settle(tester);
    expect(find.text(ClientTexts.tooShort(ClientTexts.descriptionMin)), findsOneWidget);
    expect(repo.createdTickets, isEmpty);

    await tester.enterText(
        find.byKey(const Key('client_ticket_description')), 'Протекает кран в санузле на втором этаже');
    await tester.tap(find.byKey(const Key('client_ticket_submit')));
    // Переход назад анимируется (~300 мс): ждём, пока дерево успокоится.
    await tester.pumpAndSettle();

    expect(repo.createdTickets.single['description'], 'Протекает кран в санузле на втором этаже');
    expect(repo.createdTickets.single['type'], 'unscheduled');
    expect(repo.createdTickets.single['objectId'], 'obj-1');
    // После создания — возврат к списку (pop), новая заявка первой.
    expect(find.byKey(const Key('client_ticket_create_page')), findsNothing);
    expect(find.byKey(const Key('client_tickets_page')), findsOneWidget);
    expect(find.byKey(const Key('client_ticket_new-1')), findsOneWidget);
  });

  testWidgets('карточка заявки: описание, ход работы и отправка комментария', (WidgetTester tester) async {
    final ClientTicket ticket = demoTicket(id: 't1', status: 'assigned');
    final FakeClientRepository repo = FakeClientRepository(
      object: demoObject(),
      ticketDetails: <String, ClientTicketDetail>{
        't1': ClientTicketDetail(
          ticket: ClientTicket(
            id: ticket.id,
            type: ticket.type,
            priority: ticket.priority,
            status: ticket.status,
            description: ticket.description,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            assignedAt: '2026-10-07T11:00:00.000Z',
            operationsTotal: 3,
          ),
          comments: const <TicketComment>[
            TicketComment(
                id: 'c1', authorId: 'manager', text: 'Приедем завтра', createdAt: '2026-10-07T12:00:00.000Z'),
          ],
          operationsCompleted: 1,
        ),
      },
    );
    await pumpApp(tester, repo, '/client/tickets/t1');

    expect(find.byKey(const Key('client_ticket_detail_page')), findsOneWidget);
    expect(find.text(ticket.description), findsOneWidget);
    expect(find.text(ClientTexts.operations(1, 3)), findsOneWidget);
    expect(find.text('Назначена'), findsWidgets);
    expect(find.text(ClientTexts.manager), findsOneWidget);
    expect(find.text('Приедем завтра'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('client_ticket_comment')), 'Доступ через охрану');
    await tester.tap(find.byKey(const Key('client_ticket_comment_send')));
    await settle(tester);
    expect(repo.comments, <String>['Доступ через охрану']);
    expect(find.byKey(const Key('client_ticket_comment_sent')), findsOneWidget);
  });

  testWidgets('чужая или удалённая заявка — одно сообщение без деталей', (WidgetTester tester) async {
    await pumpApp(tester, FakeClientRepository(object: demoObject()), '/client/tickets/unknown');

    expect(find.byKey(const Key('client_ticket_unavailable')), findsOneWidget);
    expect(find.text(ClientTexts.ticketUnavailable), findsOneWidget);
  });
}

/// Вошедший заказчик.
class SignedInClient extends SessionController {
  @override
  SessionState build() => const SessionState(
        status: SessionStatus.authenticated,
        userId: 'me',
        role: 'CLIENT',
        fullName: 'Иван',
      );
}
