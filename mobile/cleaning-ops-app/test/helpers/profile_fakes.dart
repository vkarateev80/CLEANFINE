import 'dart:async';
import 'dart:io';

import 'package:cleaning_ops_app/core/errors/exceptions.dart';
import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/features/auth/data/datasources/auth_remote_datasource.dart';
import 'package:cleaning_ops_app/features/auth/data/models/auth_user.dart';
import 'package:cleaning_ops_app/features/profile/data/models/notification_models.dart';
import 'package:cleaning_ops_app/features/profile/data/repositories/notifications_repository.dart';
import 'package:cleaning_ops_app/features/profile/presentation/providers/profile_providers.dart';
import 'package:cleaning_ops_app/services/cache_maintenance.dart';
import 'package:cleaning_ops_app/services/push_service.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

import 'auth_fakes.dart';

/// Подмены профиля и push для тестов М6.8 (DS-002 `profile.md` §10).
///
/// Авторизация подменяется на уровне **источника данных**, а не репозитория:
/// так проверяется настоящий путь `AuthRepository` → `SessionController`, а не
/// заглушка. Иначе тест выхода не увидел бы смены сессии и перехода на `/login`.

/// auth-service без сети: `me`, `logout`, `change-password`.
class FakeAuthRemote extends AuthRemoteDataSource {
  FakeAuthRemote({
    this.user = const AuthUser(
      id: 'me',
      email: 'operator',
      fullName: 'Иванов Иван Иванович',
      role: 'OPERATOR',
      phone: '+79990000003',
    ),
    this.meFailure,
    this.logoutFailure,
    this.changePasswordFailure,
  }) : super(
          fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
        );

  AuthUser user;

  /// Ошибка слоя данных (`AppException`): репозиторий переводит её в `Failure`.
  AppException? meFailure;
  AppException? logoutFailure;
  AppException? changePasswordFailure;

  int meCalls = 0;
  int logoutCalls = 0;
  final List<Map<String, String>> changePasswordCalls = <Map<String, String>>[];
  final List<String?> logoutRefreshTokens = <String?>[];

  @override
  Future<AuthUser> me() async {
    meCalls += 1;
    if (meFailure != null) throw meFailure!;
    return user;
  }

