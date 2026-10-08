import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/app_product.dart';
import '../../../../services/service_providers.dart';
import '../../data/datasources/auth_remote_datasource.dart';
import '../../data/datasources/pin_credentials_store.dart';
import '../../data/models/pin_credentials.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/services/biometric_auth_service.dart';
import 'session_provider.dart';

/// Данные устройства для входа по PIN (`pin_email`, `pin_phone`, `pin_length`).
final pinCredentialsProvider = Provider<PinCredentialsStore>((ref) {
  return SecurePinCredentialsStore();
});

/// Локальная биометрия устройства (`local_auth`).
final biometricAuthProvider = Provider<BiometricAuthService>((ref) {
  return LocalAuthBiometricService();
});

/// HTTP-доступ к auth-service: один `ApiClient` на весь пакет входа.
final authRemoteDataSourceProvider = Provider<AuthRemoteDataSource>((ref) {
  return AuthRemoteDataSource(ref.watch(authApiProvider));
});

/// Репозиторий авторизации — то, чем пользуется UI.
///
/// Сессию закрепляет `SessionController` (`sessionProvider.notifier`): он владеет
/// состоянием сессии и хранилищем токенов.
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    remote: ref.watch(authRemoteDataSourceProvider),
    storage: ref.watch(secureStorageProvider),
    session: ref.watch(sessionProvider.notifier),
    pinStore: ref.watch(pinCredentialsProvider),
    product: ref.watch(appProductProvider),
  );
});

/// Сохранённые на устройстве данные PIN (email/телефон/длина) — для подписи
/// на экране ввода и для автоотправки.
final pinCredentialsAsyncProvider = FutureProvider<PinCredentials>((ref) {
  return ref.watch(pinCredentialsProvider).read();
});

/// Показывать ли кнопки входа по отпечатку.
///
/// `auth.md` §4.3: ключа нет или датчик недоступен — кнопки нет вовсе.
/// Ошибку хранилища трактуем так же: «биометрия недоступна», а не падение экрана.
final biometricAvailabilityProvider = FutureProvider<bool>((ref) async {
  final storage = ref.watch(secureStorageProvider);
  final biometric = ref.watch(biometricAuthProvider);
  try {
    final String? key = await storage.readBiometricKey();
    if (key == null || key.isEmpty) return false;
    return await biometric.isAvailable();
  } on Exception {
    return false;
  }
});
