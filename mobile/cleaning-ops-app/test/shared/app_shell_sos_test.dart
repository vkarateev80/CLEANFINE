import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/shared/widgets/app_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers/gps_fakes.dart';

/// SOS в нижней панели каркаса (решение владельца 17.10.2026): плавающая
/// кнопка ложилась поверх «Отправить» в переписке, теперь это четвёртый пункт
/// таб-бара и в открытом чате он не перекрывает поле ввода.
void main() {
  late AppDatabase database;
  setUpAll(() => database = AppDatabase.memory());
  tearDownAll(() => database.close());

  Future<GoRouter> pumpShell(WidgetTester tester) async {
    final GoRouter router = GoRouter(
      initialLocation: '/chats',
      routes: <RouteBase>[
        GoRoute(
          path: '/sos',
          builder: (context, state) => const Scaffold(body: Text('Экран SOS', key: Key('sos_page'))),
        ),
        ShellRoute(
          builder: (context, state, child) => AppShell(child: child),
          routes: <RouteBase>[
            GoRoute(
              path: '/chats',
              builder: (context, state) => const Text('Список чатов'),
              routes: <RouteBase>[
                GoRoute(
                  path: ':chatId',
                  builder: (context, state) => const _FakeThread(),
                ),
              ],
            ),
          ],
        ),
      ],
    );
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        gpsTrackingServiceProvider.overrideWithValue(
          StubGpsTrackingService(const GpsTrackingState(), database),
        ),
      ],
    );
    addTearDown(container.dispose);
    container.read(sessionProvider.notifier).state = const SessionState(
      status: SessionStatus.authenticated,
      userId: 'me',
      role: 'OPERATOR',
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
    return router;
  }

  testWidgets('пункт SOS есть в списке чатов и в переписке, плавающей кнопки нет', (tester) async {
    final GoRouter router = await pumpShell(tester);
    expect(find.text('Список чатов'), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_sos')), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsNothing);

    router.go('/chats/chat-1');
    await tester.pumpAndSettle();
    expect(find.text('Переписка'), findsOneWidget);
    expect(find.byKey(const Key('shell_tab_sos')), findsOneWidget);
    expect(find.byType(FloatingActionButton), findsNothing);
  });

  testWidgets('в переписке SOS не перекрывает кнопку «Отправить»', (tester) async {
    final GoRouter router = await pumpShell(tester);
    router.go('/chats/chat-1');
    await tester.pumpAndSettle();

    final Rect send = tester.getRect(find.byKey(const Key('chat_send_button')));
    final Rect sos = tester.getRect(find.byKey(const Key('shell_tab_sos')));
    expect(sos.overlaps(send), isFalse);
    expect(sos.top, greaterThanOrEqualTo(send.bottom));
  });

  testWidgets('нажатие SOS открывает аварийную заявку поверх текущего экрана', (tester) async {
    final GoRouter router = await pumpShell(tester);
    router.go('/chats/chat-1');
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('shell_tab_sos')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sos_page')), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    expect(find.text('Переписка'), findsOneWidget);
  });
}

/// Переписка «по форме»: лента и поле ввода с кнопкой «Отправить» внизу — как
/// `_Composer` настоящего экрана.
class _FakeThread extends StatelessWidget {
  const _FakeThread();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        const Expanded(child: Center(child: Text('Переписка'))),
        Row(
          children: <Widget>[
            const Expanded(child: TextField()),
            SizedBox(
              key: const Key('chat_send_button'),
              width: 48,
              height: 48,
              child: IconButton.filled(onPressed: () {}, icon: const Icon(Icons.send)),
            ),
          ],
        ),
      ],
    );
  }
}
