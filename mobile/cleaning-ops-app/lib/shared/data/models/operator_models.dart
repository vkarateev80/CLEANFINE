// Краткие модели core-service и ticket-service для экранов оператора.

/// `GET /api/objects/:id` — объект смены.
class ObjectSummary {
  const ObjectSummary({required this.id, required this.name, this.address});

  final String id;
  final String name;
  final String? address;

  static ObjectSummary? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return ObjectSummary(
      id: id,
      name: body['name']?.toString() ?? 'Объект',
      address: _text(body['address']),
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}

/// `GET /api/routes/:id` — маршрут с точками (нужен для «Сегодня» и «Маршрута»).
class RouteDetail {
  const RouteDetail({
    required this.id,
    required this.name,
    required this.status,
    required this.points,
    this.floorId,
    this.totalEstimatedTimeMin,
  });

  final String id;
  final String name;
  final String status;
  final List<RoutePointView> points;
  final String? floorId;
  final int? totalEstimatedTimeMin;

  int get pointsCount => points.length;

  /// Сумма времени операций, если сервер её посчитал.
  int get estimatedMinutes =>
      totalEstimatedTimeMin ??
      points.fold<int>(0, (int sum, RoutePointView point) => sum + (point.estimatedTimeMin ?? 0));

  static RouteDetail? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    final dynamic rawFloor = body['floorId'] ?? (body['floor'] is Map ? (body['floor'] as Map)['id'] : null);
    return RouteDetail(
      id: id,
      name: body['name']?.toString() ?? 'Маршрут',
      status: body['status']?.toString() ?? 'DRAFT',
      points: RoutePointView.listFrom(body['points']),
      floorId: rawFloor?.toString(),
      totalEstimatedTimeMin: _int(body['totalEstimatedTimeMin']),
    );
  }

  static int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '');
  }
}

/// Точка маршрута: комната, её координаты на плане и время операций.
class RoutePointView {
  const RoutePointView({
    required this.id,
    required this.roomId,
    required this.orderIndex,
    this.roomName,
    this.roomNumber,
    this.floorId,
    this.coordsX,
    this.coordsY,
    this.coordsWidth,
    this.coordsHeight,
    this.estimatedTimeMin,
  });

  final String id;
  final String roomId;
  final int orderIndex;
  final String? roomName;
  final String? roomNumber;
  final String? floorId;
  final int? coordsX;
  final int? coordsY;
  final int? coordsWidth;
  final int? coordsHeight;
  final int? estimatedTimeMin;

  /// Подпись точки в списке и на плане: «Санузел 101».
  String get title {
    final String name = roomName ?? 'Помещение';
    return roomNumber == null || roomNumber!.isEmpty ? name : '$name $roomNumber';
  }

  /// Точка пригодна для отрисовки: координаты обязательны (иначе рисуем списком).
  bool get hasCoords => coordsX != null && coordsY != null;

  static RoutePointView? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    final String? roomId = (body['roomId'] ?? (body['room'] is Map ? (body['room'] as Map)['id'] : null))?.toString();
    if (id == null || roomId == null) return null;
    final Map<dynamic, dynamic> room = body['room'] is Map ? body['room'] as Map : const <dynamic, dynamic>{};
    return RoutePointView(
      id: id,
      roomId: roomId,
      orderIndex: RouteDetail._int(body['orderIndex']) ?? 0,
      roomName: (room['name'] ?? body['roomName'])?.toString(),
      roomNumber: (room['number'] ?? body['roomNumber'])?.toString(),
      floorId: (room['floorId'] ?? body['floorId'])?.toString(),
      coordsX: RouteDetail._int(room['coordsX'] ?? body['coordsX']),
      coordsY: RouteDetail._int(room['coordsY'] ?? body['coordsY']),
      coordsWidth: RouteDetail._int(room['coordsWidth'] ?? body['coordsWidth']),
      coordsHeight: RouteDetail._int(room['coordsHeight'] ?? body['coordsHeight']),
      estimatedTimeMin: RouteDetail._int(body['estimatedTimeMin']),
    );
  }

  static List<RoutePointView> listFrom(dynamic body) {
    if (body is! List) return const <RoutePointView>[];
    final List<RoutePointView> points =
        body.map(RoutePointView.tryParse).whereType<RoutePointView>().toList();
    points.sort((RoutePointView a, RoutePointView b) => a.orderIndex.compareTo(b.orderIndex));
    return points;
  }
}

/// `GET /api/floors/:id` — план этажа.
class FloorPlan {
  const FloorPlan({
    required this.id,
    required this.number,
    this.planImageUrl,
    this.planWidth,
    this.planHeight,
  });

  final String id;
  final int number;
  final String? planImageUrl;
  final int? planWidth;
  final int? planHeight;

  bool get hasPlan => planImageUrl != null && planImageUrl!.isNotEmpty;

  /// Размеры плана для координатной сетки; по умолчанию — 1000×1000 условных единиц.
  int get width => planWidth ?? 1000;
  int get height => planHeight ?? 1000;

  static FloorPlan? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return FloorPlan(
      id: id,
      number: RouteDetail._int(body['number']) ?? 1,
      planImageUrl: _text(body['planImageUrl'] ?? body['planUrl']),
      planWidth: RouteDetail._int(body['planWidth']),
      planHeight: RouteDetail._int(body['planHeight']),
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}

/// `GET /api/tickets?assigneeId=...` — карточка заявки в списке.
class TicketSummary {
  const TicketSummary({
    required this.id,
    required this.status,
    required this.type,
    required this.priority,
    required this.description,
    this.objectId,
    this.roomId,
    this.arrivalDeadline,
    this.completionDeadline,
    this.updatedAt,
  });

  final String id;
  final String status;
  final String type;
  final String priority;
  final String description;
  final String? objectId;
  final String? roomId;
  final String? arrivalDeadline;
  final String? completionDeadline;
  final String? updatedAt;

  bool get isClosed => status == 'closed' || status == 'verified' || status == 'rejected';

  /// Срок показа: сначала срок выполнения, затем срок прибытия.
  String? get deadline => completionDeadline ?? arrivalDeadline;

  static TicketSummary? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return TicketSummary(
      id: id,
      status: body['status']?.toString() ?? 'new',
      type: body['type']?.toString() ?? 'planned',
      priority: body['priority']?.toString() ?? 'normal',
      description: body['description']?.toString() ?? '',
      objectId: _text(body['objectId']),
      roomId: _text(body['roomId']),
      arrivalDeadline: _text(body['arrivalDeadline']),
      completionDeadline: _text(body['completionDeadline']),
      updatedAt: _text(body['updatedAt'] ?? body['createdAt']),
    );
  }

  static List<TicketSummary> listFrom(dynamic body) {
    final dynamic items = body is Map ? body['items'] : body;
    if (items is! List) return const <TicketSummary>[];
    return items.map(TicketSummary.tryParse).whereType<TicketSummary>().toList(growable: false);
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}
