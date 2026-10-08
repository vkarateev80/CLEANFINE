import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/errors/exceptions.dart';
import 'api_client.dart';

/// Ключи защищённого хранилища. Значения — часть контракта: их читают
/// `ApiClient` (токены) и фича авторизации (биометрия, PIN).
class StorageKeys {
  const StorageKeys._();

  static const String accessToken = 'access_token';
  static const String refreshToken = 'refresh_token';
  static const String biometricKey = 'biometric_key';
  static const String userId = 'user_id';
  static const String role = 'user_role';

  /// Чьи данные лежат в локальной базе и файловых кэшах. Переживает выход:
  /// по нему вход другого пользователя понимает, что чужие данные надо стереть.
  static const String dataOwner = 'data_owner_id';
}

/// Токены, биометрический ключ и данные сессии — в Keychain/EncryptedSharedPreferences.
///
/// Реализует [TokenStore], поэтому `ApiClient` читает токены отсюда и не знает,
/// как именно они защищены.
class SecureStorageService implements TokenStore {
  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // v11: encryptedSharedPreferences — режим по умолчанию, флаг удалён.
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
              // Data Protection keychain требует подписи с AppIdentifierPrefix;
              // ad-hoc/локальная сборка даёт -34018. На macOS берём классический
              // keychain (аргумент «не применим на iOS»).
              mOptions: MacOsOptions(usesDataProtectionKeychain: false),
            );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() => _read(StorageKeys.accessToken);

  @override
  Future<String?> readRefreshToken() => _read(StorageKeys.refreshToken);

  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    await _write(StorageKeys.accessToken, accessToken);
    await _write(StorageKeys.refreshToken, refreshToken);
  }

  @override
  Future<void> clearTokens() async {
    await _delete(StorageKeys.accessToken);
    await _delete(StorageKeys.refreshToken);
  }

  /// Биометрический ключ приходит с сервера после первого входа по паролю.
  Future<String?> readBiometricKey() => _read(StorageKeys.biometricKey);

  Future<void> saveBiometricKey(String value) => _write(StorageKeys.biometricKey, value);

  Future<void> deleteBiometricKey() => _delete(StorageKeys.biometricKey);

  Future<String?> readUserId() => _read(StorageKeys.userId);

  Future<void> saveUserId(String value) => _write(StorageKeys.userId, value);

  Future<String?> readRole() => _read(StorageKeys.role);

  Future<void> saveRole(String value) => _write(StorageKeys.role, value);

  Future<String?> readDataOwner() => _read(StorageKeys.dataOwner);

  Future<void> saveDataOwner(String value) => _write(StorageKeys.dataOwner, value);

  /// Полный выход: чистим только сессию, биометрический ключ устройства остаётся
  /// (иначе после выхода пришлось бы заново включать биометрию).
  ///
  /// После удаления токены перечитываются: если Keychain всё ещё отдаёт значение
  /// (запись другой версии плагина/уровня доступа), удаление повторяется — иначе
  /// следующий refresh поднял бы сессию прежнего пользователя.
  Future<void> clearSession() async {
    await clearTokens();
    await _delete(StorageKeys.userId);
    await _delete(StorageKeys.role);
    for (int attempt = 0; attempt < 2; attempt++) {
      final String? access = await _read(StorageKeys.accessToken);
      final String? refresh = await _read(StorageKeys.refreshToken);
      if (access == null && refresh == null) return;
      await clearTokens();
    }
    throw const StorageException('Не удалось удалить токены сессии');
  }

  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } on Exception catch (error) {
      throw StorageException('Не удалось прочитать $key: $error');
    }
  }

  Future<void> _write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } on Exception catch (error) {
      throw StorageException('Не удалось сохранить $key: $error');
    }
  }

  Future<void> _delete(String key) async {
    try {
      await _storage.delete(key: key);
    } on Exception catch (error) {
      throw StorageException('Не удалось удалить $key: $error');
    }
  }
}
