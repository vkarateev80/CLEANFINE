import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../core/errors/failures.dart';
import '../../../../database/database_provider.dart';
import '../../../../services/push_service.dart';
import '../../../../services/secure_storage_service.dart';
import '../../../../services/service_providers.dart';
import '../../../../shared/data/result.dart';
import '../../../auth/data/models/auth_user.dart';
import '../../../auth/data/repositories/auth_result.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/models/notification_models.dart';
import '../../data/repositories/notifications_repository.dart';

/// Уведомления (notification-service, 3006).
final notificationsRepositoryProvider = Provider<NotificationsRepository>((Ref ref) {
  return NotificationsRepository(ref.watch(notificationsApiProvider));
});

/// Профиль пользователя: `GET /api/auth/me`.
///
/// Модель карточки — тот же `SafeUser`, что использует вход (`AuthUser`), поэтому
/// второй словарь полей не появляется.
class ProfileController extends AsyncNotifier<AuthUser> {
  @override
  Future<AuthUser> build() async {
    // Профиль — `GET /api/auth/me` текущей сессии: вход другого пользователя
    // перечитывает его, а не показывает прежнего.
    ref.watch(sessionScopeProvider);
    final AuthResult<AuthUser> result = await ref.read(authRepositoryProvider).me();
    return switch (result) {
      AuthSuccess<AuthUser>(:final AuthUser data) => data,
      AuthFailure<AuthUser>(:final Failure failure) => throw failure,
    };
  }

  /// Аватар нельзя записать в профиль (`profile.md` п. 10.1): сервер создаёт
  /// привязку файла, но `avatarUrl` меняет только админ. Поэтому показываем
  /// выбранный файл локально — до перезапуска приложения.
  Future<String?> uploadAvatar(String filePath) async {
    final AuthUser? me = state.valueOrNull;
    if (me == null) return null;
    try {
      final response = await ref.read(filesApiProvider).upload(
            '$_filesPrefix/upload',
            filePath: filePath,
            field: 'file',
            fields: <String, dynamic>{'kind': 'avatar'},
          );
      final dynamic body = response.data;
      final String? fileId = body is Map ? body['id']?.toString() : null;
      // Хост ссылки приводится к хосту API: file-service отдаёт свой (см. deviceUrl).
      final String? url = body is Map
          ? ApiConstants.deviceUrl(body['url']?.toString())
          : null;
      if (fileId == null || fileId.isEmpty) {
        throw const ServerException('Некорректный ответ сервера: не удалось загрузить фото');
      }
      await ref.read(filesApiProvider).post(
            '$_filesPrefix/$fileId/attach',
            data: <String, dynamic>{'entityType': 'AVATAR', 'entityId': me.id},
          );
      final AuthUser updated = AuthUser(
        id: me.id,
        email: me.email,
        fullName: me.fullName,
        role: me.role,
        phone: me.phone,
        avatarUrl: url,
        isActive: me.isActive,
      );
      state = AsyncData<AuthUser>(updated);
      return url;
    } on AppException catch (error) {
      state = AsyncData<AuthUser>(me);
      throw ProfileActionException(error.message);
    }
  }

  static const String _filesPrefix = '/api/files';
}

final profileProvider = AsyncNotifierProvider<ProfileController, AuthUser>(
  ProfileController.new,
);

/// Ошибка операции профиля с текстом, готовым к показу.
class ProfileActionException implements Exception {
  const ProfileActionException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Настройки подписок: `GET /api/notifications/settings`.
final notificationSettingsProvider = AsyncNotifierProvider<NotificationSettingsController, NotificationSettings>(
  NotificationSettingsController.new,
);

class NotificationSettingsController extends AsyncNotifier<NotificationSettings> {
  @override
  Future<NotificationSettings> build() async {
    ref.watch(sessionScopeProvider);
    final Result<NotificationSettings> result =
        await ref.read(notificationsRepositoryProvider).settings();
    final Failure? failure = result.failureOrNull;
    if (failure != null) throw failure;
    return result.dataOrNull ?? const NotificationSettings.empty();
  }

  /// `PATCH /api/notifications/settings {disabledTypes}`.
  ///
  /// Сервер отвечает 400 «Недопустимый тип уведомления» — текст показывается
  /// оператору, а не глотается (`profile.md` §3.4).
  Future<String?> save(NotificationSettings settings) async {
    final Result<NotificationSettings> result = await ref
        .read(notificationsRepositoryProvider)
        .updateSettings(settings.disabledTypes);
    final Failure? failure = result.failureOrNull;
    if (failure != null) return failure.message;
    state = AsyncData<NotificationSettings>(result.dataOrNull ?? settings);
    return null;
  }
}

/// Смена пароля: `POST /api/auth/change-password`.
///
/// Сервер отзывает **все** сессии (`auth.service.ts`), поэтому после успеха
/// `AuthRepository.changePassword` гасит локальную сессию — роутер сам уводит на
/// `/login`, а экран успевает показать snackbar «Пароль изменён. Войдите заново.».
class ChangePasswordController extends Notifier<ChangePasswordState> {
  @override
  ChangePasswordState build() {
    ref.watch(sessionScopeProvider);
    return const ChangePasswordState();
  }

