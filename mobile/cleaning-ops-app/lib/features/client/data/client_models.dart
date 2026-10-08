// Модели портала заказчика: объект (core-service) и заявки (ticket-service).
//
// Поля повторяют `frontend/web-client/src/types/{core,tickets}.ts`; даты —
// ISO-строки, как отдаёт сервер. Словари статусов — `shared/types/tickets.ts`.

String? _text(dynamic value) {
  if (value == null) return null;
  final String text = value.toString();
  return text.isEmpty ? null : text;
}

double _num(dynamic value) => value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;

int _int(dynamic value) => value is num ? value.toInt() : int.tryParse(value?.toString() ?? '') ?? 0;

/// Объект заказчика (`GET /api/objects?ownerClientId=…`).
class ClientObject {
  const ClientObject({
    required this.id,
    required this.name,
    required this.address,
    required this.type,
    required this.totalArea,
    required this.floorsCount,
    required this.status,
  });

  final String id;
  final String name;
  final String address;
  final String type;
  final double totalArea;
  final int floorsCount;

  /// `ACTIVE` / `PAUSED` / `ARCHIVED`.
  final String status;

  bool get isArchived => status == 'ARCHIVED';
  bool get isPaused => status == 'PAUSED';

  static ClientObject? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = _text(body['id']);
    if (id == null) return null;
    return ClientObject(
      id: id,
      name: _text(body['name']) ?? 'Объект',
      address: _text(body['address']) ?? '',
      type: _text(body['type']) ?? '—',
      totalArea: _num(body['totalArea']),
      floorsCount: _int(body['floorsCount']),
      status: _text(body['status']) ?? 'ACTIVE',
    );
  }

  static List<ClientObject> listFrom(dynamic body) {
    final dynamic items = body is Map ? body['items'] : body;
    if (items is! List) return const <ClientObject>[];
    return items.map(ClientObject.tryParse).whereType<ClientObject>().toList(growable: false);
  }
}

/// Этаж с помещениями из `GET /api/objects/:id/detail` — для счётчика помещений
/// и выбора «этаж → помещение» в форме заявки.
class ClientFloor {
  const ClientFloor({required this.id, required this.name, required this.number, required this.rooms});

  final String id;
  final String name;
  final int number;
  final List<ClientRoom> rooms;

  static ClientFloor? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = _text(body['id']);
    if (id == null) return null;
    final dynamic rooms = body['rooms'];
    return ClientFloor(
      id: id,
      name: _text(body['name']) ?? 'Этаж',
      number: _int(body['number']),
      rooms: rooms is List
          ? rooms.map(ClientRoom.tryParse).whereType<ClientRoom>().toList(growable: false)
          : const <ClientRoom>[],
    );
  }
}

class ClientRoom {
  const ClientRoom({required this.id, required this.name});

  final String id;
  final String name;

  static ClientRoom? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = _text(body['id']);
    if (id == null) return null;
    return ClientRoom(id: id, name: _text(body['name']) ?? 'Помещение');
  }
}

class ClientObjectDetail {
  const ClientObjectDetail({required this.floors});

  final List<ClientFloor> floors;

  int get roomsCount => floors.fold(0, (int sum, ClientFloor floor) => sum + floor.rooms.length);

  static ClientObjectDetail? tryParse(dynamic body) {
    if (body is! Map) return null;
    final dynamic floors = body['floors'];
    return ClientObjectDetail(
      floors: floors is List
          ? floors.map(ClientFloor.tryParse).whereType<ClientFloor>().toList(growable: false)
          : const <ClientFloor>[],
    );
  }
}

/// Статусы заявки (`shared/types/tickets.ts`) и их подписи.
class TicketStatuses {
  const TicketStatuses._();

  static const List<String> open = <String>['new', 'assigned', 'in_progress', 'paused', 'overdue'];
  static const List<String> done = <String>['completed', 'verified', 'closed'];

  static const Map<String, String> labels = <String, String>{
    'new': 'Новая',
    'assigned': 'Назначена',
    'in_progress': 'В работе',
    'paused': 'Приостановлена',
    'completed': 'Выполнена',
    'verified': 'Проверена',
    'rejected': 'Отклонена',
    'closed': 'Закрыта',
    'overdue': 'Просрочена',
  };

  static const Map<String, String> typeLabels = <String, String>{
    'planned': 'Плановая',
    'unscheduled': 'Внеплановая',
    'emergency': 'Аварийная (SOS)',
  };

  static const Map<String, String> priorityLabels = <String, String>{
    'low': 'Низкий',
    'normal': 'Обычный',
    'high': 'Высокий',
    'critical': 'Критичный',
  };

