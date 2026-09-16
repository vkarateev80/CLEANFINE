import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants/api_constants.dart';
import 'api_client.dart';
import 'secure_storage_service.dart';

/// Общие сервисы приложения. Фичи не создают их сами: иначе появится несколько
/// независимых экземпляров Dio и хранилища токенов.
final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

/// Мост «401 → обновить токены → повторить запрос». Обработчики регистрирует
/// auth-контроллер (`SessionController.attachBridge`).
final sessionBridgeProvider = Provider<SessionBridge>((ref) {
  return SessionBridge();
});

/// HTTP-клиент сервиса по его базовому адресу; один экземпляр на адрес.
final apiClientProvider = Provider.family<ApiClient, String>((ref, baseUrl) {
  return ApiClient(
    baseUrl: baseUrl,
    tokenStore: ref.watch(secureStorageProvider),
    sessionBridge: ref.watch(sessionBridgeProvider),
  );
});

final authApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.authBaseUrl)),
);
final coreApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.coreBaseUrl)),
);
final filesApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.filesBaseUrl)),
);
final gpsApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.gpsBaseUrl)),
);
final ticketsApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.ticketsBaseUrl)),
);
final scheduleApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.scheduleBaseUrl)),
);
final notificationsApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.notificationsBaseUrl)),
);
final chatApiProvider = Provider<ApiClient>(
  (ref) => ref.watch(apiClientProvider(ApiConstants.chatBaseUrl)),
);
