import 'package:dio/dio.dart';

import '../core/constants/api_constants.dart';
import '../core/errors/exceptions.dart';
import '../core/i18n/app_language.dart';

/// Хранилище токенов, которым пользуется `ApiClient`.
///
/// Интерфейс, а не класс: тесты подменяют его in-memory реализацией, не поднимая
/// платформенный secure storage.
abstract class TokenStore {
  Future<String?> readAccessToken();

  Future<String?> readRefreshToken();

  Future<void> saveTokens({required String accessToken, required String refreshToken});

  Future<void> clearTokens();
}

/// Мост между HTTP-клиентом и фичей авторизации.
///
/// `ApiClient` не знает про Riverpod: при 401 он вызывает `onRefresh` (обновление
/// пары токенов делает auth-репозиторий) и, если это не помогло, `onLogout`.
/// Обработчики регистрирует `AuthController` при старте приложения.
///
/// [epoch] — номер сессии: растёт при каждом входе и выходе ([startNewSession]).
/// Запрос помнит эпоху, в которой ушёл; 401 на запрос прошлой сессии не имеет
/// права ни обновлять токены, ни выкидывать из текущей (иначе фоновый запрос
/// прежнего пользователя «воскрешал» его сессию после перелогина).
class SessionBridge {
  Future<bool> Function()? onRefresh;
  Future<void> Function()? onLogout;

  int _epoch = 0;

  /// Идёт ли обновление прямо сейчас: параллельные 401 ждут один refresh.
  Future<bool>? _inFlight;

  int get epoch => _epoch;

  /// Граница сессий: вход или выход. Обновление, начатое прежней сессией,
  /// новой не достаётся — следующий 401 пойдёт в сеть заново.
  void startNewSession() {
    _epoch++;
    _inFlight = null;
  }

  /// Обновление с защитой от гонки: первый вызов идёт в сеть, остальные ждут его.
  Future<bool> refresh() {
    final current = _inFlight;
    if (current != null) return current;

    final handler = onRefresh;
    if (handler == null) return Future<bool>.value(false);

    late final Future<bool> future;
    future = handler().whenComplete(() {
      if (identical(_inFlight, future)) _inFlight = null;
    });
    _inFlight = future;
    return future;
  }

  Future<void> logout() async {
    final handler = onLogout;
    if (handler != null) await handler();
  }
}

