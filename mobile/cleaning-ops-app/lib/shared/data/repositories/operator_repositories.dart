import '../../../core/constants/api_constants.dart';
import '../../../core/errors/exceptions.dart';
import '../../../services/api_client.dart';
import '../models/operator_models.dart';
import '../result.dart';

/// Чтение данных core-service и ticket-service, нужных экранам оператора.
class CoreRepository {
  CoreRepository(this._api);

  final ApiClient _api;

  Future<Result<ObjectSummary>> object(String id) {
    return guard(() async {
      final response = await _api.get('${ApiConstants.apiPrefix}/objects/$id');
      return _require(ObjectSummary.tryParse(response.data), 'объект');
    });
  }

  Future<Result<RouteDetail>> route(String id) {
    return guard(() async {
      final response = await _api.get('${ApiConstants.apiPrefix}/routes/$id');
      return _require(RouteDetail.tryParse(response.data), 'маршрут');
    });
  }

  Future<Result<FloorPlan>> floor(String id) {
    return guard(() async {
      final response = await _api.get('${ApiConstants.apiPrefix}/floors/$id');
      return _require(FloorPlan.tryParse(response.data), 'этаж');
    });
  }

  T _require<T>(T? value, String entity) {
    if (value == null) throw ServerException('Некорректный ответ сервера: не удалось разобрать $entity');
    return value;
  }
}

/// Заявки оператора: список по исполнителю и деталь.
class TicketsRepository {
  TicketsRepository(this._api);

  static const String _ticketsPath = '${ApiConstants.apiPrefix}/tickets';

  final ApiClient _api;

  /// `GET /api/tickets?assigneeId={me}&skip=0&take=20` → `{items, total}`.
  Future<Result<List<TicketSummary>>> assignedTo(String userId, {int take = 20, int skip = 0}) {
    return guard(() async {
      final response = await _api.get(
        _ticketsPath,
        query: <String, dynamic>{'assigneeId': userId, 'skip': skip, 'take': take},
      );
      return TicketSummary.listFrom(response.data);
    });
  }
}
