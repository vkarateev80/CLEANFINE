import '../../../core/constants/api_constants.dart';
import '../../../services/api_client.dart';
import '../models/schedule_event.dart';
import '../result.dart';

/// Смены оператора: `GET /api/schedule/my`, деталь, check-in/check-out.
class ScheduleRepository {
  ScheduleRepository(this._api);

  static const String _myPath = '${ApiConstants.apiPrefix}/schedule/my';
  static const String _eventsPath = '${ApiConstants.apiPrefix}/schedule/events';
  static const String _checkInPath = '${ApiConstants.apiPrefix}/schedule/check-in';
  static const String _checkOutPath = '${ApiConstants.apiPrefix}/schedule/check-out';

  final ApiClient _api;

  /// Мои смены: сервер отдаёт список `ScheduleEventView` (возможно, только на дату).
  Future<Result<List<ScheduleEvent>>> myEvents({String? date}) {
    return guard(() async {
      final response = await _api.get(
        _myPath,
        query: <String, dynamic>{if (date != null) 'date': date},
      );
      return ScheduleEvent.listFrom(response.data);
    });
  }

  Future<Result<ScheduleEvent>> eventById(String id) {
    return guard(() async {
      final response = await _api.get('$_eventsPath/$id');
      final ScheduleEvent? event = ScheduleEvent.tryParse(response.data);
      if (event == null) throw const _UnexpectedBody('смена');
      return event;
    });
  }

  /// Отметка прихода: сервер сам проверяет геозону (403 вне зоны).
  Future<Result<bool>> checkIn({
    required String scheduleId,
    required double lat,
    required double lng,
  }) {
    return guard(() async {
      await _api.post(
        _checkInPath,
        data: <String, dynamic>{'scheduleId': scheduleId, 'lat': lat, 'lng': lng},
      );
      return true;
    });
  }

  /// Закрытие смены; координаты необязательны (сервер примет и без них).
  Future<Result<bool>> checkOut({
    required String scheduleId,
    double? lat,
    double? lng,
  }) {
    return guard(() async {
      await _api.post(
        _checkOutPath,
        data: <String, dynamic>{
          'scheduleId': scheduleId,
          if (lat != null) 'lat': lat,
          if (lng != null) 'lng': lng,
        },
      );
      return true;
    });
  }
}

/// Сервер ответил 2xx, но тело не то, что ожидали: это ошибка сервера, а не пользователя.
class _UnexpectedBody implements Exception {
  const _UnexpectedBody(this.entity);

  final String entity;

  @override
  String toString() => 'Некорректный ответ сервера: не удалось разобрать $entity';
}
