import 'package:cleaning_ops_app/core/domain/color_zone.dart';
import 'package:flutter_test/flutter_test.dart';

/// Правила цветовой кодировки инвентаря — зеркало `shared/types/color-coding.ts`.
/// Примеры совпадают с `frontend/web-admin/src/domain/colorCoding.test.ts`:
/// одно и то же помещение обязано получать один цвет в админке и в приложении.
void main() {
  group('ColorZone.fromRoomType', () {
    test('санитарные — красный, кухни — зелёный, стёкла — жёлтый, остальное — синий', () {
      expect(ColorZone.fromRoomType('Санузел'), ColorZone.red);
      expect(ColorZone.fromRoomType('Санитарная зона'), ColorZone.red);
      expect(ColorZone.fromRoomType('Душевая'), ColorZone.red);
      expect(ColorZone.fromRoomType('Туалет мужской'), ColorZone.red);
      expect(ColorZone.fromRoomType('Кухня'), ColorZone.green);
      expect(ColorZone.fromRoomType('Столовая'), ColorZone.green);
      expect(ColorZone.fromRoomType('Зона приёма пищи'), ColorZone.green);
      expect(ColorZone.fromRoomType('Витрина'), ColorZone.yellow);
      expect(ColorZone.fromRoomType('Остекление фасада'), ColorZone.yellow);
      expect(ColorZone.fromRoomType('Офис'), ColorZone.blue);
      expect(ColorZone.fromRoomType('Коридор'), ColorZone.blue);
      expect(ColorZone.fromRoomType('Холл'), ColorZone.blue);
      expect(ColorZone.fromRoomType('Переговорная'), ColorZone.blue);
      expect(ColorZone.fromRoomType('Керамическая плитка'), ColorZone.blue);
      expect(ColorZone.fromRoomType(''), ColorZone.blue);
      expect(ColorZone.fromRoomType(null), ColorZone.blue);
    });

    test('регистр и буква ё не влияют', () {
      expect(ColorZone.fromRoomType('САНУЗЕЛ'), ColorZone.red);
      expect(ColorZone.fromRoomType('зона приема пищи'), ColorZone.green);
      expect(ColorZone.fromZoneField('ЖЕЛТАЯ ЗОНА'), ColorZone.yellow);
    });
  });

  group('ColorZone.forRoom', () {
    test('поле «Зона» задаёт цвет явно и важнее типа', () {
      expect(ColorZone.fromZoneField('Красная зона'), ColorZone.red);
      expect(ColorZone.fromZoneField('синяя'), ColorZone.blue);
      expect(ColorZone.fromZoneField('Зелёная зона'), ColorZone.green);
      expect(ColorZone.fromZoneField('Жёлтая зона'), ColorZone.yellow);
      expect(ColorZone.fromZoneField('Зона A'), isNull);
      expect(ColorZone.fromZoneField('Публичная'), isNull);
      expect(ColorZone.fromZoneField(null), isNull);
      expect(ColorZone.fromZoneField(''), isNull);

      expect(ColorZone.forRoom(floorType: 'Офис', zone: 'Красная зона'), ColorZone.red);
      expect(ColorZone.forRoom(floorType: 'Санузел', zone: 'Зона A'), ColorZone.red);
      expect(ColorZone.forRoom(floorType: 'Кухня'), ColorZone.green);
      expect(ColorZone.forRoom(floorType: 'Кабинет'), ColorZone.blue);
    });

    test('название помещения — запасная подсказка, когда тип типовой', () {
      expect(ColorZone.forRoom(floorType: 'Офис', name: 'Кухня ГД'), ColorZone.green);
      expect(ColorZone.forRoom(floorType: 'Офис', name: 'Туалет 2 эт.'), ColorZone.red);
      expect(ColorZone.forRoom(floorType: 'Офис', name: 'Переговорка'), ColorZone.blue);
      expect(ColorZone.forRoom(floorType: 'Санузел', name: 'Кухня'), ColorZone.red);
      expect(ColorZone.forRoom(floorType: 'Офис', name: 'Кухня ГД', zone: 'Синяя зона'), ColorZone.blue);
    });
  });

  group('ColorZone.forOperation', () {
    test('стёкла и зеркала — всегда жёлтый, остальное наследует цвет помещения', () {
      expect(ColorZone.forOperation('Помыть стекло', ColorZone.red), ColorZone.yellow);
      expect(ColorZone.forOperation('Протереть зеркала', ColorZone.blue), ColorZone.yellow);
      expect(ColorZone.forOperation('Вымыть окна', ColorZone.green), ColorZone.yellow);
      expect(ColorZone.forOperation('Помыть пол', ColorZone.red), ColorZone.red);
      expect(ColorZone.forOperation('Вынести мусор', ColorZone.green), ColorZone.green);
    });
  });

  group('Инвентарь операции', () {
    test('слово цвета — прилагательное целым словом', () {
      expect(ColorZone.fromEquipment('синие швабра'), ColorZone.blue);
      expect(ColorZone.fromEquipment('Красная швабра'), ColorZone.red);
      expect(ColorZone.fromEquipment('швабра зелёная'), ColorZone.green);
      expect(ColorZone.fromEquipment('ЖЁЛТЫЕ стеклосгон'), ColorZone.yellow);
      expect(ColorZone.fromEquipment('салфетки синего цвета'), ColorZone.blue);
      expect(ColorZone.fromEquipment('синтетические салфетки'), isNull);
      expect(ColorZone.fromEquipment('краснодарская губка'), isNull);
      expect(ColorZone.fromEquipment('ведро'), isNull);
      expect(ColorZone.fromEquipment(''), isNull);
      expect(ColorZone.fromEquipment(null), isNull);
    });

    test('с подписи снимается ведущее слово цвета', () {
      expect(ColorZone.stripColorWord('синие швабра'), 'швабра');
      expect(ColorZone.stripColorWord('Синие швабра'), 'Швабра');
      expect(ColorZone.stripColorWord('жёлтые: стеклосгон'), 'стеклосгон');
      expect(ColorZone.stripColorWord('швабра синяя'), 'швабра синяя');
      expect(ColorZone.stripColorWord('синтетические салфетки'), 'синтетические салфетки');
      expect(ColorZone.stripColorWord('синие'), 'синие');
      expect(ColorZone.stripColorWord('синие   '), 'синие   ');
    });

    test('цвет, названный в оборудовании, — у всего набора', () {
      const List<String> seeded = <String>['синие швабра', 'ведро', 'салфетки', 'распылитель', 'перчатки'];
      expect(ColorZone.forInventory('Протереть рабочие поверхности', seeded, ColorZone.red), ColorZone.blue);
      expect(ColorZone.forInventory('Помыть пол', <String>['ведро', 'зелёные швабра'], ColorZone.red), ColorZone.green);
      expect(
        ColorZone.forInventory('Помыть пол', <String>['красные швабра', 'синие салфетки'], ColorZone.green),
        ColorZone.red,
      );
      expect(ColorZone.forInventory('Помыть пол', <String>['швабра', 'ведро'], ColorZone.red), ColorZone.red);
      expect(ColorZone.forInventory('Протереть зеркала', <String>['салфетки'], ColorZone.red), ColorZone.yellow);
      expect(ColorZone.forInventory('Протереть зеркала', <String>['жёлтые стеклосгон'], ColorZone.red), ColorZone.yellow);
      expect(ColorZone.forInventory('Протереть зеркала', <String>['красные салфетки'], ColorZone.blue), ColorZone.red);
      expect(ColorZone.forInventory('Помыть пол', <String>[], ColorZone.green), ColorZone.green);
    });

    test('чип: цвет операции без слова цвета, чужой цвет — как написано', () {
      expect(ColorZone.equipmentChip('синие швабра', ColorZone.blue), (label: 'швабра', zone: ColorZone.blue));
      expect(ColorZone.equipmentChip('ведро', ColorZone.blue), (label: 'ведро', zone: ColorZone.blue));
      expect(
        ColorZone.equipmentChip('красные перчатки', ColorZone.blue),
        (label: 'красные перчатки', zone: ColorZone.red),
      );
    });
  });

  test('метаданные полные', () {
    for (final ColorZone zone in ColorZone.values) {
      expect(zone.tools.length, greaterThanOrEqualTo(4));
      expect(zone.description, contains(zone.name));
      expect(zone.adjective, isNotEmpty);
    }
  });
}