  @override
  Future<void> logout({String? refreshToken, String? accessToken}) async {
    logoutCalls += 1;
    logoutRefreshTokens.add(refreshToken);
    if (logoutFailure != null) throw logoutFailure!;
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    changePasswordCalls.add(<String, String>{
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    if (changePasswordFailure != null) throw changePasswordFailure!;
  }
}

/// Настройки уведомлений без сети.
class FakeNotificationsRepository extends NotificationsRepository {
  FakeNotificationsRepository({
    NotificationSettings? settings,
    this.settingsFailure,
    this.saveFailure,
    this.deviceFailure,
  })  : _settings = settings ??
            const NotificationSettings(
              disabledTypes: <String>['MATERIAL_LOW'],
              availableTypes: <String>['EMERGENCY', 'MATERIAL_LOW'],
            ),
        super(
          fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
        );

  NotificationSettings _settings;

  Failure? settingsFailure;
  Failure? saveFailure;

  /// Отказ `POST /api/notifications/device` (например, 400 «Недопустимая
  /// платформа» или нет сети): регистрация токена не должна ронять приложение.
  Failure? deviceFailure;

  /// Что именно ушло в `PATCH /api/notifications/settings`.
  final List<List<String>> savedDisabledTypes = <List<String>>[];

  /// Что именно ушло в `POST /api/notifications/device`.
  final List<Map<String, String>> registeredDevices = <Map<String, String>>[];

  @override
  Future<Result<NotificationSettings>> settings() async {
    if (settingsFailure != null) return Err<NotificationSettings>(settingsFailure!);
    return Ok<NotificationSettings>(_settings);
  }

  @override
  Future<Result<NotificationSettings>> updateSettings(List<String> disabledTypes) async {
    savedDisabledTypes.add(disabledTypes);
    if (saveFailure != null) return Err<NotificationSettings>(saveFailure!);
    _settings = _settings.copyWith(disabledTypes: disabledTypes);
    return Ok<NotificationSettings>(_settings);
  }

  @override
  Future<Result<bool>> registerDevice({required String token, required String platform}) async {
    registeredDevices.add(<String, String>{'token': token, 'platform': platform});
    if (deviceFailure != null) return Err<bool>(deviceFailure!);
    return const Ok<bool>(true);
  }
}

/// Push без Firebase: токен и события задаёт тест.
class FakePushService implements PushService {
  FakePushService({this.deviceToken});

  /// `null` — Firebase не сконфигурирована (dev без кредов).
  String? deviceToken;

  final StreamController<PushMessage> _foreground = StreamController<PushMessage>.broadcast();
  final StreamController<PushMessage> _opened = StreamController<PushMessage>.broadcast();

  PushMessage? initial;

  int tokenCalls = 0;

  @override
  Future<String?> token() async {
    tokenCalls += 1;
    return deviceToken;
  }

  @override
  Stream<PushMessage> get foreground => _foreground.stream;

  @override
  Stream<PushMessage> get opened => _opened.stream;

  @override
  Future<PushMessage?> initialMessage() async => initial;

  /// Уведомление при открытом приложении.
  void emitForeground(PushMessage message) => _foreground.add(message);

  /// Уведомление, открывшее приложение.
  void emitOpened(PushMessage message) => _opened.add(message);

  Future<void> dispose() async {
    await _foreground.close();
    await _opened.close();
  }
}

/// Выбор фото без камеры и галереи.
class FakePhotoPicker implements PhotoPicker {
  FakePhotoPicker({this.path = '/tmp/avatar.jpg'});

  final String? path;
  ImageSource? source;

  @override
  Future<String?> pick(ImageSource source) async {
    this.source = source;
    return path;
  }
}

/// Размер кэша, которым управляет тест.
///
/// Настоящий `CacheUsage` считает `CacheMaintenance.usage()`, а тот зовёт
/// `getApplicationDocumentsDirectory()` из `path_provider`. В widget-тесте
/// платформенный канал не отвечает никогда, поэтому этот `Future` не
/// завершается, `AsyncValue` навсегда остаётся в загрузке, а `pumpAndSettle`
/// ждёт вечно — файл тестов виснет целиком (та же ловушка, что с файловым
/// кэшем плана в М6.7). Здесь каталог подменяется, и `path_provider` в тестах
/// не вызывается вовсе.
class FakeCacheUsageTracker {
  FakeCacheUsageTracker({CacheUsage? value}) : _value = value;

  CacheUsage? _value;

  /// Сколько раз экран запрашивал размер (`ref.watch(cacheUsageProvider)`).
  int reads = 0;

  /// Посчитанный размер — либо `null`, пока расчёт «идёт» (состояние загрузки).
  Future<CacheUsage> usage() {
    reads += 1;
    final CacheUsage? value = _value;
    if (value != null) return Future<CacheUsage>.value(value);
    return Completer<CacheUsage>().future; // Никогда не завершается: проверяем, что экран жив.
  }

  /// Отдать размер (после этого новые чтения получают значение).
  void complete(CacheUsage value) => _value = value;
}

/// Каталог документов во временной папке хоста — вместо `path_provider`.
///
/// `clearCache()` работает с настоящими файлами, поэтому тесту нужен реальный
/// каталог. Асинхронный `Directory.systemTemp.createTemp()` из fake-async зоны
/// widget-теста не завершился бы — берём синхронный вариант. Уборку вешает на
/// себя сам каталог (`addTearDown` из flutter_test), чтобы каждый тест не
/// повторял её.
Directory tempDocumentsDirectory() {
  final Directory directory = Directory.systemTemp.createTempSync('cleaning_ops_cache_test');
  try {
    addTearDown(() {
      if (directory.existsSync()) directory.deleteSync(recursive: true);
    });
  } on Object {
    // Вызов вне зоны теста (например, из хелпера, поднятого вручную) — уборка
    // остаётся на тесте.
  }
  return directory;
}

/// Обслуживание кэша без `path_provider`: база и очередь — что дал тест,
/// каталог — временная папка хоста.
///
/// Наследник настоящего [CacheMaintenance], поэтому проверяется его логика
/// (`usage`, удаление `plans_dir`, очередь не тронута), а не заглушка. Каталог
/// доступен тесту через [directory] — иначе он не смог бы положить туда файл
/// для проверки очистки.
class FakeCacheMaintenance extends CacheMaintenance {
  FakeCacheMaintenance({
    required super.database,
    required super.queue,
    required this.directory,
  }) : super(documentsDirectory: (() async => directory));

  /// Каталог, который подменяет `getApplicationDocumentsDirectory()`.
  final Directory directory;
}

/// Обслуживание кэша, читающее размер и удаляющее файлы во временном каталоге.
FakeCacheMaintenance fakeCacheMaintenance({
  required AppDatabase database,
  required PendingActionQueue queue,
  required Directory directory,
}) {
  return FakeCacheMaintenance(database: database, queue: queue, directory: directory);
}