  static String label(String status) => labels[status] ?? status;
  static bool isDone(String status) => done.contains(status);
}

/// Заявка в списке (`GET /api/tickets` → `items[]`).
class ClientTicket {
  const ClientTicket({
    required this.id,
    required this.type,
    required this.priority,
    required this.status,
    required this.description,
    required this.createdAt,
    required this.updatedAt,
    this.roomId,
    this.assigneeId,
    this.assignedAt,
    this.acceptedAt,
    this.arrivedAt,
    this.completedAt,
    this.verifiedAt,
    this.closedAt,
    this.overdueAt,
    this.operationsTotal,
    this.commentsCount = 0,
  });

  final String id;
  final String type;
  final String priority;
  final String status;
  final String description;
  final String createdAt;
  final String updatedAt;
  final String? roomId;
  final String? assigneeId;
  final String? assignedAt;
  final String? acceptedAt;
  final String? arrivedAt;
  final String? completedAt;
  final String? verifiedAt;
  final String? closedAt;
  final String? overdueAt;
  final int? operationsTotal;
  final int commentsCount;

  bool get isOverdue => overdueAt != null;

  /// Короткий id для подписи карточки: первые 8 символов uuid, как в портале.
  String get shortId => id.length > 8 ? id.substring(0, 8) : id;

  /// Момент выполнения для «Выполнено за 30 дней»: `completedAt`, иначе `updatedAt`.
  String get doneAt => completedAt ?? updatedAt;

  static ClientTicket? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = _text(body['id']);
    if (id == null) return null;
    final dynamic count = body['_count'];
    return ClientTicket(
      id: id,
      type: _text(body['type']) ?? 'unscheduled',
      priority: _text(body['priority']) ?? 'normal',
      status: _text(body['status']) ?? 'new',
      description: _text(body['description']) ?? '',
      createdAt: _text(body['createdAt']) ?? '',
      updatedAt: _text(body['updatedAt']) ?? _text(body['createdAt']) ?? '',
      roomId: _text(body['roomId']),
      assigneeId: _text(body['assigneeId']),
      assignedAt: _text(body['assignedAt']),
      acceptedAt: _text(body['acceptedAt']),
      arrivedAt: _text(body['arrivedAt']),
      completedAt: _text(body['completedAt']),
      verifiedAt: _text(body['verifiedAt']),
      closedAt: _text(body['closedAt']),
      overdueAt: _text(body['overdueAt']),
      operationsTotal: body['operationsTotal'] == null ? null : _int(body['operationsTotal']),
      commentsCount: count is Map ? _int(count['comments']) : 0,
    );
  }
}

/// Страница списка: `{items, total}`.
class ClientTicketPage {
  const ClientTicketPage({required this.items, required this.total});

  final List<ClientTicket> items;
  final int total;

  static ClientTicketPage parse(dynamic body) {
    final dynamic items = body is Map ? body['items'] : body;
    final List<ClientTicket> list = items is List
        ? items.map(ClientTicket.tryParse).whereType<ClientTicket>().toList(growable: false)
        : const <ClientTicket>[];
    final int total = body is Map ? _int(body['total']) : list.length;
    return ClientTicketPage(items: list, total: total);
  }
}

class TicketComment {
  const TicketComment(
      {required this.id, required this.authorId, required this.text, required this.createdAt});

  final String id;
  final String authorId;
  final String text;
  final String createdAt;

  static TicketComment? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = _text(body['id']);
    if (id == null) return null;
    return TicketComment(
      id: id,
      authorId: _text(body['authorId']) ?? '',
      text: _text(body['text']) ?? '',
      createdAt: _text(body['createdAt']) ?? '',
    );
  }
}

/// Деталь заявки (`GET /api/tickets/:id`): заявка + комментарии + ход работы.
class ClientTicketDetail {
  const ClientTicketDetail({
    required this.ticket,
    required this.comments,
    required this.operationsCompleted,
  });

  final ClientTicket ticket;
  final List<TicketComment> comments;
  final int operationsCompleted;

  static ClientTicketDetail? tryParse(dynamic body) {
    final ClientTicket? ticket = ClientTicket.tryParse(body);
    if (ticket == null || body is! Map) return null;
    final dynamic comments = body['comments'];
    final dynamic operations = body['operations'];
    return ClientTicketDetail(
      ticket: ticket,
      comments: comments is List
          ? comments.map(TicketComment.tryParse).whereType<TicketComment>().toList(growable: false)
          : const <TicketComment>[],
      operationsCompleted: body['operationsCompleted'] != null
          ? _int(body['operationsCompleted'])
          : (operations is List ? operations.length : 0),
    );
  }
}
