import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/i18n/app_language.dart';
import 'core/app_product.dart';

/// Точка входа «CLEANFINE Команда» (бригадир, менеджер, заказчик):
///   flutter run --flavor team -t lib/main_team.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeAppDateFormatting();
  runApp(
    ProviderScope(
      overrides: <Override>[
        appProductProvider.overrideWithValue(ProductConfig.of(AppProduct.team)),
      ],
      child: const CleaningOpsApp(),
    ),
  );
}
