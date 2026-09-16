import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/pages/login_page.dart';
import '../features/auth/presentation/pages/pin_login_page.dart';
import '../features/auth/presentation/pages/pin_setup_page.dart';
import '../features/auth/presentation/pages/splash_page.dart';
import '../features/auth/presentation/providers/session_provider.dart';
import '../features/chat/presentation/pages/chat_thread_page.dart';
import '../features/chat/presentation/pages/chats_page.dart';
import '../features/checklist/presentation/pages/checklist_page.dart';
import '../features/home/presentation/pages/home_today_page.dart';
import '../features/offline/presentation/pages/offline_page.dart';
import '../features/profile/presentation/pages/profile_page.dart';
import '../features/route_map/presentation/pages/route_map_page.dart';
import '../features/sos/presentation/pages/sos_page.dart';
import '../shared/widgets/app_shell.dart';

/// Пути приложения — ровно те, что заданы пакетом DS-002
/// (`design/screens/mobile/README.md`, таблица «Индекс файлов»).
class AppRoutes {
  const AppRoutes._();

  static const String splash = '/splash';
  static const String login = '/login';
  static const String pin = '/pin';
  static const String pinSetup = '/pin/setup';
  static const String today = '/today';
  static const String routeMap = '/route';
  static const String sos = '/sos';
  static const String chats = '/chats';
  static const String profile = '/profile';
  static const String offline = '/offline';

  /// Маршрут смены: `/route/<eventId>`.
  static String routeMapFor(String eventId) => '$routeMap/$eventId';

  /// Чек-лист помещения внутри маршрута: `/route/<eventId>/room/<roomId>`.
  static String checklistFor({required String eventId, required String roomId}) =>
      '$routeMap/$eventId/room/$roomId';

  /// Переписка: `/chats/<chatId>`.
  static String chatThreadFor(String chatId) => '$chats/$chatId';
}

/// Роутер и guard авторизации.
///
/// `ref.watch(sessionProvider)` внутри провайдера: при смене сессии GoRouter
/// пересобирается и сам выполняет redirect (вход → `/today`, выход → `/login`).
final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionProvider);

  // ChangeNotifier живёт ровно столько же, сколько провайдер: подписку закрываем
  // вместе с ним, иначе после пересоздания роутера останутся висеть слушатели.
  final refresh = _SessionRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final onAuthScreen = location == AppRoutes.login ||
          location == AppRoutes.pin ||
          location == AppRoutes.pinSetup;
      final onSplash = location == AppRoutes.splash;

      if (session.isUnknown) {
        return onSplash ? null : AppRoutes.splash;
      }
      if (!session.isAuthenticated) {
        return onAuthScreen ? null : AppRoutes.login;
      }
      if (onAuthScreen || onSplash) {
        return AppRoutes.today;
      }
      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashPage(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: AppRoutes.pin,
        builder: (context, state) => const PinLoginPage(),
      ),
      GoRoute(
        path: AppRoutes.pinSetup,
        builder: (context, state) => const PinSetupPage(),
      ),
      // Полноэкранные маршруты поверх таб-бара: SOS и оффлайн-очередь.
      GoRoute(
        path: AppRoutes.sos,
        builder: (context, state) => const SosPage(),
      ),
      GoRoute(
        path: AppRoutes.offline,
        builder: (context, state) => const OfflinePage(),
      ),
      GoRoute(
        path: '${AppRoutes.routeMap}/:eventId',
        builder: (context, state) => RouteMapPage(eventId: state.pathParameters['eventId']!),
        routes: <RouteBase>[
          GoRoute(
            path: 'room/:roomId',
            builder: (context, state) => ChecklistPage(
              eventId: state.pathParameters['eventId']!,
              roomId: state.pathParameters['roomId']!,
            ),
          ),
        ],
      ),
      // Каркас с нижним таб-баром: «Сегодня», «Чаты», «Профиль».
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: <RouteBase>[
          GoRoute(
            path: AppRoutes.today,
            builder: (context, state) => const HomeTodayPage(),
          ),
          GoRoute(
            path: AppRoutes.chats,
            builder: (context, state) => const ChatsPage(),
            routes: <RouteBase>[
              GoRoute(
                path: ':chatId',
                builder: (context, state) =>
                    ChatThreadPage(chatId: state.pathParameters['chatId']!),
              ),
            ],
          ),
          GoRoute(
            path: AppRoutes.profile,
            builder: (context, state) => const ProfilePage(),
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      key: const Key('route_error_page'),
      appBar: AppBar(title: const Text('Страница не найдена')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.error_outline, size: 48),
              const SizedBox(height: 12),
              Text('Маршрут ${state.uri} не найден', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => context.go(AppRoutes.today),
                child: const Text('На главную'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
});

/// Мост Riverpod → Listenable для go_router: без него redirect не сработает
/// в момент, когда сессия меняется (вход/выход), а экран уже отрисован.
class _SessionRefresh extends ChangeNotifier {
  _SessionRefresh(Ref ref) {
    _subscription = ref.listen<SessionState>(
      sessionProvider,
      (previous, next) {
        if (previous?.status != next.status) notifyListeners();
      },
    );
  }

  late final ProviderSubscription<SessionState> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}
