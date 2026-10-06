import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

/// Пришедшее push-уведомление, приведённое к полям, которые нужны приложению
/// (DS-002 `profile.md` §3.4).
class PushMessage {
  const PushMessage(
      {this.title, this.body, this.data = const <String, String>{}});

  final String? title;
  final String? body;

  /// `data`-секция: в push приходят только строки, поэтому `chatId`/`messageId`/`type`
  /// берутся отсюда.
  final Map<String, String> data;

  String? get type => data['type'];

  String? get chatId => data['chatId'];
}

/// Транспорт push. Абстракция, а не класс: канал — self-hosted ntfy
/// (Firebase исключён 27.09.2026, 05.10 — заменён на свой сервер), тесты
/// подменяют этот сервис.
abstract class PushService {
  /// Токен устройства. `null` — токена нет (режим без провайдера):
  /// регистрация устройства тогда пропускается.
  Future<String?> token();

  /// Уведомление, пришедшее при открытом приложении (`onMessage`).
  Stream<PushMessage> get foreground;

  /// Уведомление, открывшее приложение (`onMessageOpenedApp`).
  Stream<PushMessage> get opened;

  /// Уведомление, из которого приложение запущено (`getInitialMessage`).
  Future<PushMessage?> initialMessage();
}

/// Заглушка без канала доставки: токена нет, потоки пустые, входящих нет.
/// Остаётся для тестов и встраивания без ntfy.
class NoopPushService implements PushService {
  final StreamController<PushMessage> _foreground =
      StreamController<PushMessage>.broadcast();
  final StreamController<PushMessage> _opened =
      StreamController<PushMessage>.broadcast();

  @override
  Future<String?> token() async => null;

  @override
  Stream<PushMessage> get foreground => _foreground.stream;

  @override
  Stream<PushMessage> get opened => _opened.stream;

  @override
  Future<PushMessage?> initialMessage() async => null;
}

// ── ntfy ───────────────────────────────────────────────────────────────────

/// Адрес ntfy: на проде и в дев-сборках — публичный путь за traefik
/// (`StripPrefix /ntfy`), переопределяется `--dart-define=NTFY_URL=…`.
const String ntfyUrl = String.fromEnvironment(
  'NTFY_URL',
  defaultValue: 'https://cleanfine.ru/ntfy',
);

const String _topicStorageKey = 'ntfy_topic';

/// Имя топика устройства: `cf-` + 122 бита UUID (на деле 96 бит hex v4 —
/// угадать невозможно; топик же хранится в secure storage и уходит на сервер
/// как «токен устройства»).
String newNtfyTopic() => 'cf-${const Uuid().v4().replaceAll('-', '')}';

/// Поля ответа ntfy, которые не относятся к data-секции приложения.
const Set<String> _ntfyReservedKeys = <String>{
  'event',
  'id',
  'time',
  'topic',
  'title',
  'message',
  'priority',
  'tags',
  'click',
  'attach',
  'attachments',
  'encoding',
  'content-type',
  'removed',
  'expires',
  'subscriptionId',
  'retry',
};

/// JSON-событие ntfy → [PushMessage]; `null` для keepalive/пингов и не-message.
///
/// Сервер шлёт конверт в теле: `{"v":1,"t":заголовок,"b":текст,"d":{data}}`
/// (JSON-режим ntfy не работает через traefik, кириллица не влезает в заголовки).
/// Старые/чужие сообщения без конверта разбираются как есть.
PushMessage? ntfyEventToMessage(Map<String, dynamic> event) {
  if (event['event'] != 'message') return null;
  final Object? raw = event['message'];
  if (raw is String && raw.startsWith('{')) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic> &&
          decoded.containsKey('v') &&
          decoded.containsKey('b')) {
        final Object? data = decoded['d'];
        return PushMessage(
          title: decoded['t'] as String?,
          body: decoded['b'] as String?,
          data: data is Map
              ? data.map((key, value) =>
                  MapEntry(key.toString(), value?.toString() ?? ''))
              : const <String, String>{},
        );
      }
    } on FormatException {
      // Не конверт — падаем в разбор ниже.
    }
  }
  final Map<String, String> data = <String, String>{};
  event.forEach((key, value) {
    if (_ntfyReservedKeys.contains(key) || value == null) return;
    data[key] = value.toString();
  });
  return PushMessage(
    title: event['title'] as String?,
    body: raw as String?,
    data: data,
  );
}

