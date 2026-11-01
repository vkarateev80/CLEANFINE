import 'dart:convert';

import 'package:cleaning_ops_app/features/admin_web/admin_web_links.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final Uri base = Uri.parse('https://cleanfine.ru');

  AdminLinkAction action(String url) => adminLinkAction(Uri.parse(url), base);

  group('adminLinkAction', () {
    test('экраны админки остаются во встроенном браузере', () {
      expect(action('https://cleanfine.ru/'), AdminLinkAction.stay);
      expect(action('https://cleanfine.ru/login'), AdminLinkAction.stay);
      expect(action('https://cleanfine.ru/settings'), AdminLinkAction.stay);
      expect(action('about:blank'), AdminLinkAction.stay);
    });

    test('файлы, API, оператор и портал уходят наружу', () {
      expect(action('https://cleanfine.ru/minio/documents/a.pdf'), AdminLinkAction.openExternally);
      expect(action('https://cleanfine.ru/api/files/1'), AdminLinkAction.openExternally);
      expect(action('https://cleanfine.ru/app'), AdminLinkAction.openExternally);
      expect(action('https://cleanfine.ru/client/tickets'), AdminLinkAction.openExternally);
    });

    test('похожий путь админки не считается внешним разделом', () {
      expect(action('https://cleanfine.ru/clients'), AdminLinkAction.stay);
      expect(action('https://cleanfine.ru/applications'), AdminLinkAction.stay);
    });

    test('чужой сайт, схема и порт уходят наружу', () {
      expect(action('https://www.openstreetmap.org/?mlat=1'), AdminLinkAction.openExternally);
      expect(action('mailto:hello@example.com'), AdminLinkAction.openExternally);
      expect(action('tel:+70000000000'), AdminLinkAction.openExternally);
      expect(action('http://cleanfine.ru/'), AdminLinkAction.openExternally);
      expect(action('https://cleanfine.ru:8443/'), AdminLinkAction.openExternally);
      expect(action('https://cleanfine.ru.example.com/'), AdminLinkAction.openExternally);
    });
  });

  group('AdminDownload.parse', () {
    String message(String name, String dataUrl) => jsonEncode(<String, String>{'name': name, 'dataUrl': dataUrl});

    test('читает имя и содержимое', () {
      final String body = base64Encode(utf8.encode('а;б'));
      final AdminDownload? download =
          AdminDownload.parse(message('отчёт.csv', 'data:text/csv;charset=utf-8;base64,$body'));
      expect(download?.name, 'отчёт.csv');
      expect(download?.mimeType, 'text/csv');
      expect(utf8.decode(download!.bytes), 'а;б');
    });

    test('убирает разделители пути из имени', () {
      final AdminDownload? download = AdminDownload.parse(message('../../secret.csv', 'data:text/csv;base64,YQ=='));
      expect(download?.name, '.._.._secret.csv');
    });

    test('пустое имя заменяет запасным', () {
      expect(
        AdminDownload.parse(message('  ', 'data:text/csv;base64,YQ=='))?.name,
        'cleanfine-export',
      );
    });

    test('нечитаемое сообщение — null', () {
      expect(AdminDownload.parse('не json'), isNull);
      expect(AdminDownload.parse('[]'), isNull);
      expect(AdminDownload.parse('{"name":"a.csv"}'), isNull);
      expect(AdminDownload.parse(message('a.csv', 'data:text/csv,a')), isNull);
      expect(AdminDownload.parse(message('a.csv', 'https://x/;base64,YQ==')), isNull);
      expect(AdminDownload.parse(message('a.csv', 'data:text/csv;base64,@@@')), isNull);
    });
  });
}
