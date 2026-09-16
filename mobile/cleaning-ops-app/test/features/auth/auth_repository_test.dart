import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/features/auth/auth_texts.dart';
import 'package:cleaning_ops_app/features/auth/data/datasources/auth_remote_datasource.dart';
import 'package:cleaning_ops_app/features/auth/data/models/auth_user.dart';
import 'package:cleaning_ops_app/features/auth/data/models/pin_credentials.dart';
import 'package:cleaning_ops_app/features/auth/data/repositories/auth_repository.dart';
import 'package:cleaning_ops_app/features/auth/data/repositories/auth_result.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';

/// Приёмка М6.1: репозиторий входа не пускает исключения наружу и переводит
/// ответы сервера в понятные `Failure` — успех, 401, сеть, валидация, роль CLIENT.
void main() {
  const Map<String, Object> operatorUser = <String, Object>{
    'id': 'u-1',
    'email': 'operator@cleaning-ops.com',
    'fullName': 'Иванов Иван',
    'role': 'OPERATOR',
    'isActive': true,
  };
  const Map<String, Object> tokens = <String, Object>{
    'accessToken': 'access-1',
    'refreshToken': 'refresh-1',
  };

  AuthRepository build({
    required FakeHttpAdapter adapter,
    RecordingSessionWriter? session,
    InMemoryPinStore? pins,
  }) {
    return AuthRepository(
      remote: AuthRemoteDataSource(fakeApiClient(adapter)),
      storage: InMemorySecureStorage(),
      session: session ?? RecordingSessionWriter(),
      pinStore: pins ?? InMemoryPinStore(),
    );
  }

  /// Обработчик, который узнаёт эндпоинт по пути и отдаёт заданный сценарий.
  FakeHttpAdapter routes({
    FakeResponse login = const FakeResponse(201, tokens),
    FakeResponse me = const FakeResponse(200, operatorUser),
    FakeResponse pin = const FakeResponse(201, tokens),
  }) {
    return FakeHttpAdapter((RequestOptions options) async {
      if (options.path.endsWith('/auth/me')) return me;
      if (options.path.endsWith('/auth/pin')) return pin;
      if (options.path.endsWith('/auth/logout')) return const FakeResponse(200, <String, Object>{});
      return login;
    });
  }

  test('успешный вход сохраняет сессию и запоминает email для PIN', () async {
    final session = RecordingSessionWriter();
    final pins = InMemoryPinStore();
    final repository = build(adapter: routes(), session: session, pins: pins);

    final AuthResult<AuthUser> result = await repository.login(
      email: 'operator@cleaning-ops.com',
      password: 'operator123',
    );

    expect(result.isSuccess, isTrue);
    expect(result.dataOrNull?.fullName, 'Иванов Иван');
    expect(session.signInCalls, hasLength(1));
    expect(session.signInCalls.single['accessToken'], 'access-1');
    expect(session.signInCalls.single['role'], 'OPERATOR');
    expect(pins.credentials.email, 'operator@cleaning-ops.com');
  });

  test('401 превращается в UnauthorizedFailure, сессия не открывается', () async {
    final session = RecordingSessionWriter();
    final repository = build(
      adapter: FakeHttpAdapter(
        (_) async => const FakeResponse(401, <String, Object>{'message': 'Неверный пароль'}),
      ),
      session: session,
    );

    final AuthResult<AuthUser> result =
        await repository.login(email: 'operator@cleaning-ops.com', password: 'wrong');

    expect(result.failureOrNull, isA<UnauthorizedFailure>());
    expect(session.signInCalls, isEmpty);
  });

  test('нет сети — NetworkFailure с текстом из AuthTexts', () async {
    final repository = build(
      adapter: FakeHttpAdapter(
        (RequestOptions options) async => throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        ),
      ),
    );

    final AuthResult<AuthUser> result =
        await repository.login(email: 'operator@cleaning-ops.com', password: 'operator123');

    expect(result.failureOrNull, isA<NetworkFailure>());
    expect(result.failureOrNull?.message, AuthTexts.network);
  });

  test('400 с массивом сообщений даёт ValidationFailure с ошибками по полям', () async {
    final repository = build(
      adapter: FakeHttpAdapter(
        (_) async => const FakeResponse(400, <String, Object>{
          'message': <String>['email must be an email'],
        }),
      ),
    );

    final AuthResult<AuthUser> result =
        await repository.login(email: 'bad', password: 'operator123');

    final Failure? failure = result.failureOrNull;
    expect(failure, isA<ValidationFailure>());
    expect((failure! as ValidationFailure).fieldErrors, isNotEmpty);
  });

  test('роль CLIENT не пускается в приложение, сессия гасится', () async {
    final session = RecordingSessionWriter();
    final repository = build(
      adapter: routes(
        me: const FakeResponse(200, <String, Object>{
          'id': 'client-1',
          'email': 'client@example.com',
          'fullName': 'Заказчик',
          'role': 'CLIENT',
          'isActive': true,
        }),
      ),
      session: session,
    );

    final AuthResult<AuthUser> result =
        await repository.login(email: 'client@example.com', password: 'client123');

    expect(result.failureOrNull, isA<ForbiddenFailure>());
    expect(session.signInCalls, isEmpty);
    expect(session.signOutCalls, greaterThan(0));
  });

  test('вход по PIN без сохранённого email/телефона объясняет, что PIN не установлен', () async {
    final repository = build(adapter: routes());

    final AuthResult<AuthUser> result = await repository.loginWithPin(pin: '3456');

    expect(result.failureOrNull, isA<NotFoundFailure>());
    expect(result.failureOrNull?.message, AuthTexts.pinNotSet);
  });

  test('вход по PIN использует сохранённый email', () async {
    final pins = InMemoryPinStore()
      ..credentials = const PinCredentials(email: 'operator@cleaning-ops.com');
    final repository = build(adapter: routes(), pins: pins);

    final AuthResult<AuthUser> result = await repository.loginWithPin(pin: '3456');

    expect(result.isSuccess, isTrue);
  });
}
