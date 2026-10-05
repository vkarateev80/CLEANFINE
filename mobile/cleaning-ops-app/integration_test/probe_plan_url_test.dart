// М7.4: проба доступности плана этажа с устройства.
//
// Причина: `GET /api/floors/:id` отдаёт `planImageUrl` с хостом стенда
// (`http://localhost:9000/...`). В браузере на хост-машине это верно, а внутри
// эмулятора `localhost` — сам эмулятор. Проба отвечает на вопрос, доходит ли файл
// плана до приложения тем адресом, который приходит в контракте.
//
// Запуск: flutter test integration_test/probe_plan_url_test.dart -d emulator-5554

import 'dart:convert';
import 'dart:io';

import 'package:cleaning_ops_app/core/constants/api_constants.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('план этажа: адрес из контракта против адреса, доступного устройству', (
    WidgetTester tester,
  ) async {
    final HttpClient client = HttpClient()..connectionTimeout = const Duration(seconds: 8);

    Future<String> tryGet(String url) async {
      try {
        final HttpClientRequest request = await client.getUrl(Uri.parse(url));
        final HttpClientResponse response = await request.close();
        final int bytes = (await response.fold<List<int>>(<int>[], (all, chunk) => all..addAll(chunk))).length;
        return 'HTTP ${response.statusCode}, $bytes Б';
      } on Object catch (error) {
        return 'ОШИБКА: ${error.runtimeType}: $error';
      }
    }

    // 1. Логин и адрес плана ровно в том виде, в каком его отдаёт core-service.
    final HttpClientRequest login = await client.postUrl(
      Uri.parse('${ApiConstants.authBaseUrl}/api/auth/login'),
    );
    login.headers.contentType = ContentType.json;
    login.write(jsonEncode(<String, String>{
      'email': 'operator',
      'password': 'oper123',
    }));
    final HttpClientResponse loginResponse = await login.close();
    final Map<String, dynamic> tokens =
        jsonDecode(await loginResponse.transform(utf8.decoder).join()) as Map<String, dynamic>;
    final String token = tokens['accessToken'] as String;

    final HttpClientRequest floors = await client.getUrl(
      Uri.parse('${ApiConstants.coreBaseUrl}/api/objects/f9bd905f-924a-4df8-a517-5fb4a760bf01/floors'),
    );
    floors.headers.set('Authorization', 'Bearer $token');
    final HttpClientResponse floorsResponse = await floors.close();
    final List<dynamic> list =
        jsonDecode(await floorsResponse.transform(utf8.decoder).join()) as List<dynamic>;
    final String planUrl = (list.first as Map<String, dynamic>)['planImageUrl'] as String;

    final String asContract = await tryGet(planUrl);
    final String viaHostAlias = await tryGet(planUrl.replaceFirst('localhost', '10.0.2.2'));

    client.close(force: true);

    // ignore: avoid_print
    print('PROBE план: контракт $planUrl → $asContract');
    // ignore: avoid_print
    print('PROBE план: адрес эмулятора → $viaHostAlias');
    expect(planUrl, contains('plan'));
  });
}
