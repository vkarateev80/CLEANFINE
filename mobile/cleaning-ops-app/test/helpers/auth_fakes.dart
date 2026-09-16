import 'dart:convert';
import 'dart:typed_data';

import 'package:cleaning_ops_app/features/auth/data/datasources/pin_credentials_store.dart';
import 'package:cleaning_ops_app/features/auth/data/models/pin_credentials.dart';
import 'package:cleaning_ops_app/features/auth/data/repositories/auth_session_writer.dart';
import 'package:cleaning_ops_app/services/api_client.dart';
import 'package:cleaning_ops_app/services/secure_storage_service.dart';
import 'package:dio/dio.dart';

/// Общие подмены для тестов авторизации: ни один тест не поднимает
/// платформенный Keychain, `local_auth` и не ходит в сеть.

/// `SecureStorageService` в памяти.
class InMemorySecureStorage extends SecureStorageService {
  final Map<String, String> values = {};

  @override
  Future<String?> readAccessToken() async => values[StorageKeys.accessToken];

  @override
  Future<String?> readRefreshToken() async => values[StorageKeys.refreshToken];

  @override
  Future<String?> readUserId() async => values[StorageKeys.userId];

  @override
  Future<String?> readRole() async => values[StorageKeys.role];

  @override
  Future<String?> readBiometricKey() async => values[StorageKeys.biometricKey];

  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    values[StorageKeys.accessToken] = accessToken;
    values[StorageKeys.refreshToken] = refreshToken;
  }

  @override
  Future<void> clearTokens() async {
    values.remove(StorageKeys.accessToken);
    values.remove(StorageKeys.refreshToken);
  }

  @override
  Future<void> saveUserId(String value) async => values[StorageKeys.userId] = value;

  @override
  Future<void> saveRole(String value) async => values[StorageKeys.role] = value;

  @override
  Future<void> saveBiometricKey(String value) async => values[StorageKeys.biometricKey] = value;

  @override
  Future<void> deleteBiometricKey() async => values.remove(StorageKeys.biometricKey);

  @override
  Future<void> clearSession() async {
    await clearTokens();
    values.remove(StorageKeys.userId);
    values.remove(StorageKeys.role);
  }
}

/// Запись PIN-данных устройства в памяти.
class InMemoryPinStore implements PinCredentialsStore {
  PinCredentials credentials = const PinCredentials();

  @override
  Future<PinCredentials> read() async => credentials;

  @override
  Future<void> saveEmail(String email) async =>
      credentials = PinCredentials(email: email, phone: credentials.phone, length: credentials.length);

  @override
  Future<void> savePhone(String phone) async =>
      credentials = PinCredentials(email: credentials.email, phone: phone, length: credentials.length);

  @override
  Future<void> saveLength(int length) async =>
      credentials = PinCredentials(email: credentials.email, phone: credentials.phone, length: length);

  @override
  Future<void> clear() async => credentials = const PinCredentials();
}

/// Сессия-«заглушка»: запоминает, что именно сохранил репозиторий.
class RecordingSessionWriter implements AuthSessionWriter {
  final List<Map<String, Object?>> signInCalls = [];
  int signOutCalls = 0;
  Map<String, String>? lastTokens;

  @override
  Future<void> signIn({
    required String accessToken,
    required String refreshToken,
    String? userId,
    String? role,
    String? fullName,
  }) async {
    signInCalls.add({
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'userId': userId,
      'role': role,
      'fullName': fullName,
    });
  }

  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    lastTokens = {'accessToken': accessToken, 'refreshToken': refreshToken};
  }

  @override
  Future<void> signOut() async => signOutCalls += 1;
}

/// Ответ сервера в тесте: тело и код.
class FakeResponse {
  const FakeResponse(this.statusCode, this.body);

  final int statusCode;
  final Object body;
}

/// `ApiClient` без сети: запросы обслуживает переданный обработчик.
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.handler);

  final Future<FakeResponse> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final FakeResponse response = await handler(options);
    return ResponseBody.fromString(
      jsonEncode(response.body),
      response.statusCode,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// `ApiClient` поверх [FakeHttpAdapter] — им пользуются и виджет-тесты.
ApiClient fakeApiClient(FakeHttpAdapter adapter, {String baseUrl = 'http://auth.test'}) {
  return ApiClient(
    baseUrl: baseUrl,
    tokenStore: InMemorySecureStorage(),
    sessionBridge: SessionBridge(),
    dio: Dio(BaseOptions(baseUrl: baseUrl))..httpClientAdapter = adapter,
  );
}