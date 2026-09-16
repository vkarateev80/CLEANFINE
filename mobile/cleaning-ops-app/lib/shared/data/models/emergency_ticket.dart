// Модели аварийной заявки (SOS, М6.5).

/// Оператор, которому ушло оповещение о SOS (`nearbyOperators`).
class NearbyOperator {
  const NearbyOperator({required this.userId, this.distanceMeters});

  final String userId;
  final int? distanceMeters;

  static NearbyOperator? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? userId = body['userId']?.toString();
    if (userId == null || userId.isEmpty) return null;
    final dynamic distance = body['distanceMeters'];
    return NearbyOperator(
      userId: userId,
      distanceMeters: distance is num ? distance.round() : int.tryParse(distance?.toString() ?? ''),
    );
  }

  static List<NearbyOperator> listFrom(dynamic body) {
    if (body is! List) return const <NearbyOperator>[];
    return body.map(NearbyOperator.tryParse).whereType<NearbyOperator>().toList(growable: false);
  }
}

/// Ответ `POST /api/tickets/emergency`: заявка плюс найденные ближние операторы.
class EmergencyTicket {
  const EmergencyTicket({
    required this.id,
    required this.type,
    required this.priority,
    required this.status,
    required this.description,
    this.objectId,
    this.roomId,
    this.lat,
    this.lng,
    this.createdAt,
    this.reactionDeadline,
    this.nearbyOperators = const <NearbyOperator>[],
  });

  final String id;
  final String type;
  final String priority;
  final String status;
  final String description;
  final String? objectId;
  final String? roomId;
  final double? lat;
  final double? lng;
  final String? createdAt;

  /// Таймер реакции на аварию — сервер проставляет его для `new`.
  final String? reactionDeadline;

  final List<NearbyOperator> nearbyOperators;

  int get notifiedCount => nearbyOperators.length;

  static EmergencyTicket? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return EmergencyTicket(
      id: id,
      type: body['type']?.toString() ?? 'emergency',
      priority: body['priority']?.toString() ?? 'critical',
      status: body['status']?.toString() ?? 'new',
      description: body['description']?.toString() ?? '',
      objectId: _text(body['objectId']),
      roomId: _text(body['roomId']),
      lat: _double(body['lat']),
      lng: _double(body['lng']),
      createdAt: _text(body['createdAt']),
      reactionDeadline: _text(body['reactionDeadline']),
      nearbyOperators: NearbyOperator.listFrom(body['nearbyOperators']),
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static double? _double(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }
}