  Future<bool> submit({required String currentPassword, required String newPassword}) async {
    state = const ChangePasswordState(isSubmitting: true);
    final AuthResult<bool> result = await ref.read(authRepositoryProvider).changePassword(
          currentPassword: currentPassword,
          newPassword: newPassword,
        );
    switch (result) {
      case AuthSuccess<bool>():
        state = const ChangePasswordState();
        return true;
      case AuthFailure<bool>(:final Failure failure):
        state = ChangePasswordState(error: failure.message);
        return false;
    }
  }
}

class ChangePasswordState {
  const ChangePasswordState({this.isSubmitting = false, this.error});

  final bool isSubmitting;
  final String? error;
}

final changePasswordProvider = NotifierProvider<ChangePasswordController, ChangePasswordState>(
  ChangePasswordController.new,
);

/// Выход из аккаунта: серверный `logout` + локальная очистка (`profile.md` §4).
final logoutControllerProvider = NotifierProvider<LogoutController, LogoutState>(
  LogoutController.new,
);

class LogoutState {
  const LogoutState({this.inProgress = false, this.error});

  final bool inProgress;
  final String? error;
}

class LogoutController extends Notifier<LogoutState> {
  @override
  LogoutState build() => const LogoutState();

  /// Локальная очистка выполняется всегда: без сети выход тоже обязан работать
  /// (`profile.md` §4). Роутер уводит на `/login` по смене сессии.
  Future<bool> logout() async {
    state = const LogoutState(inProgress: true);
    // Пока сессия жива — отвязываем push-токен устройства от пользователя.
    await _unregisterPushDevice();
    final AuthResult<bool> result = await ref.read(authRepositoryProvider).logout();
    state = const LogoutState();
    return result is AuthSuccess<bool>;
  }

  /// Best-effort и не дольше 3 с (`profile.md` §5 «таймаут 3 с»): без сети
  /// выход не ждёт, а следующий вход перепривяжет токен к новому пользователю.
  Future<void> _unregisterPushDevice() async {
    try {
      await () async {
        final String? token = await ref.read(pushServiceProvider).token();
        if (token == null || token.isEmpty) return;
        await ref.read(notificationsRepositoryProvider).unregisterDevice(token);
      }()
          .timeout(const Duration(seconds: 3));
    } on Object {
      // Отвязка не удалась — выход всё равно продолжается.
    }
  }
}

/// Аватар устройства: файл `{avatars_dir}/{userId}.jpg` показывается, пока не
/// загрузился сетевой (`profile.md` §3.1).
///
/// ⚠️ Все файловые операции — только фоном и best-effort: в тестовом окружении
/// `path_provider` не отвечает никогда (урок М6.7), а аватар не критичен.
class AvatarCache {
  AvatarCache({Future<Directory> Function()? documentsDirectory})
      : _documentsDirectory = documentsDirectory ?? getApplicationDocumentsDirectory;

  static const String directoryName = 'avatars';

  final Future<Directory> Function() _documentsDirectory;

  Future<File?> file(String userId) async {
    try {
      final Directory dir = await _documentsDirectory();
      final File file = File('${dir.path}/$directoryName/$userId.jpg');
      return await file.exists() ? file : null;
    } on Object {
      return null;
    }
  }

  Future<void> save(String userId, String sourcePath) async {
    try {
      final Directory dir = await _documentsDirectory();
      final Directory target = Directory('${dir.path}/$directoryName');
      if (!await target.exists()) await target.create(recursive: true);
      await File(sourcePath).copy('${target.path}/$userId.jpg');
    } on Object {
      // Кэш аватара — оптимизация: ошибка копирования не влияет на экран.
    }
  }
}

final avatarCacheProvider = Provider<AvatarCache>((Ref ref) => AvatarCache());

/// Выбор фото: камера или галерея (`image_picker`).
abstract class PhotoPicker {
  Future<String?> pick(ImageSource source);
}

class ImagePickerPhotoPicker implements PhotoPicker {
  ImagePickerPhotoPicker({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<String?> pick(ImageSource source) async {
    try {
      final XFile? file = await _picker.pickImage(source: source, imageQuality: 85);
      return file?.path;
    } on Object {
      return null;
    }
  }
}

final photoPickerProvider = Provider<PhotoPicker>((Ref ref) => ImagePickerPhotoPicker());

/// «Показать тестовое уведомление» — только в debug-сборке (`profile.md` §3.4).
///
/// На стенде push отправляет `MockPushSender` (пустые `FIREBASE_*`), поэтому
/// тестовое уведомление проходит весь путь без ключей Firebase.
bool get testNotificationAvailable => kDebugMode;

/// Текущая сессия: нужна профилю, чтобы показать выход и читать `userId`.
final sessionUserIdProvider = Provider<String?>((Ref ref) => ref.watch(sessionProvider).userId);

/// Хранилище токенов — для проверки очистки сессии в тестах и диагностике.
final secureStorageReadableProvider = Provider<SecureStorageService>(
  (Ref ref) => ref.watch(secureStorageProvider),
);

/// Очередь отправки: число записей `pending`/`failed` для пункта профиля.
final pendingActionsCountProvider = FutureProvider<int>((Ref ref) async {
  ref.watch(sessionScopeProvider);
  return ref.watch(pendingActionQueueProvider).pendingCount();
});
