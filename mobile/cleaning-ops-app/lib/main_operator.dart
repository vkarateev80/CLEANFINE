import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/app_product.dart';

/// Точка входа «CLEANFINE Оператор»:
///   flutter run --flavor operator -t lib/main_operator.dart
/// (`lib/main.dart` делает то же самое — он остаётся для лончеров и тестов.)
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  runApp(
    ProviderScope(
      overrides: <Override>[
        appProductProvider.overrideWithValue(ProductConfig.of(AppProduct.operator)),
      ],
      child: const CleaningOpsApp(),
    ),
  );
}
