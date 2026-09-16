import 'package:cleaning_ops_app/core/utils/validators.dart';
import 'package:flutter_test/flutter_test.dart';

/// Правила совпадают с DTO сервисов (см. `validators.dart`), а тексты — с теми,
/// что требует УСТАВ и проверяют widget-тесты М6.2/М6.5.
void main() {
  group('Validators.email', () {
    test('корректный email проходит', () {
      expect(Validators.email('operator@cleaning-ops.com'), isNull);
    });

    test('пустое значение и мусор дают текст из УСТАВА', () {
      expect(Validators.email(''), 'Введите корректный email');
      expect(Validators.email(null), 'Введите корректный email');
      expect(Validators.email('operator@'), 'Введите корректный email');
      expect(Validators.email('оператор@почта.рф'), 'Введите корректный email');
    });
  });

  group('Validators.pin', () {
    test('4–6 цифр проходят, остальное — нет', () {
      expect(Validators.pin('3456'), isNull);
      expect(Validators.pin('345678'), isNull);
      expect(Validators.pin('345'), 'PIN должен содержать 4–6 цифр');
      expect(Validators.pin('3456789'), 'PIN должен содержать 4–6 цифр');
      expect(Validators.pin('34a6'), 'PIN должен содержать 4–6 цифр');
      expect(Validators.pin(''), 'Введите PIN');
    });
  });

  group('Validators.password', () {
    test('не короче 6 символов', () {
      expect(Validators.password('admin123'), isNull);
      expect(Validators.password('12345'), 'Пароль должен быть не короче 6 символов');
      expect(Validators.password(''), 'Введите пароль');
    });
  });

  group('Validators.phone', () {
    test('необязательное поле, но формат проверяется', () {
      expect(Validators.phone(''), isNull);
      expect(Validators.phone('+7 999 000-00-03'), isNull);
      expect(Validators.phone('abc'), 'Некорректный телефон');
    });
  });

  group('Validators.emergencyDescription', () {
    test('описание аварии обязательно и содержательно', () {
      expect(Validators.emergencyDescription('Прорыв трубы в 305'), isNull);
      expect(Validators.emergencyDescription(''), 'Опишите аварию');
      expect(Validators.emergencyDescription('течь'), 'Опишите аварию подробнее');
    });
  });
}
