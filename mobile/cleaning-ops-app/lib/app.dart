import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/app_product.dart';
import 'core/i18n/app_language.dart';
import 'core/i18n/language_provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/providers/session_provider.dart';
import 'router/app_router.dart';
import 'services/service_providers.dart';
import 'shared/widgets/push_listener.dart';

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
      // Сохранённый язык интерфейса; до него — язык телефона.
      ref.read(languageProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppLanguage language = ref.watch(languageProvider);
    return MaterialApp.router(
      // Ключ по языку: смена языка пересобирает всё дерево, и строки `tr()`
      // перечитываются; роутер остаётся прежним, экран не теряется.
      key: ValueKey<String>('app_${language.code}'),
      title: ref.watch(appProductProvider).title,
      locale: language.locale,
      supportedLocales: AppLanguage.supportedLocales,
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: ref.watch(appRouterProvider),
      // Push: регистрация токена устройства и переход по `data.type`
      // (DS-002 `profile.md` §3.4). Слушатель стоит над навигатором, поэтому
      // видит роутер и не зависит от открытого экрана.
      builder: (BuildContext context, Widget? child) => PushListener(child: child ?? const SizedBox.shrink()),
    );
  }
}
