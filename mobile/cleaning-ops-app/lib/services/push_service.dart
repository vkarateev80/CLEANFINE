import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Пришедшее push-уведомление, приведённое к полям, которые нужны приложению
/// (DS-002 `profile.md` §3.4).
class PushMessage {
  const PushMessage({this.title, this.body, this.data = const <String, String>{}});

  final String? title;
  final String? body;

  /// `data`-секция: в push приходят только строки, поэтому `chatId`/`messageId`/`type`
  /// берутся отсюда.
  final Map<String, String> data;

  String? get type => data['type'];

  String? get chatId => data['chatId'];
}

/// Транспорт push. Абстракция, а не класс: Firebase из проекта исключён
/// (решение владельца, 27.09.2026), канал push — только мок на сервере
/// (`MockPushSender`), тесты подменяют этот сервис.
abstract class PushService {
  /// Токен устройства. `null` — токена нет (режим без Firebase):
  /// регистрация устройства тогда пропускается.
  Future<String?> token();

  /// Уведомление, пришедшее при открытом приложении (`onMessage`).
  Stream<PushMessage> get foreground;

  /// Уведомление, открывшее приложение (`onMessageOpenedApp`).
  Stream<PushMessage> get opened;

  /// Уведомление, из которого приложение запущено (`getInitialMessage`).
  Future<PushMessage?> initialMessage();
}

/// Заглушка без внешнего провайдера: токена нет, потоки пустые, входящих нет.
///
/// Весь остальной пуш-путь (регистрация устройства, in-app, маршрутизация
/// `pushRoute`) остаётся и работает с мок-отправчиком на сервере; здесь просто
/// нет канала доставки на устройство.
class NoopPushService implements PushService {
  final StreamController<PushMessage> _foreground = StreamController<PushMessage>.broadcast();
  final StreamController<PushMessage> _opened = StreamController<PushMessage>.broadcast();

  @override
  Future<String?> token() async => null;

  @override
  Stream<PushMessage> get foreground => _foreground.stream;

  @override
  Stream<PushMessage> get opened => _opened.stream;

  @override
  Future<PushMessage?> initialMessage() async => null;
}

/// Провайдер по умолчанию — заглушка (Firebase исключён, 27.09.2026).
final pushServiceProvider = Provider<PushService>((Ref ref) => NoopPushService());

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
/// `CHAT_MESSAGE` открывает переписку сразу (`chat.md` §1.1: payload
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
