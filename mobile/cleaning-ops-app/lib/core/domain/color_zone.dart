import 'package:flutter/material.dart';

/// Цветовая кодировка инвентаря («четыре цвета» клининга).
///
/// Зеркало `shared/types/color-coding.ts`: тот же порядок проверки и те же
/// ключевые слова — помещение обязано получать один и тот же цвет в админке
/// и в приложении. Цвет не хранится в БД: он выводится из типа помещения
/// (`Room.floorType`), поле `Room.zone` может задать его явно («Красная зона»).
enum ColorZone {
  red(
    name: 'Красный',
    adjective: 'Красная',
    zoneName: 'Санитарные зоны',
    where: 'туалеты, унитазы, писсуары',
    color: Color(0xFFE30613),
    dark: Color(0xFFA5000B),
    soft: Color(0xFFFDECEE),
    tools: <String>['Швабра', 'Ведро', 'Салфетки', 'Ершик'],
  ),
  blue(
    name: 'Синий',
    adjective: 'Синяя',
    zoneName: 'Зоны общего пользования',
    where: 'офисы, коридоры, холлы',
    color: Color(0xFF0A5BD3),
    dark: Color(0xFF063C8E),
    soft: Color(0xFFE8F0FC),
    tools: <String>['Швабра', 'Ведро', 'Салфетки', 'Распылитель'],
  ),
  green(
    name: 'Зелёный',
    adjective: 'Зелёная',
    zoneName: 'Кухни и столовые',
    where: 'зоны приёма пищи',
    color: Color(0xFF12933A),
    dark: Color(0xFF0A6026),
    soft: Color(0xFFE8F5EC),
    tools: <String>['Швабра', 'Ведро', 'Салфетки', 'Губка'],
  ),
  yellow(
    name: 'Жёлтый',
    adjective: 'Жёлтая',
    zoneName: 'Специализированные зоны',
    where: 'стёкла, зеркала, особые требования',
    color: Color(0xFFFFC400),
    dark: Color(0xFFD19A00),
    soft: Color(0xFFFFF7DB),
    tools: <String>['Стеклосгон', 'Ведро', 'Салфетки', 'Распылитель'],
  );

  const ColorZone({
    required this.name,
    required this.adjective,
    required this.zoneName,
    required this.where,
    required this.color,
    required this.dark,
    required this.soft,
    required this.tools,
  });

  /// «Красный».
  final String name;

  /// «Красная» — для «… зона».
  final String adjective;

  /// «Санитарные зоны».
  final String zoneName;

  /// «туалеты, унитазы, писсуары».
  final String where;

  /// Основной цвет таблички.
  final Color color;

  /// Тёмный оттенок: обводка и текст на светлом.
  final Color dark;

  /// Мягкая заливка чипов.
  final Color soft;

  /// Инвентарь зоны — подписи как на табличке.
  final List<String> tools;

  /// «Красный инвентарь — санитарные зоны (туалеты, унитазы, писсуары)».
  String get description => '$name инвентарь — ${zoneName.toLowerCase()} ($where)';

  static const List<MapEntry<ColorZone, List<String>>> _roomTypeKeywords =
      <MapEntry<ColorZone, List<String>>>[
    MapEntry<ColorZone, List<String>>(ColorZone.red, <String>[
      'санузел',
      'санитар',
      'туалет',
      'уборн',
      'душ',
      'писсуар',
      'унитаз',
      'ванн',
      'wc',
    ]),
    MapEntry<ColorZone, List<String>>(ColorZone.green, <String>[
      'кухн',
      'столов',
      'буфет',
      'пищ',
      'обеден',
      'кафе',
      'ресторан',
      'кофе-пойнт',
      'кофепойнт',
    ]),
    MapEntry<ColorZone, List<String>>(ColorZone.yellow, <String>[
      'витрин',
      'стекл',
      'зеркал',
      'остекл',
      'оконн',
      'окна',
    ]),
  ];

  static const List<String> _glassOperationKeywords = <String>['стекл', 'зеркал', 'окн', 'витрин'];

  static const List<MapEntry<ColorZone, List<String>>> _zoneFieldKeywords =
      <MapEntry<ColorZone, List<String>>>[
    MapEntry<ColorZone, List<String>>(ColorZone.red, <String>['красн']),
    MapEntry<ColorZone, List<String>>(ColorZone.green, <String>['зелен']),
    MapEntry<ColorZone, List<String>>(ColorZone.yellow, <String>['желт']),
    MapEntry<ColorZone, List<String>>(ColorZone.blue, <String>['син']),
  ];

  static String _normalize(String? value) => (value ?? '').toLowerCase().replaceAll('ё', 'е').trim();

  static ColorZone? _match(String value, List<MapEntry<ColorZone, List<String>>> table) {
    for (final MapEntry<ColorZone, List<String>> entry in table) {
      if (entry.value.any(value.contains)) return entry.key;
    }
    return null;
  }

  /// Явный цвет из поля «Зона»; `null`, если зона о цвете не говорит («Зона A»).
  static ColorZone? fromZoneField(String? zone) {
    final String normalized = _normalize(zone);
    if (normalized.isEmpty) return null;
    return _match(normalized, _zoneFieldKeywords);
  }

  /// Цвет по типу помещения; всё, что не санитарное, не кухня и не стекло — синий.
  static ColorZone fromRoomType(String? floorType) =>
      _match(_normalize(floorType), _roomTypeKeywords) ?? ColorZone.blue;

  /// Цвет помещения: явная зона важнее типа; если тип ничего не говорит
  /// (типовой «Офис» после импорта плана), подсказкой служит название
  /// («Кухня ГД» → зелёный). Иначе — синий.
  static ColorZone forRoom({required String? floorType, String? zone, String? name}) {
    final ColorZone? explicit = fromZoneField(zone);
    if (explicit != null) return explicit;
    final ColorZone? byType = _match(_normalize(floorType), _roomTypeKeywords);
    if (byType != null) return byType;
    return _match(_normalize(name), _roomTypeKeywords) ?? ColorZone.blue;
  }

  /// Инвентарь операции: стёкла и зеркала — всегда жёлтый, остальное — цвет помещения.
  static ColorZone forOperation(String operationName, ColorZone roomZone) {
    final String normalized = _normalize(operationName);
    return _glassOperationKeywords.any(normalized.contains) ? ColorZone.yellow : roomZone;
  }
}
