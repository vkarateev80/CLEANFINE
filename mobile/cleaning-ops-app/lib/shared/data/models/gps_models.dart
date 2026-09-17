// Модели gps-service (М6.6).

/// Одна точка трека для `POST /api/gps/track` (УСТАВ → Агент Backend GPS, п. 2).
class GpsTrackPoint {
  const GpsTrackPoint({
    required this.lat,
    required this.lng,
    required this.timestamp,
    this.accuracy,
    this.speed,
    this.battery,
  });

  final double lat;
  final double lng;

  /// Время фиксации точки; на сервер уходит в UTC.
  final DateTime timestamp;

  /// Точность GPS, м.
  final double? accuracy;

  /// Скорость, м/с — по ней выбирается интервал отправки.
  final double? speed;

  /// Заряд батареи, %: в стеке устава нет плагина батареи, поэтому поле может быть `null`.
  final int? battery;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'lat': lat,
        'lng': lng,
        'timestamp': timestamp.toUtc().toIso8601String(),
        if (accuracy != null) 'accuracy': accuracy,
        if (speed != null) 'speed': speed,
        if (battery != null) 'battery': battery,
      };
}

/// Выход из геозоны, зафиксированный сервером при приёме батча.
class GpsGeofenceExit {
  const GpsGeofenceExit({required this.userId, this.geofenceId, this.at});

  final String userId;
  final String? geofenceId;
  final String? at;

  static GpsGeofenceExit? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? userId = body['userId']?.toString();
    if (userId == null || userId.isEmpty) return null;
    return GpsGeofenceExit(
      userId: userId,
      geofenceId: _text(body['geofenceId']),
      at: _text(body['timestamp'] ?? body['at']),
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}

/// Ответ `POST /api/gps/track`: `{userId, accepted, employeeName, lastPointAt, geofenceExits}`.
class GpsTrackResult {
  const GpsTrackResult({
    required this.accepted,
    this.userId,
    this.lastPointAt,
    this.geofenceExits = const <GpsGeofenceExit>[],
  });

  /// Сколько точек принято — по нему буфер чистится, а не «по факту запроса».
  final int accepted;
  final String? userId;
  final String? lastPointAt;
  final List<GpsGeofenceExit> geofenceExits;

  static GpsTrackResult? tryParse(dynamic body) {
    if (body is! Map) return null;
    final dynamic accepted = body['accepted'];
    if (accepted is! num) return null;
    final dynamic exits = body['geofenceExits'];
    return GpsTrackResult(
      accepted: accepted.round(),
      userId: _text(body['userId']),
      lastPointAt: _text(body['lastPointAt']),
      geofenceExits: exits is List
          ? exits.map(GpsGeofenceExit.tryParse).whereType<GpsGeofenceExit>().toList(growable: false)
          : const <GpsGeofenceExit>[],
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}
