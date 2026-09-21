import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../database/database_provider.dart';
import 'cache_store.dart';

/// Кэш чтения оффлайна (DS-002 `offline.md` §3). Один экземпляр на приложение:
/// под ним — та же drift-база, что и у очереди действий.
final cacheStoreProvider = Provider<CacheStore>((Ref ref) {
  return CacheStore(ref.watch(appDatabaseProvider));
});

/// Время последней записи кэша: «Данные от {HH:mm}» на экранах без своего
/// набора данных (`/profile`, `/chats`).
final lastCacheUpdatedAtProvider = FutureProvider.autoDispose<DateTime?>((Ref ref) {
  return ref.watch(cacheStoreProvider).lastUpdatedAt();
});
