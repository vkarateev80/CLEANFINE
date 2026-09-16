import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

/// Локальная биометрия устройства (`local_auth`).
///
/// Интерфейс, а не прямое использование плагина: widget-тесты подменяют его
/// фейком и не трогают платформенные каналы.
abstract class BiometricAuthService {
  /// Есть ли на устройстве доступная биометрия (датчик + зарегистрированные
  /// отпечатки/лицо). Ложь — кнопки биометрии на экранах входа нет вовсе.
  Future<bool> isAvailable();

  /// Показывает системный диалог. `true` — пользователь подтвердил личность.
  Future<bool> authenticate({required String reason});
}

/// Реализация поверх `local_auth`.
///
/// Плагин бросает `PlatformException` (нет датчика, отмена, блокировка) —
/// наружу это не исключение, а «не подтверждено»: экран просто ничего не делает.
class LocalAuthBiometricService implements BiometricAuthService {
  LocalAuthBiometricService({LocalAuthentication? authentication})
      : _auth = authentication ?? LocalAuthentication();

  final LocalAuthentication _auth;

  @override
  Future<bool> isAvailable() async {
    try {
      if (!await _auth.isDeviceSupported()) return false;
      return await _auth.canCheckBiometrics;
    } on PlatformException {
      return false;
    } on Exception {
      return false;
    }
  }

  @override
  Future<bool> authenticate({required String reason}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          // Вход по отпечатку, а не по PIN устройства: PIN приложения — отдельный
          // способ входа, и подменять его системным нельзя (`overview.md` §10).
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    } on PlatformException {
      return false;
    } on Exception {
      return false;
    }
  }
}
