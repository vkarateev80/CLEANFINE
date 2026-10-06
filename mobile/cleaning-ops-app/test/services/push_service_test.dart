import 'package:cleaning_ops_app/services/push_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
