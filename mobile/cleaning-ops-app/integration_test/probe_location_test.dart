// М7.4: проба получения точки геолокации на устройстве.
//
// Отвечает на вопрос, доходит ли до приложения реальная координата (и с какой
// скоростью), потому что именно от этого зависят и интервалы трекинга, и отметка
// прихода по геозоне. Проба печатает результат или ТИП исключения — без этого
// «трекер молчит» неотличимо от «нет разрешения» и от «провайдер не отвечает».
//
// Запуск: flutter test integration_test/probe_location_test.dart -d emulator-5554

import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('геолокация: доступ, точка, скорость', (WidgetTester tester) async {
    const GeolocatorLocationService service = GeolocatorLocationService();

    String access;
    try {
      access = (await service.accessStatus()).name;
    } on Object catch (error) {
      access = 'ОШИБКА доступа: ${error.runtimeType}: $error';
    }

    final Stopwatch watch = Stopwatch()..start();
    String sample;
    try {
      final LocationSample value = await service.currentSample();
      sample = 'lat=${value.point.lat}, lng=${value.point.lng}, '
          'accuracy=${value.accuracy}, speed=${value.speed}, '
          'время=${watch.elapsedMilliseconds} мс';
    } on Object catch (error) {
      sample = '${error.runtimeType} через ${watch.elapsedMilliseconds} мс: $error';
    }

    // ignore: avoid_print
    print('PROBE_LOCATION доступ=$access; точка → $sample');
    expect(access, isNotEmpty);
  });
}
