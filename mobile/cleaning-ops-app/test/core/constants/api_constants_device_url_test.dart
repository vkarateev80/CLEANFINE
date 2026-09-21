import 'package:cleaning_ops_app/core/constants/api_constants.dart';
import 'package:flutter_test/flutter_test.dart';

/// М7.4: адреса файлов, приходящие от сервисов, приводятся к хосту, доступному
/// устройству.
///
/// Дефект, найденный на эмуляторе: `GET /api/floors/:id` отдаёт `planImageUrl`
/// вида `http://localhost:9000/plans/...`. В браузере на хост-машине это верно, а
/// на телефоне `localhost` — само устройство, запрос получает `Connection refused`,
/// и карта маршрута показывает «План этажа недоступен». Проверено пробой
/// (`integration_test/probe_plan_url_test.dart`): тот же путь с хостом `10.0.2.2`
/// отвечает 200.
void main() {
  group('ApiConstants.deviceUrl', () {
    test('петлевой хост заменяется на хост API', () {
      expect(
        ApiConstants.deviceUrl('http://localhost:9000/photos/a.png'),
        'http://${ApiConstants.host}:9000/photos/a.png',
      );
      expect(
        ApiConstants.deviceUrl('http://127.0.0.1:9000/photos/a.png'),
        'http://${ApiConstants.host}:9000/photos/a.png',
      );
      expect(
        ApiConstants.deviceUrl('http://0.0.0.0:9000/photos/a.png'),
        'http://${ApiConstants.host}:9000/photos/a.png',
      );
    });

    test('настоящий хост не трогается — правило не срабатывает в проде', () {
      const String production = 'https://cdn.cleanfine.ru/photos/a.png';
      expect(ApiConstants.deviceUrl(production), production);
      expect(
        ApiConstants.deviceUrl('http://minio.internal:9000/photos/a.png'),
        'http://minio.internal:9000/photos/a.png',
      );
    });

    test('порт и путь сохраняются, схема остаётся', () {
      expect(
        ApiConstants.deviceUrl('https://localhost:9443/plans/2026/09/x.svg'),
        'https://${ApiConstants.host}:9443/plans/2026/09/x.svg',
      );
    });

    test('пустое значение, null и относительный путь возвращаются как есть', () {
      expect(ApiConstants.deviceUrl(null), '');
      expect(ApiConstants.deviceUrl(''), '');
      expect(ApiConstants.deviceUrl('/plans/x.svg'), '/plans/x.svg');
      expect(ApiConstants.deviceUrl('не ссылка'), 'не ссылка');
    });
  });
}
