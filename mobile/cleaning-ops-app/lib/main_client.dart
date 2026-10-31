import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/i18n/app_language.dart';
import 'core/app_product.dart';

/// Точка входа «CLEANFINE Клиент» (заказчик):
///   flutter run --flavor client -t lib/main_client.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeAppDateFormatting();
  runApp(
    ProviderScope(
      overrides: <Override>[
        appProductProvider.overrideWithValue(ProductConfig.of(AppProduct.client)),
      ],
      child: const CleaningOpsApp(),
    ),
  );
}
