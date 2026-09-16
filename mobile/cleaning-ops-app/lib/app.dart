import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/presentation/providers/session_provider.dart';
import 'router/app_router.dart';
import 'services/service_providers.dart';

/// Корневой виджет: тема, роутер и подключение сессии к HTTP-клиенту.
class CleaningOpsApp extends ConsumerStatefulWidget {
  const CleaningOpsApp({super.key});

  @override
  ConsumerState<CleaningOpsApp> createState() => _CleaningOpsAppState();
}

class _CleaningOpsAppState extends ConsumerState<CleaningOpsApp> {
  @override
  void initState() {
    super.initState();
    // После первого кадра: читаем сохранённую сессию и связываем обработчик
    // обновления токенов с `ApiClient` (при 401 он спросит сессию, а не упадёт).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = ref.read(sessionProvider.notifier);
      final bridge = ref.read(sessionBridgeProvider);
      bridge.onRefresh = session.refreshTokens;
      bridge.onLogout = session.signOut;
      session.bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Cleaning Ops',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
