import 'package:flutter/material.dart';

import 'features/admin_web/admin_web_app.dart';

/// Точка входа «CLEANFINE Админ»:
///   flutter run --flavor admin -t lib/main_admin.dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AdminWebApp());
}
