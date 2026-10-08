import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../database/app_cache.dart';
import '../database/app_database.dart';
import '../database/database_provider.dart';
import '../features/profile/presentation/providers/profile_providers.dart';
import 'cache_maintenance.dart';
import 'floor_plan_cache.dart';

/// Данные пользователя на устройстве: стираются при выходе и при входе другого
/// пользователя (`profile.md` §3.5 — «очистка secure storage, drift (все
/// таблицы), файловых кэшей»).
///
/// Без этого следующий вошедший видел смены, заявки и чаты прежнего (экраны
/// читают «сначала кэш, потом сеть»), а очередь и GPS-буфер уходили бы на сервер
/// под чужим токеном.
class UserDataCleaner {
  UserDataCleaner({
    required AppDatabase database,
    Future<Directory> Function()? documentsDirectory,
  })  : _database = database,
        _documentsDirectory = documentsDirectory ?? getApplicationDocumentsDirectory;

  final AppDatabase _database;
  final Future<Directory> Function() _documentsDirectory;

  /// Таблицы drift — обязательно (по ним рисуются экраны); файлы — фоном и
  /// best-effort: `path_provider` в тестах не отвечает, а планы и фото без строк
  /// базы уже ни на что не ссылаются.
  Future<void> clear() async {
    await _database.clearUserData();
    unawaited(_deleteFiles());
  }

  Future<void> _deleteFiles() async {
    try {
      final Directory base = await _documentsDirectory();
      for (final String name in <String>[
        FloorPlanCache.directoryName,
        CacheMaintenance.photosDirectoryName,
        AvatarCache.directoryName,
      ]) {
        final Directory dir = Directory('${base.path}/$name');
        if (dir.existsSync()) await dir.delete(recursive: true);
      }
    } on Object {
      // Файловый кэш — оптимизация: его остатки не видны без строк базы.
    }
  }
}

final userDataCleanerProvider = Provider<UserDataCleaner>((Ref ref) {
  return UserDataCleaner(database: ref.watch(appDatabaseProvider));
});
