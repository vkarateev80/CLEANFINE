import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Пришедшее push-уведомление, приведённое к полям, которые нужны приложению
/// (DS-002 `profile.md` §3.4).
class PushMessage {
  const PushMessage({this.title, this.body, this.data = const <String, String>{}});

  final String? title;
  final String? body;

  /// `data`-секция: FCM передаёт только строки, поэтому `chatId`/`messageId`/`type`
  /// берутся отсюда.
  final Map<String, String> data;

  String? get type => data['type'];

  String? get chatId => data['chatId'];

  static PushMessage? fromRemote(RemoteMessage? message) {
    if (message == null) return null;
    final Map<String, String> data = <String, String>{};
    message.data.forEach((String key, dynamic value) {
      if (value != null) data[key] = value.toString();
    });
    return PushMessage(
      title: message.notification?.title,
      body: message.notification?.body,
      data: data,
    );
  }
}

/// Транспорт push. Абстракция, а не класс: в разработке стенд поднимает
/// `MockPushSender` (пустые `FIREBASE_*`), а тесты подменяют этот сервис, не
/// поднимая платформенный канал Firebase.
abstract class PushService {
  /// Токен устройства. `null` — Firebase не поднялась (dev без кредов) или
  /// плагин недоступен: регистрация устройства тогда пропускается.
  Future<String?> token();

  /// Уведомление, пришедшее при открытом приложении (`onMessage`).
  Stream<PushMessage> get foreground;

  /// Уведомление, открывшее приложение (`onMessageOpenedApp`).
  Stream<PushMessage> get opened;

  /// Уведомление, из которого приложение запущено (`getInitialMessage`).
  Future<PushMessage?> initialMessage();
}

/// Реализация поверх `firebase_messaging` (объявлен в `pubspec.yaml`).
///
/// ⚠️ Осознанное решение по М6.8: **ключи Firebase не заводятся**. В dev
/// notification-service работает на `MockPushSender`, поэтому весь путь push
/// проверяется без кредов; приложение при этом обязано не падать, если Firebase
/// не сконфигурирована (`Firebase.initializeApp` без `google-services.json`
/// бросает исключение) — поэтому каждый вызов здесь best-effort: ошибка
/// проглатывается, токен не регистрируется, экраны работают как обычно.
class FirebasePushService implements PushService {
  FirebasePushService({FirebaseMessaging? messaging}) : _messaging = messaging;

  final FirebaseMessaging? _messaging;

  final StreamController<PushMessage> _foreground = StreamController<PushMessage>.broadcast();
  final StreamController<PushMessage> _opened = StreamController<PushMessage>.broadcast();

  bool _bound = false;

  FirebaseMessaging? _instance() {
    try {
      return _messaging ?? FirebaseMessaging.instance;
    } on Object {
      return null;
    }
  }

  /// Подписка на потоки — один раз и без падения, если плагина нет.
  void _bind() {
    if (_bound) return;
    _bound = true;
    try {
      // `onMessage`/`onMessageOpenedApp` — статические геттеры firebase_messaging,
      // к экземпляру они не относятся (`FirebaseMessaging.onMessage`).
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        final PushMessage? push = PushMessage.fromRemote(message);
        if (push != null) _foreground.add(push);
      });
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        final PushMessage? push = PushMessage.fromRemote(message);
        if (push != null) _opened.add(push);
      });
    } on Object {
      // Платформенный канал недоступен — push просто не приходит.
    }
  }

  @override
  Future<String?> token() async {
    final FirebaseMessaging? messaging = _instance();
    if (messaging == null) return null;
    try {
      _bind();
      await messaging.requestPermission();
      return await messaging.getToken();
    } on Object {
      return null;
    }
  }

  @override
  Stream<PushMessage> get foreground {
    if (_instance() != null) _bind();
    return _foreground.stream;
  }

  @override
  Stream<PushMessage> get opened {
    if (_instance() != null) _bind();
    return _opened.stream;
  }

  @override
  Future<PushMessage?> initialMessage() async {
    final FirebaseMessaging? messaging = _instance();
    if (messaging == null) return null;
    try {
      return PushMessage.fromRemote(await messaging.getInitialMessage());
    } on Object {
      return null;
    }
  }
}

final pushServiceProvider = Provider<PushService>((Ref ref) => FirebasePushService());

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
