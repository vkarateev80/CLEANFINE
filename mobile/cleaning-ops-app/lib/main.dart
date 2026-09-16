import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Русские месяцы и дни недели в датах интерфейса (`Formatters`).
  await initializeDateFormatting('ru');
  runApp(const ProviderScope(child: CleaningOpsApp()));
}
