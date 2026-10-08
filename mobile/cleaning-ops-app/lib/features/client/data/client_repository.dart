import '../../../core/constants/api_constants.dart';
import '../../../core/errors/exceptions.dart';
import '../../../services/api_client.dart';
import '../../../shared/data/models/schedule_event.dart';
import '../../../shared/data/result.dart';
import 'client_models.dart';

/// Данные портала заказчика: объект (core), заявки (tickets), смены (schedule).
///
/// Портал только читает объект и смены; из заявок — две мутации: создать
/// обычную и уточнить комментарием (смены статуса и назначения на бэкенде
/// закрыты ролями, в приложении их нет — как и в веб-портале).
class ClientRepository {
  ClientRepository({required ApiClient core, required ApiClient tickets, required ApiClient schedule})
      : _core = core,
        _tickets = tickets,
        _schedule = schedule;

  final ApiClient _core;
  final ApiClient _tickets;
  final ApiClient _schedule;

  static const String _objects = '${ApiConstants.apiPrefix}/objects';
  static const String _ticketsPath = '${ApiConstants.apiPrefix}/tickets';
  static const String _events = '${ApiConstants.apiPrefix}/schedule/events';

  /// «Свой» объект: привязка по `ownerClientId` = id аккаунта заказчика.
  /// `null` — объект ещё не привязан.
  Future<Result<ClientObject?>> myObject(String userId) {
    return guard(() async {
      final response =
          await _core.get(_objects, query: <String, dynamic>{'ownerClientId': userId, 'take': 1});
      final List<ClientObject> items = ClientObject.listFrom(response.data);
      return items.isEmpty ? null : items.first;
    });
  }

  Future<Result<ClientObjectDetail>> objectDetail(String objectId) {
    return guard(() async {
      final response = await _core.get('$_objects/$objectId/detail');
      return _require(ClientObjectDetail.tryParse(response.data), 'объект');
    });
  }

  /// `GET /api/tickets?objectId=…&status=…&skip=…&take=…` → `{items, total}`.
  Future<Result<ClientTicketPage>> tickets(
    String objectId, {
    String? status,
    int skip = 0,
    int take = 20,
  }) {
    return guard(() async {
      final response = await _tickets.get(
        _ticketsPath,
        query: <String, dynamic>{
          'objectId': objectId,
          if (status != null) 'status': status,
          'skip': skip,
          'take': take,
        },
      );
      return ClientTicketPage.parse(response.data);
    });
  }

  /// Число заявок в статусах: контракт принимает ОДИН `status`, поэтому
  /// N параллельных запросов с `take=1` и сумма `total` (как в портале).
  Future<Result<int>> countByStatuses(String objectId, List<String> statuses) {
    return guard(() async {
      final List<ClientTicketPage> pages = await Future.wait(
        statuses.map((String status) async {
          final response = await _tickets.get(
            _ticketsPath,
            query: <String, dynamic>{'objectId': objectId, 'status': status, 'skip': 0, 'take': 1},
          );
          return ClientTicketPage.parse(response.data);
        }),
      );
      return pages.fold<int>(0, (int sum, ClientTicketPage page) => sum + page.total);
    });
  }

  Future<Result<ClientTicketDetail>> ticket(String id) {
    return guard(() async {
      final response = await _tickets.get('$_ticketsPath/$id');
      return _require(ClientTicketDetail.tryParse(response.data), 'заявку');
    });
  }

  /// `POST /api/tickets`: тип `planned|unscheduled`, без приоритета (его
  /// решает диспетчер), `roomId` — только если выбрано помещение.
  Future<Result<ClientTicket>> createTicket({
    required String objectId,
    required String description,
    String type = 'unscheduled',
    String? roomId,
  }) {
    return guard(() async {
      final response = await _tickets.post(
        _ticketsPath,
        data: <String, dynamic>{
          'type': type,
          'objectId': objectId,
          'description': description,
          if (roomId != null && roomId.isNotEmpty) 'roomId': roomId,
        },
      );
      return _require(ClientTicket.tryParse(response.data), 'заявку');
    });
  }

  Future<Result<TicketComment>> addComment(String ticketId, String text) {
    return guard(() async {
      final response =
          await _tickets.post('$_ticketsPath/$ticketId/comments', data: <String, dynamic>{'text': text});
      return _require(TicketComment.tryParse(response.data), 'комментарий');
    });
  }

  /// Смены объекта с даты (`YYYY-MM-DD`, UTC).
  Future<Result<List<ScheduleEvent>>> events(String objectId, {required String fromDate}) {
    return guard(() async {
      final response =
          await _schedule.get(_events, query: <String, dynamic>{'objectId': objectId, 'date': fromDate});
      return ScheduleEvent.listFrom(response.data);
    });
  }

  T _require<T>(T? value, String entity) {
    if (value == null) throw ServerException('Некорректный ответ сервера: не удалось разобрать $entity');
    return value;
  }
}