/// Реальная доставка через подписку на JSON-стрим ntfy.
///
/// Токен = имя топика: сервер публикует на `${topic}`, телефон держит
/// `GET /${topic}/json` (внешне — https://cleanfine.ru/ntfy/<topic>).
/// Пока стрим жив, уведомление показывается системным баннером
/// (flutter_local_notifications) и уходит в [foreground]; тап баннера — в [opened].
///
/// Хостовые юнит-тесты получают `null`-токен (как Noop) — ни сети, ни плагинов.
class NtfyPushService implements PushService {
  NtfyPushService({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Тот же бэкенд, что у auth-токенов (SecureStorageService):
              // только encryptedSharedPreferences живёт через рестарты на этом
              // устройстве — legacy/дефолт писал «ok», но терял данные.
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;
  final StreamController<PushMessage> _foreground =
      StreamController<PushMessage>.broadcast();
  final StreamController<PushMessage> _opened =
      StreamController<PushMessage>.broadcast();
  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();

  bool _started = false;
  bool _disposed = false;
  int _notificationId = 0;

  @override
  Future<String?> token() async {
    debugPrint('[PUSH] token() platform=${Platform.operatingSystem}');
    if (!Platform.isAndroid && !Platform.isIOS) return null;
    String? topic = await _tryReadTopic();
    if (topic == null || topic.isEmpty) {
      topic = newNtfyTopic();
      await _trySaveTopic(topic);
    }
    if (!_started) {
      _started = true;
      unawaited(_run(topic));
    }
    return topic;
  }

  /// Чтение топика с ретраями: на холодном старте первый `read` нередко
  /// возвращает `null` ещё до готовности хранилища (плагин/flutter_secure_storage),
  /// и без ретрая топик перевыпускался бы при каждом запуске — пуш уходил бы
  /// на мёртвый топик. Читаем до 5 раз с паузой 300 мс.
  Future<String?> _tryReadTopic() async {
    for (int attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await Future<void>.delayed(const Duration(milliseconds: 300));
      }
      try {
        final String? value = await _storage.read(key: _topicStorageKey);
        debugPrint('[PUSH] storage.read#$attempt = ${value ?? 'null'}');
        if (value != null && value.isNotEmpty) return value;
      } on Object catch (err) {
        debugPrint('[PUSH] storage.read ERROR: $err');
      }
    }
    return null;
  }

  Future<void> _trySaveTopic(String topic) async {
    try {
      await _storage.write(key: _topicStorageKey, value: topic);
      final String? back = await _storage.read(key: _topicStorageKey);
      debugPrint(
          '[PUSH] storage.write ok; immediate read-back = ${back ?? 'null'}');
    } on Object catch (err) {
      debugPrint('[PUSH] storage.write ERROR: $err');
    }
  }

  @override
  Stream<PushMessage> get foreground => _foreground.stream;

  @override
  Stream<PushMessage> get opened => _opened.stream;

  @override
  Future<PushMessage?> initialMessage() async {
    try {
      final NotificationAppLaunchDetails? details =
          await _notifications.getNotificationAppLaunchDetails();
      final bool launched = details?.didNotificationLaunchApp ?? false;
      final String? payload =
          launched ? details?.notificationResponse?.payload : null;
      if (payload == null || payload.isEmpty) return null;
      return _messageFromPayload(payload);
    } on Object {
      return null;
    }
  }

  PushMessage? _messageFromPayload(String payload) {
    try {
      final decoded = jsonDecode(payload);
      if (decoded is Map<String, dynamic>) {
        return PushMessage(
          title: decoded['title'] as String?,
          body: decoded['body'] as String?,
          data: decoded
              .map((key, value) => MapEntry(key, value?.toString() ?? '')),
        );
      }
    } on Object {
      // Битый payload — без перехода, приложение открылось просто так.
    }
    return null;
  }

  /// Разрешения + вечный цикл переподключения. Ошибки сети не роняют цикл.
  Future<void> _run(String topic) async {
    await _requestPermissions();
    while (!_disposed) {
      try {
        await _consume(topic);
      } on Object {
        // Обрыв/сеть — переподключение ниже.
      }
      if (_disposed) break;
      await Future<void>.delayed(const Duration(seconds: 3));
    }
  }

  Future<void> _requestPermissions() async {
    try {
      if (Platform.isAndroid) {
        await _notifications
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      } else if (Platform.isIOS) {
        await _notifications
            .resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, badge: true, sound: true);
      }
    } on Object {
      // Отказ в разрешении — приложение продолжит работать, баннеров не будет.
    }
  }

