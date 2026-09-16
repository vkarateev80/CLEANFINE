import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../../core/errors/exceptions.dart';
import '../models/pin_credentials.dart';

/// Локальные данные устройства для входа по PIN (`auth.md` §2).
///
/// Отдельный контракт, а не методы `SecureStorageService`: тот файл — общий
/// сервис каркаса, а ключи PIN (`pin_email`, `pin_phone`, `pin_length`) описаны
/// в пакете входа. Реализация — [SecurePinCredentialsStore]; тесты подменяют
/// интерфейс in-memory реализацией и не поднимают платформенный Keychain.
abstract class PinCredentialsStore {
  Future<PinCredentials> read();

  Future<void> saveEmail(String email);

  Future<void> savePhone(String phone);

  /// Длина установленного PIN — для автоотправки при вводе (`§4.3`).
  Future<void> saveLength(int length);

  Future<void> clear();
}

/// Ключи защищённого хранилища, которыми пользуется только вход по PIN.
class PinStorageKeys {
  const PinStorageKeys._();

  static const String email = 'pin_email';
  static const String phone = 'pin_phone';
  static const String length = 'pin_length';
}

/// `flutter_secure_storage` — тот же Keychain/EncryptedSharedPreferences, что и
/// у токенов, но со своим экземпляром: `SecureStorageService` не отдаёт свой.
class SecurePinCredentialsStore implements PinCredentialsStore {
  SecurePinCredentialsStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  @override
  Future<PinCredentials> read() async {
    try {
      final String? email = await _storage.read(key: PinStorageKeys.email);
      final String? phone = await _storage.read(key: PinStorageKeys.phone);
      final String? length = await _storage.read(key: PinStorageKeys.length);
      return PinCredentials(
        email: email,
        phone: phone,
        length: length == null ? null : int.tryParse(length),
      );
    } on Exception catch (error) {
      throw StorageException('Не удалось прочитать данные PIN: $error');
    }
  }

  @override
  Future<void> saveEmail(String email) => _write(PinStorageKeys.email, email);

  @override
  Future<void> savePhone(String phone) => _write(PinStorageKeys.phone, phone);

  @override
  Future<void> saveLength(int length) => _write(PinStorageKeys.length, '$length');

  @override
  Future<void> clear() async {
    for (final String key in <String>[
      PinStorageKeys.email,
      PinStorageKeys.phone,
      PinStorageKeys.length,
    ]) {
      try {
        await _storage.delete(key: key);
      } on Exception catch (error) {
        throw StorageException('Не удалось удалить $key: $error');
      }
    }
  }

  Future<void> _write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } on Exception catch (error) {
      throw StorageException('Не удалось сохранить $key: $error');
    }
  }
}
