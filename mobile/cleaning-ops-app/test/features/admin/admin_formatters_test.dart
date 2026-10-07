import 'package:cleaning_ops_app/features/admin/admin_formatters.dart';
import 'package:flutter_test/flutter_test.dart';

/// Форматы доски действий — калька `reportsHelpers.ts`; цифры на маке и в
/// браузере должны читаться одинаково.
void main() {
  group('formatMoney', () {
    test('два знака и группировка ru-RU', () {
      expect(formatMoney(0), '0,00');
      expect(formatMoney(1234.5), '1${String.fromCharCode(0x00A0)}234,50');
      expect(formatMoney(12345.678), '12${String.fromCharCode(0x00A0)}345,68');
    });
  });

  group('formatPercent', () {
    test('один знак и «%»', () {
      expect(formatPercent(92.5), '92,5 %');
      expect(formatPercent(100), '100 %');
      expect(formatPercent(0), '0 %');
    });

    test('null — «нет данных», а не 0 %', () {
      expect(formatPercent(null), '—');
    });
  });

  group('formatMinutes', () {
    test('меньше часа — только минуты', () {
      expect(formatMinutes(45), '45 мин');
      expect(formatMinutes(0), '0 мин');
    });

    test('часы и минуты: «2 ч 30 мин», целые часы без хвоста', () {
      expect(formatMinutes(150), '2 ч 30 мин');
      expect(formatMinutes(120), '2 ч');
      expect(formatMinutes(59.4), '59 мин');
    });

    test('null — прочерк', () {
      expect(formatMinutes(null), '—');
    });
  });

  group('formatNumber', () {
    test('группировка и до 3 знаков', () {
      expect(formatNumber(38), '38');
      expect(formatNumber(1234.5), '1${String.fromCharCode(0x00A0)}234,5');
    });
  });
}