  Future<void> _consume(String topic) async {
    final HttpClient client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15);
    try {
      final HttpClientRequest request =
          await client.getUrl(Uri.parse('$ntfyUrl/$topic/json'));
      final HttpClientResponse response = await request.close();
      if (response.statusCode != HttpStatus.ok) {
        throw HttpException('ntfy ${response.statusCode}');
      }
      final Stream<String> lines =
          response.transform(utf8.decoder).transform(const LineSplitter());
      await for (final String line in lines) {
        if (_disposed) break;
        if (line.trim().isEmpty) continue;
        final decoded = jsonDecode(line);
        if (decoded is! Map<String, dynamic>) continue;
        final PushMessage? message = ntfyEventToMessage(decoded);
        if (message == null) continue;
        if (!_foreground.isClosed) _foreground.add(message);
        await _showNotification(message);
      }
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _showNotification(PushMessage message) async {
    try {
      final String payload = jsonEncode(<String, String>{
        if (message.title != null) 'title': message.title!,
        if (message.body != null) 'body': message.body!,
        ...message.data,
      });
      await _notifications.show(
        _notificationId++ & 0x7fffffff,
        message.title ?? 'CLEANFINE',
        message.body ?? '',
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'cleanfine_main',
            'Уведомления CLEANFINE',
            channelDescription: 'Смены, заявки, чат и тревоги',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        payload: payload,
      );
    } on Object {
      // Нет разрешения/плагина — сообщение уже ушло в foreground-слушатель.
    }
  }

  void dispose() {
    _disposed = true;
  }

  /// Тап по системному баннеру: открывает тот же маршрут, что и foreground.
  Future<void> bindTapHandler() async {
    // await внутри try: ошибка инициализации (нет плагина на хосте в тестах) —
    // Error, и как Future-отказ она НЕ падает в синхронный try вызывающего.
    try {
      await _notifications.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (NotificationResponse response) {
          final String? payload = response.payload;
          if (payload == null || payload.isEmpty) return;
          final PushMessage? message = _messageFromPayload(payload);
          if (message != null && !_opened.isClosed) _opened.add(message);
        },
      );
    } on Object {
      // Платформенный интерфейс недоступен (юнит-тесты на хосте) — тапы по
      // баннеру не привязываем, устройство с ntfy инициализируется нормально.
    }
  }
}

/// Провайдер по умолчанию — self-hosted ntfy (05.10.2026).
final pushServiceProvider = Provider<PushService>((Ref ref) {
  final NtfyPushService service = NtfyPushService();
  // Инициализация + тапы по баннерам: на хосте (тесты) плагин недоступен —
  // отказ глотается внутри bindTapHandler, токен там всё равно null.
  unawaited(service.bindTapHandler());
  ref.onDispose(service.dispose);
  return service;
});

/// Платформа устройства для `POST /api/notifications/device`
/// (`DEVICE_PLATFORMS`: `android` | `ios` | `web`).
String devicePlatform() {
  try {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
  } on Object {
    // Платформа неизвестна (тесты на хосте) — считаем Android-сборкой.
  }
  return 'android';
}

/// Куда ведёт push по его `data.type` (DS-002 `profile.md` §3.4).
///
/// `CHAT_MESSAGE` открывает переписку сразу (`chat.md` §1.1, payload
/// `{chatId, messageId, type}`), остальные типы — профильные экраны.
/// `null` — перехода нет (незнакомый тип).
String? pushRoute(PushMessage message) {
  switch (message.type) {
    case 'CHAT_MESSAGE':
      final String? chatId = message.chatId;
      return chatId == null || chatId.isEmpty ? null : '/chats/$chatId';
    case 'EMERGENCY':
    case 'NEW_TICKET':
    case 'TICKET_OVERDUE':
    case 'SCHEDULE_MISSED':
    case 'MATERIAL_LOW':
      return '/today';
    case 'GEOFENCE_EXIT':
      return '/profile';
    default:
      return null;
  }
}
