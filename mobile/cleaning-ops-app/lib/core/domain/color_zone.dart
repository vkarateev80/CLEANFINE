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
    color: Color(0xFFFF4FA3),
    dark: Color(0xFFA3004F),
    soft: Color(0xFFFFE8F3),
    tools: <String>['Швабра', 'Ведро', 'Салфетки', 'Ершик'],
  ),
  blue(
    name: 'Синий',
    adjective: 'Синяя',
    zoneName: 'Зоны общего пользования',
    where: 'офисы, коридоры, холлы',
    color: Color(0xFF00E5D4),
    dark: Color(0xFF00665E),
    soft: Color(0xFFE0FBF8),
    tools: <String>['Швабра', 'Ведро', 'Салфетки', 'Распылитель'],
  ),
  green(
    name: 'Зелёный',
    adjective: 'Зелёная',
    zoneName: 'Кухни и столовые',
    where: 'зоны приёма пищи',
    color: Color(0xFFA6FF4D),
    dark: Color(0xFF3A6B00),
    soft: Color(0xFFF3FFE6),
    tools: <String>['Швабра', 'Ведро', 'Салфетки', 'Губка'],
  ),
  yellow(
    name: 'Жёлтый',
    adjective: 'Жёлтая',
    zoneName: 'Специализированные зоны',
    where: 'стёкла, зеркала, особые требования',
    color: Color(0xFFFFF000),
    dark: Color(0xFF6E6400),
    soft: Color(0xFFFFFDE0),
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

  /// Слово цвета в оборудовании — прилагательное целым словом («синие»,
  /// «Красная»), а не вхождением, как в поле «Зона»: цвет одной позиции красит
  /// весь набор операции, и «синтетические салфетки» не должны его перекрасить.
  static final RegExp _equipmentColorWord = RegExp(
    r'^(красн|син|зелен|желт)(ый|ий|ая|яя|ое|ее|ые|ие|ого|его|ом|ем|ой|ей|ую|юю|ым|им|ых|их|ыми|ими)$',
  );

  static const Map<String, ColorZone> _equipmentColorStems = <String, ColorZone>{
    'красн': ColorZone.red,
    'син': ColorZone.blue,
    'зелен': ColorZone.green,
    'желт': ColorZone.yellow,
  };

  static String _normalize(String? value) => (value ?? '').toLowerCase().replaceAll('ё', 'е').trim();

  static ColorZone? _colorWord(String word) {
    final RegExpMatch? match = _equipmentColorWord.firstMatch(_normalize(word));
    return match == null ? null : _equipmentColorStems[match.group(1)];
  }

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

  /// Цвет, названный в подписи инвентаря («синие швабра» → синий); `null` — не назван.
  static ColorZone? fromEquipment(String? label) {
    for (final String word in _normalize(label).split(RegExp('[^a-zа-я]+'))) {
      final ColorZone? zone = _colorWord(word);
      if (zone != null) return zone;
    }
    return null;
  }

  /// Подпись без ведущего слова цвета: «синие швабра» → «швабра», «Синие
  /// швабра» → «Швабра». Подпись из одного слова цвета не трогаем.
  static String stripColorWord(String label) {
    final RegExpMatch? match = RegExp(r'^\s*([a-zA-Zа-яА-ЯёЁ]+)[\s:,.;—–-]+(.+)$').firstMatch(label);
    if (match == null || _colorWord(match.group(1)!) == null) return label;
    final String word = match.group(1)!;
    final String rest = match.group(2)!.trim();
    if (rest.isEmpty) return label;
    return word[0] == word[0].toUpperCase() ? rest[0].toUpperCase() + rest.substring(1) : rest;
  }

  /// Цвет инвентаря операции — один на весь набор («синие швабра, ведро,
  /// салфетки; перчатки» — синие все, включая СИЗ). Порядок: цвет, названный в
  /// оборудовании (первый по порядку) → стёкла и зеркала — жёлтый → цвет помещения.
  static ColorZone forInventory(String operationName, List<String> equipment, ColorZone roomZone) {
    for (final String label in equipment) {
      final ColorZone? named = fromEquipment(label);
      if (named != null) return named;
    }
    return forOperation(operationName, roomZone);
  }

  /// Чип инвентаря в цвете операции, слово цвета снято — его говорит цвет чипа.
  /// Позиция, названная другим цветом, остаётся своего цвета и как написана.
  static ({String label, ColorZone zone}) equipmentChip(String label, ColorZone inventoryZone) {
    final ColorZone? own = fromEquipment(label);
    if (own != null && own != inventoryZone) return (label: label, zone: own);
    return (label: stripColorWord(label), zone: inventoryZone);
  }
}
