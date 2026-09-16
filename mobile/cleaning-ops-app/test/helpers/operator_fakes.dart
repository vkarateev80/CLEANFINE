import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/shared/data/models/emergency_ticket.dart';
import 'package:cleaning_ops_app/shared/data/models/operation_completion.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/models/tech_card_models.dart';
import 'package:cleaning_ops_app/shared/data/repositories/operator_repositories.dart';
import 'package:cleaning_ops_app/shared/data/repositories/schedule_repository.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';

import 'auth_fakes.dart';

/// Подмены репозиториев и геолокации для widget-тестов экранов оператора.
/// Никакой сети и платформенных каналов: всё in-memory.

class FakeScheduleRepository extends ScheduleRepository {
  FakeScheduleRepository({
    List<ScheduleEvent> events = const <ScheduleEvent>[],
    this.eventsAfterCheckIn,
    this.checkInFailure,
    this.eventsFailure,
  })  : _events = events,
        super(fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))));

  List<ScheduleEvent> _events;

  /// Состояние смен после успешного check-in: сервер переводит смену в `CHECKED_IN`.
  final List<ScheduleEvent>? eventsAfterCheckIn;
  final Failure? checkInFailure;
  final Failure? eventsFailure;

  int checkInCalls = 0;
  int checkOutCalls = 0;

  @override
  Future<Result<List<ScheduleEvent>>> myEvents({String? date}) async {
    if (eventsFailure != null) return Err<List<ScheduleEvent>>(eventsFailure!);
    return Ok<List<ScheduleEvent>>(_events);
  }

  /// Деталь смены: маршрут дня грузит её первой (`route_map.md` §5).
  @override
  Future<Result<ScheduleEvent>> eventById(String id) async {
    if (eventsFailure != null) return Err<ScheduleEvent>(eventsFailure!);
    final ScheduleEvent? found = _events.where((ScheduleEvent event) => event.id == id).firstOrNull;
    if (found == null) return const Err<ScheduleEvent>(NotFoundFailure('Смена не найдена'));
    return Ok<ScheduleEvent>(found);
  }

  @override
  Future<Result<bool>> checkIn({
    required String scheduleId,
    required double lat,
    required double lng,
  }) async {
    checkInCalls += 1;
    if (checkInFailure != null) return Err<bool>(checkInFailure!);
    if (eventsAfterCheckIn != null) _events = eventsAfterCheckIn!;
    return const Ok<bool>(true);
  }

  @override
  Future<Result<bool>> checkOut({required String scheduleId, double? lat, double? lng}) async {
    checkOutCalls += 1;
    return const Ok<bool>(true);
  }
}

class FakeCoreRepository extends CoreRepository {
  FakeCoreRepository({
    this.routeDetail,
    this.objectSummary,
    this.floorPlan,
    this.roomDetail,
    this.techCardDetail,
  }) : super(fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))));

  final RouteDetail? routeDetail;
  final ObjectSummary? objectSummary;
  final FloorPlan? floorPlan;
  final RoomDetail? roomDetail;
  final TechCardDetail? techCardDetail;

  @override
  Future<Result<ObjectSummary>> object(String id) async => objectSummary == null
      ? const Err<ObjectSummary>(NotFoundFailure())
      : Ok<ObjectSummary>(objectSummary!);

  @override
  Future<Result<RouteDetail>> route(String id) async => routeDetail == null
      ? const Err<RouteDetail>(NotFoundFailure())
      : Ok<RouteDetail>(routeDetail!);

  @override
  Future<Result<FloorPlan>> floor(String id) async => floorPlan == null
      ? const Err<FloorPlan>(NotFoundFailure())
      : Ok<FloorPlan>(floorPlan!);

  @override
  Future<Result<RoomDetail>> room(String id) async => roomDetail == null
      ? const Err<RoomDetail>(NotFoundFailure('Помещение не найдено'))
      : Ok<RoomDetail>(roomDetail!);

  @override
  Future<Result<TechCardDetail>> techCard(String id) async => techCardDetail == null
      ? const Err<TechCardDetail>(NotFoundFailure('Техкарта не найдена'))
      : Ok<TechCardDetail>(techCardDetail!);
}