/// HTTP-клиент одного сервиса: базовый URL, токен в заголовке, refresh при 401
/// и единый маппинг ошибок в [AppException].
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required TokenStore tokenStore,
    required this.sessionBridge,
    Dio? dio,
  })  : _tokenStore = tokenStore,
        dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: baseUrl,
                connectTimeout: ApiConstants.connectTimeout,
                receiveTimeout: ApiConstants.receiveTimeout,
                contentType: Headers.jsonContentType,
                // 4xx разбираем сами: Dio не должен бросать на 401/403/404.
                validateStatus: (status) => status != null && status < 500,
              ),
            ) {
    this.dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) async {
              options.extra[_epochKey] = sessionBridge.epoch;
              // Явный токен (выход прежней сессии) — хранилище не читаем: там
              // уже может лежать сессия следующего пользователя или пусто.
              if (options.extra[explicitAuthKey] == true) {
                handler.next(options);
                return;
              }
              final token = await _tokenStore.readAccessToken();
              if (token != null && token.isNotEmpty) {
                options.headers['Authorization'] = 'Bearer $token';
              }
              handler.next(options);
            },
            onResponse: (response, handler) async {
              final request = response.requestOptions;
              if (response.statusCode == 401 && _mayRefresh(request)) {
                final refreshed = await sessionBridge.refresh();
                if (refreshed && _isCurrentSession(request)) {
                  handler.resolve(await _retry(request));
                  return;
                }
                if (!refreshed && _isCurrentSession(request)) await sessionBridge.logout();
                handler.reject(
                  DioException(
                    requestOptions: request,
                    response: response,
                    type: DioExceptionType.badResponse,
                  ),
                  true,
                );
                return;
              }
              handler.next(response);
            },
            onError: (error, handler) async {
              final request = error.requestOptions;
              if (error.response?.statusCode == 401 && _mayRefresh(request)) {
                final refreshed = await sessionBridge.refresh();
                if (refreshed && _isCurrentSession(request)) {
                  handler.resolve(await _retry(request));
                  return;
                }
                if (!refreshed && _isCurrentSession(request)) await sessionBridge.logout();
              }
              handler.next(error);
            },
          ),
        );
  }

  /// `extra`-флаг запроса с уже подставленным `Authorization`: интерцептор не
  /// трогает заголовок, а 401 не запускает refresh/logout текущей сессии.
  static const String explicitAuthKey = 'explicitAuth';

  static const String _epochKey = 'sessionEpoch';

  /// Опции запроса от имени конкретного access-токена (или вовсе без него).
  static Options explicitAuth(String? accessToken) => Options(
        headers: <String, dynamic>{
          if (accessToken != null && accessToken.isNotEmpty) 'Authorization': 'Bearer $accessToken',
        },
        extra: <String, dynamic>{explicitAuthKey: true},
      );

  /// Запрос ушёл в текущей сессии: только такой 401 вправе обновлять токены
  /// или завершать сессию.
  bool _isCurrentSession(RequestOptions options) =>
      options.extra[_epochKey] == sessionBridge.epoch;

  /// Refresh имеет смысл, только если запрос нёс токен текущей сессии: без
  /// токена (сессии нет) или с явным чужим токеном обновлять нечего.
  bool _mayRefresh(RequestOptions options) =>
      options.extra[explicitAuthKey] != true &&
      options.headers.containsKey('Authorization') &&
      _isCurrentSession(options);

  final String baseUrl;
  final Dio dio;
  final TokenStore _tokenStore;
  final SessionBridge sessionBridge;

  /// Повтор исходного запроса после успешного refresh.
  Future<Response<dynamic>> _retry(RequestOptions options) {
    // Старый `Authorization` снимается: интерцептор подставит свежий токен.
    final headers = Map<String, dynamic>.from(options.headers)..remove('Authorization');
    return dio.fetch<dynamic>(options.copyWith(headers: headers));
  }

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
    Options? options,
  }) =>
      _send(() => dio.get<dynamic>(path, queryParameters: query, options: options));

  Future<Response<dynamic>> post(
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    Options? options,
  }) =>
      _send(() => dio.post<dynamic>(path, data: data, queryParameters: query, options: options));

  Future<Response<dynamic>> patch(
    String path, {
    Object? data,
    Options? options,
  }) =>
      _send(() => dio.patch<dynamic>(path, data: data, options: options));

  Future<Response<dynamic>> delete(String path, {Object? data, Options? options}) =>
      _send(() => dio.delete<dynamic>(path, data: data, options: options));

  /// Загрузка файла (multipart): фото, аватар, план этажа.
  Future<Response<dynamic>> upload(
    String path, {
    required String filePath,
    required String field,
    Map<String, dynamic>? fields,
    void Function(int sent, int total)? onProgress,
    String? fileName,
  }) async {
    final file = await MultipartFile.fromFile(filePath, filename: fileName);
    final form = FormData.fromMap({
      ...?fields,
      field: file,
    });
    return _send(
      () => dio.post<dynamic>(
        path,
        data: form,
        onSendProgress: onProgress,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: ApiConstants.uploadTimeout,
          receiveTimeout: ApiConstants.uploadTimeout,
        ),
      ),
    );
  }

  /// Единая точка обработки ответа: 2xx → `Response`, иначе [AppException].
  Future<Response<dynamic>> _send(Future<Response<dynamic>> Function() request) async {
    try {
      final response = await request();
      final status = response.statusCode ?? 0;
      if (status >= 200 && status < 300) return response;
      throw _exceptionFor(response);
    } on DioException catch (error) {
      throw _mapDioError(error);
    }
  }

  AppException _exceptionFor(Response<dynamic> response) {
    final status = response.statusCode ?? 0;
    final body = response.data;
    final message = _extractMessage(body);
    switch (status) {
      case 400:
        return ValidationException(message ?? tr('Проверьте заполненные поля'),
            fieldErrors: _extractFieldErrors(body));
      case 401:
        return const UnauthorizedException();
      case 403:
        return ForbiddenException(message ?? tr('Недостаточно прав'));
      case 404:
        return NotFoundException(message ?? tr('Не найдено'));
      case 409:
        return ConflictException(message ?? tr('Конфликт данных'));
      case 429:
        return TooManyRequestsException(message ?? tr('Слишком много попыток, попробуйте позже'));
      default:
        return ServerException(message ?? tr('Ошибка сервера'), status);
    }
  }

  AppException _mapDioError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return const NetworkException();
      case DioExceptionType.badResponse:
        final response = error.response;
        if (response != null) return _exceptionFor(response);
        return ServerException(error.message ?? tr('Ошибка сервера'));
      case DioExceptionType.cancel:
        return NetworkException(tr('Запрос отменён'));
    }
  }

  /// NestJS отдаёт `message` строкой или массивом строк (class-validator).
  static String? _extractMessage(dynamic body) {
    if (body is Map) {
      final message = body['message'];
      if (message is String && message.isNotEmpty) return message;
      if (message is List && message.isNotEmpty) return message.first.toString();
      final error = body['error'];
      if (error is String && error.isNotEmpty) return error;
    }
    return null;
  }

  /// `message: ['email must be an email']` → `{email: '...'}` — для подсветки поля.
  static Map<String, String> _extractFieldErrors(dynamic body) {
    if (body is! Map) return const {};
    final raw = body['message'];
    if (raw is! List) return const {};

    final result = <String, String>{};
    for (final item in raw) {
      final text = item.toString();
      final field = text.split(' ').first;
      if (field.isNotEmpty) result.putIfAbsent(field, () => text);
    }
    return result;
  }
}
