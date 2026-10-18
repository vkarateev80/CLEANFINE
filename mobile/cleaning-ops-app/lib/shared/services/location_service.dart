import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/i18n/app_language.dart';

/// Точка на карте (широта/долгота) — свой тип, чтобы тесты не зависели от geolocator.
class GeoPoint {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;
}

/// Местоположение недоступно: нет разрешения, сервис выключен или таймаут.
class LocationUnavailable implements Exception {
  const LocationUnavailable(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Состояние доступа к геолокации — для индикатора в профиле (М6.6).
enum LocationAccess {
  granted('Разрешено'),
  grantedWhileInUse('Разрешено при использовании'),
  denied('Отклонено'),
  deniedForever('Отклонено навсегда'),
  serviceDisabled('Служба геолокации выключена');

  const LocationAccess(this._label);

  /// Русская подпись — ключ перевода; на экран идёт `label`.
  final String _label;

  /// Подпись на языке интерфейса.
  String get label => tr(_label);

  bool get isGranted => this == granted || this == grantedWhileInUse;
}

/// Точка трека вместе с дополнительными полями (М6.6).
class LocationSample {
  const LocationSample({required this.point, this.accuracy, this.speed});

  final GeoPoint point;
  final double? accuracy;
  final double? speed;
}

/// Интерфейс геолокации: экраны не обращаются к `geolocator` напрямую,
/// иначе widget-тесты упирались бы в платформенные каналы.
abstract class LocationService {
  Future<GeoPoint> currentPosition();

  /// Точка с точностью и скоростью — их пишет трекер в буфер (`gps_points`).
  Future<LocationSample> currentSample();

  /// Статус разрешения (без запроса): «Разрешено», «Отклонено» и т. п.
  Future<LocationAccess> accessStatus();

  /// Системный экран разрешений приложения.
  Future<bool> openSettings();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  @override
  Future<GeoPoint> currentPosition() async => (await currentSample()).point;

  @override
  Future<LocationSample> currentSample() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const LocationUnavailable('Включите геолокацию на устройстве');
      }
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw const LocationUnavailable('Не удалось определить местоположение');
      }
      final Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      return LocationSample(
        point: GeoPoint(position.latitude, position.longitude),
        accuracy: position.accuracy,
        speed: position.speed,
      );
    } on LocationUnavailable {
      rethrow;
    } on Exception {
      // Таймаут или сбой платформы — для оператора это одна и та же ситуация.
      throw const LocationUnavailable('Не удалось определить местоположение');
    }
  }

  @override
  Future<LocationAccess> accessStatus() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
      final LocationPermission permission = await Geolocator.checkPermission();
      return switch (permission) {
        LocationPermission.always => LocationAccess.granted,
        LocationPermission.whileInUse => LocationAccess.grantedWhileInUse,
        LocationPermission.deniedForever => LocationAccess.deniedForever,
        LocationPermission.denied => LocationAccess.denied,
        _ => LocationAccess.denied,
      };
    } on Exception {
      return LocationAccess.denied;
    }
  }

  @override
  Future<bool> openSettings() => Geolocator.openAppSettings();
}

final locationServiceProvider = Provider<LocationService>((ref) {
  return const GeolocatorLocationService();
});
