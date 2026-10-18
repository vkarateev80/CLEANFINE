import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/i18n/app_language.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Русские месяцы и дни недели в датах интерфейса (`Formatters`).
  await initializeAppDateFormatting();
  runApp(const ProviderScope(child: CleaningOpsApp()));
}
