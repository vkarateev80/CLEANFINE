import '../../../core/constants/api_constants.dart';
import '../../../core/errors/exceptions.dart';
import '../../../services/api_client.dart';
import '../models/operation_completion.dart';
import '../models/operator_models.dart';
import '../models/tech_card_models.dart';
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

  /// `GET /api/rooms/:id` — помещение и его техкарта (чек-лист М6.4).
  Future<Result<RoomDetail>> room(String id) {
    return guard(() async {
      final response = await _api.get('${ApiConstants.apiPrefix}/rooms/$id');
      return _require(RoomDetail.tryParse(response.data), 'помещение');
    });
  }

  /// `GET /api/tech-cards/:id` — операции техкарты по порядку.
  Future<Result<TechCardDetail>> techCard(String id) {
    return guard(() async {
      final response = await _api.get('${ApiConstants.apiPrefix}/tech-cards/$id');
      return _require(TechCardDetail.tryParse(response.data), 'техкарта');
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

  /// `POST /api/tickets/:ticketId/operations/:operationId/complete` (М3.6).
  ///
  /// Идемпотентно по паре `(ticketId, operationId)`: повтор возвращает
  /// `alreadyCompleted: true` — для вызывающего это успех.
  /// `requiresPhoto` отправляем только вместе с `photoUrl`: сервер отвечает 400,
  /// если операция требует фото, а ссылки нет.
  Future<Result<CompleteOperationResult>> completeOperation({
    required String ticketId,
    required String operationId,
    DateTime? completedAt,
    String? photoUrl,
    bool requiresPhoto = false,
    int? totalOperations,
  }) {
    return guard(() async {
      final response = await _api.post(
        '$_ticketsPath/$ticketId/operations/$operationId/complete',
        data: <String, dynamic>{
          if (completedAt != null) 'completedAt': completedAt.toUtc().toIso8601String(),
          if (photoUrl != null) 'photoUrl': photoUrl,
          if (requiresPhoto && photoUrl != null) 'requiresPhoto': true,
          if (totalOperations != null) 'totalOperations': totalOperations,
        },
      );
      final CompleteOperationResult? result = CompleteOperationResult.tryParse(response.data);
      if (result == null) {
        throw const ServerException('Некорректный ответ сервера: не удалось разобрать завершение операции');
      }
      return result;
    });
  }
}
