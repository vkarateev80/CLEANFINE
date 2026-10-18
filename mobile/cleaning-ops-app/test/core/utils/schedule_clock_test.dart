import 'package:cleaning_ops_app/core/utils/clock.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('часы расписания — московские: 21:30 UTC — это 00:30 следующего дня', () {
    final DateTime clock = scheduleClock(DateTime.utc(2026, 10, 18, 21, 30));
    expect(clock.day, 19);
    expect(clock.hour, 0);
    expect(clock.minute, 30);
  });
}
