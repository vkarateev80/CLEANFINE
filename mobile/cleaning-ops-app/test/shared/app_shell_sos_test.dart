import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/features/auth/presentation/providers/session_provider.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/shared/widgets/app_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers/gps_fakes.dart';

/// Кнопка SOS каркаса: в переписке её нет — плавающая кнопка ложилась поверх
/// «Отправить» в поле ввода (находка владельца 15.10.2026).
void main() {
  late AppDatabase database;
  setUpAll(() => database = AppDatabase.memory());
  tearDownAll(() => database.close());

  Future<GoRouter> pumpShell(WidgetTester tester) async {
    final GoRouter router = GoRouter(
      initialLocation: '/chats',
      routes: <RouteBase>[
        ShellRoute(
          builder: (context, state, child) => AppShell(child: child),
          routes: <RouteBase>[
            GoRoute(
              path: '/chats',
              builder: (context, state) => const Text('Список чатов'),
              routes: <RouteBase>[
                GoRoute(
                  path: ':chatId',
                  builder: (context, state) => const Text('Переписка'),
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

  testWidgets('SOS есть в списке чатов и пропадает в открытой переписке', (tester) async {
    final GoRouter router = await pumpShell(tester);
    expect(find.text('Список чатов'), findsOneWidget);
    expect(find.byKey(const Key('chats_sos_button')), findsOneWidget);

    router.go('/chats/chat-1');
    await tester.pumpAndSettle();
    expect(find.text('Переписка'), findsOneWidget);
    expect(find.byKey(const Key('chats_sos_button')), findsNothing);

    router.go('/chats');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chats_sos_button')), findsOneWidget);
  });
}
