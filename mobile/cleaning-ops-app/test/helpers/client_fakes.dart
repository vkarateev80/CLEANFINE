import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/features/client/data/client_models.dart';
import 'package:cleaning_ops_app/features/client/data/client_repository.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';

import 'auth_fakes.dart';

/// Репозиторий портала с заранее заданными ответами — для widget-тестов
/// экранов заказчика без сети.
class FakeClientRepository extends ClientRepository {
  FakeClientRepository({
    this.object,
    this.detail = const ClientObjectDetail(floors: <ClientFloor>[]),
    this.ticketList = const <ClientTicket>[],
    this.eventList = const <ScheduleEvent>[],
    this.ticketDetails = const <String, ClientTicketDetail>{},
    this.failure,
  }) : super(
          core: fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
          tickets: fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
          schedule: fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))),
        );

  ClientObject? object;
  ClientObjectDetail detail;
  List<ClientTicket> ticketList;
  List<ScheduleEvent> eventList;
  Map<String, ClientTicketDetail> ticketDetails;

  /// Если задан — все запросы падают этой ошибкой.
  Failure? failure;

  final List<Map<String, dynamic>> createdTickets = <Map<String, dynamic>>[];
  final List<String> comments = <String>[];

  Result<T> _ok<T>(T value) => failure == null ? Ok<T>(value) : Err<T>(failure!);

  @override
  Future<Result<ClientObject?>> myObject(String userId) async => _ok(object);

  @override
  Future<Result<ClientObjectDetail>> objectDetail(String objectId) async => _ok(detail);

  @override
  Future<Result<ClientTicketPage>> tickets(String objectId,
      {String? status, int skip = 0, int take = 20}) async {
    final List<ClientTicket> items = status == null
        ? ticketList
        : ticketList.where((ClientTicket t) => t.status == status).toList(growable: false);
    return _ok(ClientTicketPage(items: items.take(take).toList(growable: false), total: items.length));
  }

  @override
  Future<Result<int>> countByStatuses(String objectId, List<String> statuses) async =>
      _ok(ticketList.where((ClientTicket t) => statuses.contains(t.status)).length);

  @override
  Future<Result<ClientTicketDetail>> ticket(String id) async {
    final ClientTicketDetail? detail = ticketDetails[id];
    if (failure != null) return Err<ClientTicketDetail>(failure!);
    return detail == null
        ? const Err<ClientTicketDetail>(NotFoundFailure('Заявка не найдена'))
        : Ok<ClientTicketDetail>(detail);
  }

  @override
  Future<Result<ClientTicket>> createTicket({
    required String objectId,
    required String description,
    String type = 'unscheduled',
    String? roomId,
  }) async {
    createdTickets.add(
        <String, dynamic>{'objectId': objectId, 'description': description, 'type': type, 'roomId': roomId});
    final ClientTicket created = ClientTicket(
      id: 'new-${createdTickets.length}',
      type: type,
      priority: 'normal',
      status: 'new',
      description: description,
      createdAt: '2026-10-08T12:00:00.000Z',
      updatedAt: '2026-10-08T12:00:00.000Z',
      roomId: roomId,
    );
    ticketList = <ClientTicket>[created, ...ticketList];
    return _ok(created);
  }

  @override
  Future<Result<TicketComment>> addComment(String ticketId, String text) async {
    comments.add(text);
    return _ok(TicketComment(
        id: 'c${comments.length}', authorId: 'me', text: text, createdAt: '2026-10-08T12:00:00.000Z'));
  }

  @override
  Future<Result<List<ScheduleEvent>>> events(String objectId, {required String fromDate}) async =>
      _ok(eventList);
}

ClientObject demoObject({String status = 'ACTIVE'}) => ClientObject(
      id: 'obj-1',
      name: 'БЦ «Ромашка»',
      address: 'Москва, Тверская, 1',
      type: 'Бизнес-центр',
      totalArea: 1500,
      floorsCount: 3,
      status: status,
    );

ClientTicket demoTicket(
        {String id = 't1', String status = 'new', String created = '2026-10-07T10:00:00.000Z'}) =>
    ClientTicket(
      id: id,
      type: 'unscheduled',
      priority: 'normal',
      status: status,
      description: 'Протекает кран в санузле на 2 этаже',
      createdAt: created,
      updatedAt: created,
      completedAt: TicketStatuses.isDone(status) ? created : null,
    );
