import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

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

/// Интерфейс геолокации: экраны не обращаются к `geolocator` напрямую,
/// иначе widget-тесты упирались бы в платформенные каналы.
abstract class LocationService {
  Future<GeoPoint> currentPosition();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  @override
  Future<GeoPoint> currentPosition() async {
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
      return GeoPoint(position.latitude, position.longitude);
    } on LocationUnavailable {
      rethrow;
    } on Exception {
      // Таймаут или сбой платформы — для оператора это одна и та же ситуация.
      throw const LocationUnavailable('Не удалось определить местоположение');
    }
  }
}

final locationServiceProvider = Provider<LocationService>((ref) {
  return const GeolocatorLocationService();
});
