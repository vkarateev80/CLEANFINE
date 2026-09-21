/// Базовые адреса и лимиты API.
///
/// В dev API-gateway нет: каждый сервис слушает свой порт, поэтому адрес собирается
/// из хоста и порта. Хост по умолчанию `10.0.2.2` — так Android-эмулятор видит
/// хост-машину. Для iOS-симулятора или устройства в той же сети:
/// `flutter run --dart-define=API_HOST=192.168.1.10`.
class ApiConstants {
  const ApiConstants._();

  /// Общий префикс всех сервисов (`/api/...`).
  static const String apiPrefix = '/api';

  static const String host = String.fromEnvironment('API_HOST', defaultValue: '10.0.2.2');

  static const String authBaseUrl = String.fromEnvironment(
    'API_AUTH_URL',
    defaultValue: 'http://$host:3001',
  );
  static const String filesBaseUrl = String.fromEnvironment(
    'API_FILES_URL',
    defaultValue: 'http://$host:3002',
  );
  static const String coreBaseUrl = String.fromEnvironment(
    'API_CORE_URL',
    defaultValue: 'http://$host:3003',
  );
  static const String gpsBaseUrl = String.fromEnvironment(
    'API_GPS_URL',
    defaultValue: 'http://$host:3004',
  );
  static const String ticketsBaseUrl = String.fromEnvironment(
    'API_TICKETS_URL',
    defaultValue: 'http://$host:3005',
  );
  static const String notificationsBaseUrl = String.fromEnvironment(
    'API_NOTIFICATIONS_URL',
    defaultValue: 'http://$host:3006',
  );
  static const String scheduleBaseUrl = String.fromEnvironment(
    'API_SCHEDULE_URL',
    defaultValue: 'http://$host:3008',
  );

  /// REST chat-service; WebSocket ходит по тому же хосту и порту (namespace `/chat`).
  static const String chatBaseUrl = String.fromEnvironment(
    'API_CHAT_URL',
    defaultValue: 'http://$host:3009',
  );

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 10);

  /// Загрузка фото и планов: файл до 10 МБ, поэтому таймаут больше обычного.
  static const Duration uploadTimeout = Duration(seconds: 60);

  /// `POST /api/gps/track` принимает не больше 1000 точек за запрос.
  static const int trackBatchLimit = 1000;

  /// История чата: серверный предел `limit` — 100 сообщений.
  static const int chatMessagesLimit = 100;

  /// Сколько точек маршрута помещается в один запрос истории GPS (страница).
  static const int gpsHistoryLimit = 500;

  /// Хосты, которые на устройстве означают САМО устройство, а не стенд.
  static const Set<String> _loopbackHosts = <String>{
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
  };

  /// Привести адрес файла, пришедший от сервера, к адресу, доступному устройству.
  ///
  /// Сервер отдаёт ссылки на файлы (план этажа, фотоотчёт, аватар) в том виде, в
  /// как их видит сам сервер: на дев-стенде это `http://localhost:9000/photos/...`
  /// (проверено: `GET /api/floors/:id` → `planImageUrl` с хостом `localhost`).
  /// В браузере на хост-машине такой адрес верен, но на телефоне `localhost` — это
  /// само устройство: запрос получает `Connection refused`, `Image.network` уходит в
  /// `errorBuilder`, и карта маршрута показывает «План этажа недоступен» вместо
  /// плана. Это ровно тот экран, с которого оператор начинает смену (М6.3).
  ///
  /// Лечение: если хост ссылки — петлевой (`localhost`, `127.0.0.1`, …), он
  /// заменяется на хост API (`API_HOST`), который по построению доступен
  /// устройству. Адреса с настоящим хостом (`https://cdn…`) не меняются, поэтому
  /// в проде правило не срабатывает и поведение остаётся прежним.
  static String deviceUrl(String? url) {
    final String text = url ?? '';
    if (text.isEmpty) return text;
    final Uri? parsed = Uri.tryParse(text);
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) return text;
    if (!_loopbackHosts.contains(parsed.host)) return text;
    return parsed.replace(host: host).toString();
  }
}
