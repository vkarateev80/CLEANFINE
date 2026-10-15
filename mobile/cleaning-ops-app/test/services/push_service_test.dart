import 'dart:convert';

import 'package:cleaning_ops_app/services/push_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('NtfyPushService на Android: нативный фоновый сервис', () {
    late List<MethodCall> calls;
    late bool ignoringBattery;
    late String? launchPayload;
    late MockStreamHandlerEventSink? sink;
    final TestDefaultBinaryMessenger messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    setUp(() {
      calls = <MethodCall>[];
      ignoringBattery = false;
      launchPayload = null;
      sink = null;
      FlutterSecureStorage.setMockInitialValues(<String, String>{});
      messenger.setMockMethodCallHandler(pushNativeChannel, (MethodCall call) async {
        calls.add(call);
        switch (call.method) {
          case 'isIgnoringBatteryOptimizations':
            return ignoringBattery;
          case 'takeLaunchPayload':
            return launchPayload;
          default:
            return true;
        }
      });
      messenger.setMockStreamHandler(
        pushNativeEvents,
        MockStreamHandler.inline(
          onListen: (Object? _, MockStreamHandlerEventSink events) => sink = events,
        ),
      );
    });

    tearDown(() {
      messenger.setMockMethodCallHandler(pushNativeChannel, null);
      messenger.setMockStreamHandler(pushNativeEvents, null);
    });

    Future<void> flush() => Future<void>.delayed(const Duration(milliseconds: 20));

    test('token() запускает сервис с топиком и адресом ntfy, батарею спрашивает один раз', () async {
      final NtfyPushService push = NtfyPushService(nativeService: true, mobile: true);
      final String? topic = await push.token();
      await flush();
      expect(topic, matches(RegExp(r'^cf-[0-9a-f]{32}$')));
      final MethodCall start = calls.firstWhere((MethodCall c) => c.method == 'start');
      expect(start.arguments, <String, String>{'topic': topic!, 'url': ntfyUrl});
      expect(calls.where((MethodCall c) => c.method == 'requestIgnoreBatteryOptimizations'), hasLength(1));

      // Второй запуск приложения: тот же топик, диалог батареи больше не показывается.
      calls.clear();
      final NtfyPushService again = NtfyPushService(nativeService: true, mobile: true);
      expect(await again.token(), topic);
      await flush();
      expect(calls.where((MethodCall c) => c.method == 'start'), hasLength(1));
      expect(calls.where((MethodCall c) => c.method == 'requestIgnoreBatteryOptimizations'), isEmpty);
    });

    test('push и тап от сервиса попадают в foreground и opened', () async {
      final NtfyPushService push = NtfyPushService(nativeService: true, mobile: true);
      await push.bindTapHandler();
      await flush();
      final Future<PushMessage> foreground = push.foreground.first;
      final Future<PushMessage> opened = push.opened.first;
      final String payload = jsonEncode(<String, String>{
        'title': 'Новое сообщение',
        'body': 'Привет',
        'type': 'CHAT_MESSAGE',
        'chatId': 'c1',
      });
      sink!.success(<String, String>{'kind': 'message', 'payload': payload});
      sink!.success(<String, String>{'kind': 'opened', 'payload': payload});
      final PushMessage got = await foreground;
      expect(got.title, 'Новое сообщение');
      expect(got.body, 'Привет');
      expect(pushRoute(await opened), '/chats/c1');
    });

    test('уведомление, которым запустили приложение, — initialMessage', () async {
      launchPayload = jsonEncode(<String, String>{'type': 'NEW_TICKET', 'body': 'Заявка'});
      final NtfyPushService push = NtfyPushService(nativeService: true, mobile: true);
      final PushMessage? message = await push.initialMessage();
      expect(message?.type, 'NEW_TICKET');
      expect(pushRoute(message!), '/today');
    });

    test('stop() гасит сервис', () async {
      final NtfyPushService push = NtfyPushService(nativeService: true, mobile: true);
      await push.stop();
      expect(calls.map((MethodCall c) => c.method), contains('stop'));
    });
  });

  group('newNtfyTopic', () {
    test('префикс cf- и 32 hex-символа (96 бит энтропии UUIDv4)', () {
      final String topic = newNtfyTopic();
      expect(topic, matches(RegExp(r'^cf-[0-9a-f]{32}$')));
      expect(newNtfyTopic(), isNot(topic));
    });
  });

  group('ntfyEventToMessage', () {
    test('message-событие → заголовок, тело и data-секция без служебных полей',
        () {
      final PushMessage? message = ntfyEventToMessage(<String, dynamic>{
        'event': 'message',
        'id': 'AbC123',
        'time': 1791231875,
        'topic': 'cf-deadbeef',
        'title': 'Новая заявка',
        'message': 'Кабинет 215',
        'priority': 5,
        'type': 'NEW_TICKET',
        'chatId': 'chat-1',
        'messageId': 'm-1',
      });
      expect(message, isNotNull);
      expect(message!.title, 'Новая заявка');
      expect(message.body, 'Кабинет 215');
      expect(message.type, 'NEW_TICKET');
      expect(message.chatId, 'chat-1');
      expect(message.data['messageId'], 'm-1');
      expect(message.data.containsKey('topic'), isFalse);
      expect(message.data.containsKey('priority'), isFalse);
    });

    test('keepalive и пинги дают null', () {
      expect(
          ntfyEventToMessage(<String, dynamic>{'event': 'keepalive'}), isNull);
      expect(ntfyEventToMessage(<String, dynamic>{'event': 'open'}), isNull);
    });
  });

  group('pushRoute', () {
    test('CHAT_MESSAGE ведёт в переписку, неизвестный тип — без перехода', () {
      expect(
        pushRoute(const PushMessage(
            data: <String, String>{'type': 'CHAT_MESSAGE', 'chatId': 'c5'})),
        '/chats/c5',
      );
      expect(
          pushRoute(
              const PushMessage(data: <String, String>{'type': 'WHATEVER'})),
          isNull);
    });
  });
}
