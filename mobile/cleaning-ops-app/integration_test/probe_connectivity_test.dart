// М7.4: разведочная проба связи эмулятор → стенд.
//
// Проверяет три вещи, от которых зависит вся инструментальная часть UAT:
//  1) доступен ли стенд с эмулятора по адресу `10.0.2.2` (хост-машина);
//  2) не режет ли Android cleartext-HTTP (targetSdk 36 запрещает его по умолчанию);
//  3) отдаёт ли стенд данные по реальному контракту приложения.
//
// Запуск: flutter test integration_test/probe_connectivity_test.dart -d emulator-5554

import 'dart:convert';
import 'dart:io';

import 'package:cleaning_ops_app/core/constants/api_constants.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('стенд доступен с эмулятора', (WidgetTester tester) async {
    final HttpClient client = HttpClient();
    final List<String> log = <String>[];

    Future<void> probe(String label, Uri uri) async {
      try {
        final HttpClientRequest request = await client
            .postUrl(uri)
            .timeout(const Duration(seconds: 10));
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(<String, String>{
          'email': 'operator',
          'password': 'oper123',
        }));
        final HttpClientResponse response = await request.close();
        final String body = await response.transform(utf8.decoder).join();
        log.add('$label ${uri.host}:${uri.port} → HTTP ${response.statusCode} '
            '(${body.length} B)');
        if (response.statusCode == 201 || response.statusCode == 200) {
          final Map<String, dynamic> json =
              jsonDecode(body) as Map<String, dynamic>;
          log.add('  accessToken: ${(json['accessToken'] as String).length} симв.');
        }
      } on Object catch (error) {
        log.add('$label ${uri.host}:${uri.port} → ОШИБКА: $error');
      }
    }

    // 1. Прямой вызов сервиса на хосте через псевдоним эмулятора.
    await probe('auth', Uri.parse('${ApiConstants.authBaseUrl}/api/auth/login'));

    // 2. Точка входа nginx (единый вход стенда) — контроль, что дело не в хосте.
    await probe('nginx', Uri.parse('http://10.0.2.2:8080/api/auth/login'));

    client.close(force: true);

    for (final String line in log) {
      // ignore: avoid_print
      print('PROBE $line');
    }
    expect(log.length, 2);
  });
}