class FakeTicketsRepository extends TicketsRepository {
  FakeTicketsRepository({
    this.tickets = const <TicketSummary>[],
    this.completeFailure,
    this.emergencyFailure,
    this.nearbyOperators = const <NearbyOperator>[],
    this.emergencyId = 'ticket-sos',
  }) : super(fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))));

  final List<TicketSummary> tickets;

  /// Ошибка завершения операции: сеть (`NetworkFailure`) или серверная.
  final Failure? completeFailure;

  /// Ошибка создания аварийной заявки.
  final Failure? emergencyFailure;

  /// Кого «нашёл» gps-service для аварийной заявки.
  final List<NearbyOperator> nearbyOperators;
  final String emergencyId;

  /// Что именно ушло в `POST /api/tickets/:id/operations/:operationId/complete`.
  final List<Map<String, Object?>> completeCalls = <Map<String, Object?>>[];

  /// Что именно ушло в `POST /api/tickets/emergency`.
  final List<Map<String, Object?>> emergencyCalls = <Map<String, Object?>>[];

  @override
  Future<Result<List<TicketSummary>>> assignedTo(String userId, {int take = 20, int skip = 0}) async =>
      Ok<List<TicketSummary>>(tickets);

  @override
  Future<Result<CompleteOperationResult>> completeOperation({
    required String ticketId,
    required String operationId,
    DateTime? completedAt,
    String? photoUrl,
    bool requiresPhoto = false,
    int? totalOperations,
  }) async {
    completeCalls.add(<String, Object?>{
      'ticketId': ticketId,
      'operationId': operationId,
      'completedAt': completedAt?.toUtc().toIso8601String(),
      'photoUrl': photoUrl,
      'requiresPhoto': requiresPhoto,
      'totalOperations': totalOperations,
    });
    if (completeFailure != null) return Err<CompleteOperationResult>(completeFailure!);
    return Ok<CompleteOperationResult>(
      CompleteOperationResult(
        operationId: operationId,
        ticketId: ticketId,
        completedAt: completedAt?.toUtc().toIso8601String(),
        photoUrl: photoUrl,
      ),
    );
  }

  @override
  Future<Result<EmergencyTicket>> createEmergency({
    required String objectId,
    required String description,
    required double lat,
    required double lng,
    String? roomId,
    String? objectName,
    String? floor,
    int? radiusM,
  }) async {
    emergencyCalls.add(<String, Object?>{
      'objectId': objectId,
      'description': description,
      'lat': lat,
      'lng': lng,
      'roomId': roomId,
      'objectName': objectName,
      'floor': floor,
      'radiusM': radiusM,
    });
    if (emergencyFailure != null) return Err<EmergencyTicket>(emergencyFailure!);
    return Ok<EmergencyTicket>(
      EmergencyTicket(
        id: emergencyId,
        type: 'emergency',
        priority: 'critical',
        status: 'new',
        description: description,
        objectId: objectId,
        roomId: roomId,
        lat: lat,
        lng: lng,
        nearbyOperators: nearbyOperators,
      ),
    );
  }
}

class FakeLocationService implements LocationService {
  FakeLocationService({this.point = const GeoPoint(55.7558, 37.6173), this.errorMessage});

  final GeoPoint point;
  final String? errorMessage;

  @override
  Future<GeoPoint> currentPosition() async {
    if (errorMessage != null) throw LocationUnavailable(errorMessage!);
    return point;
  }
}

/// Смена в состоянии `PLANNED` с маршрутом — базовая фикстура тестов.
ScheduleEvent plannedEvent({
  String id = 'event-1',
  String? routeId = 'route-1',
  String? objectId = 'object-1',
  String status = 'PLANNED',
  String? ticketId,
}) {
  return ScheduleEvent(
    id: id,
    scheduleName: 'Утренняя смена',
    date: '2026-09-16',
    plannedStart: '2026-09-16T08:00:00.000Z',
    status: status,
    objectId: objectId,
    routeId: routeId,
    ticketId: ticketId,
  );
}
