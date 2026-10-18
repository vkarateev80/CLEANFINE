import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../database/app_cache.dart';
import '../database/app_database.dart';
import '../database/database_provider.dart';
import '../shared/data/pending_actions.dart';
import 'floor_plan_cache.dart';
import '../core/i18n/app_language.dart';

/// Сколько места занимает кэш: «Размер кэша» в профиле (`profile.md` §3.5).
class CacheUsage {
  const CacheUsage({
    required this.plansBytes,
    required this.photosBytes,
    required this.databaseBytes,
  });

  const CacheUsage.empty()
      : plansBytes = 0,
        photosBytes = 0,
        databaseBytes = 0;

  final int plansBytes;
  final int photosBytes;
  final int databaseBytes;

  /// Порог предупреждения из DS-002 `offline.md` §3.
  static const int warningThresholdBytes = 200 * 1024 * 1024;

  int get totalBytes => plansBytes + photosBytes + databaseBytes;

  bool get isLow => totalBytes >= warningThresholdBytes;

  /// Размер в мегабайтах для текста «Мало места: {N} МБ. Очистите кэш.».
  int get megabytes => (totalBytes / (1024 * 1024)).round();

  /// Человекочитаемая строка для профиля: «12,4 МБ».
  String get label {
    if (totalBytes < 1024 * 1024) {
      return '${(totalBytes / 1024).toStringAsFixed(0)} ${tr('КБ')}';
    }
    final double mb = totalBytes / (1024 * 1024);
    return '${mb.toStringAsFixed(mb >= 100 ? 0 : 1).replaceAll('.', ',')} ${tr('МБ')}';
  }
}

/// Обслуживание кэша чтения: размер и очистка (М6.7, `offline.md` §3).
///
/// Очистка не трогает очередь действий и GPS-буфер: в них лежат ещё не
/// отправленные данные оператора (`profile.md` п. 11.7). Фото, на которые
/// ссылается очередь, тоже остаются — иначе действие уйдёт без снимка.
class CacheMaintenance {
  CacheMaintenance({
    required AppDatabase database,
    required PendingActionQueue queue,
    Future<Directory> Function()? documentsDirectory,
  })  : _database = database,
        _queue = queue,
        _documentsDirectory = documentsDirectory ?? getApplicationDocumentsDirectory;

  /// Имя каталога фото задано `photo_service.dart` (в спецификации — `photos_dir`).
  static const String photosDirectoryName = 'photos';

  final AppDatabase _database;
  final PendingActionQueue _queue;
  final Future<Directory> Function() _documentsDirectory;

  Future<CacheUsage> usage() async {
    final Directory base = await _documentsDirectory();
    return CacheUsage(
      plansBytes: await directorySize(Directory('${base.path}/${FloorPlanCache.directoryName}')),
      photosBytes: await directorySize(Directory('${base.path}/$photosDirectoryName')),
      databaseBytes: await _databaseSize(base),
    );
  }

  /// «Очистить кэш планов и фото» (`profile.md` §3.5): планы, отправленные фото
  /// и таблицы кэша чтения.
  Future<void> clearCache() async {
    final Directory base = await _documentsDirectory();

    final Directory plans = Directory('${base.path}/${FloorPlanCache.directoryName}');
    if (plans.existsSync()) await plans.delete(recursive: true);

    final Set<String> keep = await _queuedPhotoPaths();
    final Directory photos = Directory('${base.path}/$photosDirectoryName');
    if (photos.existsSync()) {
      await for (final FileSystemEntity entity in photos.list()) {
        if (entity is File && !keep.contains(entity.path)) await entity.delete();
      }
    }

    await _database.clearCachedTables();
  }

  /// Пути фото, которые ещё нужны очереди: их отправка не завершена.
  Future<Set<String>> _queuedPhotoPaths() async {
    final Set<String> paths = <String>{};
    for (final PendingAction action in await _queue.all()) {
      if (!action.isOutgoing) continue;
      final dynamic path = action.payload['localPhotoPath'];
      if (path is String && path.isNotEmpty) paths.add(path);
    }
    return paths;
  }

  Future<int> _databaseSize(Directory base) async {
    final File file = File('${base.path}/$appDatabaseFileName');
    if (file.existsSync()) return file.length();
    // Файла ещё нет (база в памяти или не открывалась) — размер неизвестен.
    return 0;
  }
}

final cacheMaintenanceProvider = Provider<CacheMaintenance>((Ref ref) {
  return CacheMaintenance(
    database: ref.watch(appDatabaseProvider),
    queue: ref.watch(pendingActionQueueProvider),
  );
});

/// Размер кэша для профиля: пересчитывается при каждом открытии экрана.
final cacheUsageProvider = FutureProvider.autoDispose<CacheUsage>((Ref ref) {
  return ref.watch(cacheMaintenanceProvider).usage();
});
