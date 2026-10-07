// Модели core-service и ticket-service для чек-листа помещения (М6.4).

/// `GET /api/rooms/:id` — помещение с привязкой к техкарте.
class RoomDetail {
  const RoomDetail({
    required this.id,
    required this.name,
    this.floorId,
    this.techCardId,
    this.floorType,
    this.zone,
  });

  final String id;
  final String name;
  final String? floorId;

  /// `null` — техкарта помещению не назначена (экран покажет «Техкарта не назначена»).
  final String? techCardId;

  /// Тип помещения («Санузел», «Офис») — по нему выводится цвет инвентаря
  /// (`ColorZone.forRoom`); `null` у записей кэша до первой загрузки с сервера.
  final String? floorType;

  /// Зона («Красная зона», «Зона A») — может задать цвет инвентаря явно.
  final String? zone;

  static RoomDetail? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return RoomDetail(
      id: id,
      name: body['name']?.toString() ?? 'Помещение',
      floorId: _textOf(body['floorId']),
      techCardId: _textOf(body['techCardId']),
      floorType: _textOf(body['floorType']),
      zone: _textOf(body['zone']),
    );
  }
}

/// Материал операции: расход и единица. Остатков нет — списание делает
/// material-service по событию `ticket.operation.completed`, приложение лишь
/// показывает «Материалы: {N} поз.; спишет сервер».
class OperationMaterial {
  const OperationMaterial({
    required this.materialId,
    required this.consumptionPerOperation,
    required this.unit,
  });

  final String materialId;
  final double consumptionPerOperation;
  final String unit;

  static OperationMaterial? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? materialId = body['materialId']?.toString();
    if (materialId == null || materialId.isEmpty) return null;
    final dynamic consumption = body['consumptionPerOperation'];
    return OperationMaterial(
      materialId: materialId,
      consumptionPerOperation: consumption is num
          ? consumption.toDouble()
          : double.tryParse(consumption?.toString() ?? '') ?? 0,
      unit: body['unit']?.toString() ?? '',
    );
  }

  static List<OperationMaterial> listFrom(dynamic body) {
    if (body is! List) return const <OperationMaterial>[];
    return body
        .map(OperationMaterial.tryParse)
        .whereType<OperationMaterial>()
        .toList(growable: false);
  }

  /// Обратная сторона [tryParse] — форма API для `checklist_operations` и
  /// `cached_tech_cards.operationsJson` (DS-002 `offline.md` §3).
  Map<String, dynamic> toJson() => <String, dynamic>{
        'materialId': materialId,
        'consumptionPerOperation': consumptionPerOperation,
        'unit': unit,
      };
}

/// Операция техкарты (`GET /api/tech-cards/:id` → `operations[]`, по `orderIndex`).
class TechOperation {
  const TechOperation({
    required this.id,
    required this.name,
    required this.orderIndex,
    required this.estimatedTimeMin,
    this.description,
    this.equipment = const <String, dynamic>{},
    this.requiresPhoto = false,
    this.requiresQr = false,
    this.materials = const <OperationMaterial>[],
  });

  final String id;
  final String name;
  final int orderIndex;
  final int estimatedTimeMin;
  final String? description;

  /// Произвольный JSON: `{items: ['швабра'], ppe: ['перчатки']}` или любые ключи.
  final Map<String, dynamic> equipment;

  final bool requiresPhoto;
  final bool requiresQr;
  final List<OperationMaterial> materials;

  /// Норма времени операции в минутах (`TechOperation.estimatedTimeMin`).
  Duration get norm => Duration(minutes: estimatedTimeMin);

  bool get hasMaterials => materials.isNotEmpty;

  /// Строки для раскрытой карточки: сначала `items`/`ppe`, иначе `key: value`.
  List<String> get equipmentLines {
    if (equipment.isEmpty) return const <String>[];
    final List<String> lines = <String>[];
    for (final String key in const <String>['items', 'ppe']) {
      final dynamic value = equipment[key];
      if (value is List) {
        lines.addAll(value.map((dynamic item) => item.toString()).where((String s) => s.isNotEmpty));
      } else if (value != null && value.toString().isNotEmpty) {
        lines.add(value.toString());
      }
    }
    if (lines.isNotEmpty) return lines;

    return equipment.entries
        .map((MapEntry<String, dynamic> entry) => '${entry.key}: ${entry.value}')
        .toList(growable: false);
  }

  static TechOperation? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    final dynamic equipment = body['equipment'];
    return TechOperation(
      id: id,
      name: body['name']?.toString() ?? 'Операция',
      orderIndex: _intOf(body['orderIndex']) ?? 0,
      estimatedTimeMin: _intOf(body['estimatedTimeMin']) ?? 1,
      description: _textOf(body['description']),
      equipment: equipment is Map
          ? equipment.map(
              (dynamic key, dynamic value) => MapEntry<String, dynamic>(key.toString(), value),
            )
          : const <String, dynamic>{},
      requiresPhoto: body['requiresPhoto'] == true,
      requiresQr: body['requiresQr'] == true,
      materials: OperationMaterial.listFrom(body['materials']),
    );
  }

  /// Операции всегда идут по `orderIndex`: порядок в массиве задаёт блокировку шагов.
  static List<TechOperation> listFrom(dynamic body) {
    if (body is! List) return const <TechOperation>[];
    final List<TechOperation> operations =
        body.map(TechOperation.tryParse).whereType<TechOperation>().toList();
    operations.sort((TechOperation a, TechOperation b) => a.orderIndex.compareTo(b.orderIndex));
    return operations;
  }

  /// Обратная сторона [tryParse] — форма API для `cached_tech_cards.operationsJson`
  /// и `checklist_operations` (DS-002 `offline.md` §3). Читается тем же
  /// [listFrom], поэтому кэш и сеть дают одинаковые операции.
  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'name': name,
        'orderIndex': orderIndex,
        'estimatedTimeMin': estimatedTimeMin,
        if (description != null) 'description': description,
        if (equipment.isNotEmpty) 'equipment': equipment,
        'requiresPhoto': requiresPhoto,
        'requiresQr': requiresQr,
        if (materials.isNotEmpty)
          'materials': materials.map((OperationMaterial item) => item.toJson()).toList(),
      };
}

/// `GET /api/tech-cards/:id` — техкарта с операциями и суммарным временем.
class TechCardDetail {
  const TechCardDetail({
    required this.id,
    required this.name,
    required this.operations,
    required this.totalEstimatedTimeMin,
  });

  final String id;
  final String name;
  final List<TechOperation> operations;
  final int totalEstimatedTimeMin;

  static TechCardDetail? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    final List<TechOperation> operations = TechOperation.listFrom(body['operations']);
    return TechCardDetail(
      id: id,
      name: body['name']?.toString() ?? 'Техкарта',
      operations: operations,
      totalEstimatedTimeMin: _intOf(body['totalEstimatedTimeMin']) ??
          operations.fold<int>(0, (int sum, TechOperation op) => sum + op.estimatedTimeMin),
    );
  }
}

int? _intOf(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '');
}

String? _textOf(dynamic value) {
  final String text = value?.toString() ?? '';
  return text.isEmpty ? null : text;
}
