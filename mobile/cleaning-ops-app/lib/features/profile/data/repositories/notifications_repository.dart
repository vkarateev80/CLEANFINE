import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../services/api_client.dart';
import '../../../../shared/data/result.dart';
import '../models/notification_models.dart';

/// notification-service (3006): устройства, in-app список и настройки подписок.
///
/// `userId` нигде не передаётся: сервер берёт его из JWT
/// (`notifications.controller.ts`, «пользовательские эндпоинты работают только
/// со своими данными»).
class NotificationsRepository {
  NotificationsRepository(this._api);

  static const String _base = '${ApiConstants.apiPrefix}/notifications';

  final ApiClient _api;

  /// `POST /api/notifications/device` — upsert по токену, отвечает **200**.
  ///
  /// `platform` — `android` | `ios` | `web` (`DEVICE_PLATFORMS`); иное значение
  /// сервер отклоняет 400 «Недопустимая платформа».
  Future<Result<bool>> registerDevice({required String token, required String platform}) {
    return guard(() async {
      await _api.post(
        '$_base/device',
        data: <String, dynamic>{'token': token, 'platform': platform},
      );
      return true;
    });
  }

  /// `GET /api/notifications/settings` → `{userId, disabledTypes, availableTypes}`.
  Future<Result<NotificationSettings>> settings() {
    return guard(() async {
      final response = await _api.get('$_base/settings');
      final NotificationSettings? settings = NotificationSettings.tryParse(response.data);
      if (settings == null) {
        throw const ServerException('Некорректный ответ сервера: настройки уведомлений');
      }
      return settings;
    });
  }

  /// `PATCH /api/notifications/settings {disabledTypes}` — 400 при незнакомом
  /// типе: текст сервера показывается оператору (`profile.md` §3.4).
  Future<Result<NotificationSettings>> updateSettings(List<String> disabledTypes) {
    return guard(() async {
      final response = await _api.patch(
        '$_base/settings',
        data: <String, dynamic>{'disabledTypes': disabledTypes},
      );
      return NotificationSettings.tryParse(response.data) ??
          NotificationSettings(disabledTypes: disabledTypes, availableTypes: NotificationTypes.ordered);
    });
  }

  /// `GET /api/notifications?unreadOnly=true` → `unreadCount` для бейджа.
  Future<Result<int>> unreadCount() {
    return guard(() async {
      final response = await _api.get(
        _base,
        query: <String, dynamic>{'page': 1, 'limit': 20, 'unreadOnly': true},
      );
      final dynamic body = response.data;
      if (body is! Map) return 0;
      final dynamic unread = body['unreadCount'];
      if (unread is num) return unread.round();
      return int.tryParse(unread?.toString() ?? '') ?? 0;
    });
  }
}
