import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/providers/session_provider.dart';
import '../../features/profile/presentation/providers/profile_providers.dart';
import '../../router/app_router.dart';
import '../../services/push_service.dart';

/// Обработка push-уведомлений (М6.8, DS-002 `profile.md` §3.4).
///
/// Две задачи:
///  1. зарегистрировать токен устройства при входе — `GET /api/auth/me` уже
///     прошёл, сессия установлена;
///  2. перевести приложение на экран по `data.type` пришедшего уведомления.
///
/// Слушатель стоит в `builder` `MaterialApp.router`, поэтому видит роутер и не
/// зависит от того, какой экран открыт.
class PushListener extends ConsumerStatefulWidget {
  const PushListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PushListener> createState() => _PushListenerState();
}

class _PushListenerState extends ConsumerState<PushListener> {
  StreamSubscription<PushMessage>? _foreground;
  StreamSubscription<PushMessage>? _opened;
  GoRouter? _router;
  bool _registered = false;
  String? _registeredFor;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _subscribe();
      _handleInitialMessage();
    });
  }

  @override
  void dispose() {
    _foreground?.cancel();
    _opened?.cancel();
    super.dispose();
  }

  void _subscribe() {
    final PushService push = ref.read(pushServiceProvider);
    // `onMessage` и `onMessageOpenedApp` ведут по одному и тому же словарю типов:
    // разница только в том, было приложение открыто или нет.
    _foreground = push.foreground.listen(_navigate);
    _opened = push.opened.listen(_navigate);
  }

  Future<void> _handleInitialMessage() async {
    final PushMessage? message = await ref.read(pushServiceProvider).initialMessage();
    if (message != null) _navigate(message);
  }

  /// Переход по `data.type`: `CHAT_MESSAGE` — сразу в переписку, остальные — на
  /// экраны, перечисленные в `profile.md` §3.4.
  void _navigate(PushMessage message) {
    final String? route = pushRoute(message);
    if (route == null) return;
    final GoRouter? router = _router;
    if (router == null) return;
    router.go(route);
  }

  /// Токен устройства регистрируется один раз на пользователя.
  Future<void> _registerToken(String userId) async {
    if (_registeredFor == userId) return;
    _registeredFor = userId;
    final String? token = await ref.read(pushServiceProvider).token();
    // Токена нет (Firebase не сконфигурирована) — регистрация пропускается:
    // остальной путь push (in-app, настройки) от неё не зависит.
    if (token == null || token.isEmpty) return;
    try {
      await ref
          .read(notificationsRepositoryProvider)
          .registerDevice(token: token, platform: devicePlatform());
      _registered = true;
    } on Object {
      // Нет сети — токен зарегистрируется при следующем входе.
      _registeredFor = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    _router = ref.watch(appRouterProvider);
    final SessionState session = ref.watch(sessionProvider);
    final String? userId = session.userId;
    if (session.isAuthenticated && userId != null && !_registered) {
      unawaited(_registerToken(userId));
    }
    return widget.child;
  }
}
