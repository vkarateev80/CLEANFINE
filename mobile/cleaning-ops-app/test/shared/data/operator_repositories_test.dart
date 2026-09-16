import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/repositories/operator_repositories.dart';
import 'package:cleaning_ops_app/shared/data/repositories/schedule_repository.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';

/// М6.3: репозитории читают реальные формы ответов и не выпускают исключения.
void main() {
  group('ScheduleRepository', () {
    test('myEvents разбирает список смен', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(200, <Object>[
              <String, Object>{
                'id': 'e-1',
                'scheduleName': 'Утренняя смена',
                'date': '2026-09-16',
                'plannedStart': '2026-09-16T08:00:00.000Z',
                'status': 'PLANNED',
                'objectId': 'o-1',
                'routeId': 'r-1',
              },
            ]),
      );
      final repository = ScheduleRepository(fakeApiClient(adapter));

      final Result<List<ScheduleEvent>> result = await repository.myEvents();

      expect(result.isSuccess, isTrue);
      final ScheduleEvent event = result.dataOrNull!.single;
      expect(event.id, 'e-1');
      expect(event.isPlanned, isTrue);
      expect(event.hasRoute, isTrue);
    });

    test('checkIn отправляет scheduleId и координаты', () async {
      final adapter = FakeHttpAdapter((_) async => const FakeResponse(201, <String, Object>{}));
      final repository = ScheduleRepository(fakeApiClient(adapter));

      final Result<bool> result =
          await repository.checkIn(scheduleId: 'e-1', lat: 55.75, lng: 37.61);

      expect(result.isSuccess, isTrue);
      final RequestOptions request = adapter.requests.single;
      expect(request.path, endsWith('/schedule/check-in'));
      expect(request.data, <String, Object>{'scheduleId': 'e-1', 'lat': 55.75, 'lng': 37.61});
    });

    test('403 вне зоны превращается в ForbiddenFailure с текстом сервера', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(403, <String, Object>{
          'message': 'Вы находитесь вне зоны объекта',
        }),
      );
      final repository = ScheduleRepository(fakeApiClient(adapter));

      final Result<bool> result =
          await repository.checkIn(scheduleId: 'e-1', lat: 0, lng: 0);

      expect(result.failureOrNull, isA<ForbiddenFailure>());
      expect(result.failureOrNull?.message, 'Вы находитесь вне зоны объекта');
    });

    test('нет сети — NetworkFailure, а не исключение', () async {
      final adapter = FakeHttpAdapter(
        (RequestOptions options) async => throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        ),
      );
      final repository = ScheduleRepository(fakeApiClient(adapter));

      final Result<List<ScheduleEvent>> result = await repository.myEvents();

      expect(result.failureOrNull, isA<NetworkFailure>());
    });
  });

  group('CoreRepository', () {
    test('route разбирает точки маршрута и координаты помещений', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(200, <String, Object>{
              'id': 'r-1',
              'name': 'Маршрут 1 этажа',
              'status': 'ACTIVE',
              'floorId': 'f-1',
              'totalEstimatedTimeMin': 45,
              'points': <Object>[
                <String, Object>{
                  'id': 'p-1',
                  'roomId': 'room-1',
                  'orderIndex': 1,
                  'room': <String, Object>{
                    'name': 'Санузел',
                    'number': '101',
                    'coordsX': 120,
                    'coordsY': 340,
                    'coordsWidth': 40,
                    'coordsHeight': 30,
                  },
                },
              ],
            }),
      );
      final repository = CoreRepository(fakeApiClient(adapter));

      final Result<RouteDetail> result = await repository.route('r-1');

      final RouteDetail route = result.dataOrNull!;
      expect(route.name, 'Маршрут 1 этажа');
      expect(route.pointsCount, 1);
      expect(route.estimatedMinutes, 45);
      final RoutePointView point = route.points.single;
      expect(point.title, 'Санузел 101');
      expect(point.hasCoords, isTrue);
      expect(point.coordsX, 120);
    });
  });

  group('TicketsRepository', () {
    test('assignedTo разбирает {items,total} и фильтрует закрытые', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(200, <String, Object>{
              'total': 2,
              'items': <Object>[
                <String, Object>{'id': 't-1', 'status': 'assigned', 'type': 'planned', 'priority': 'high', 'description': 'Помыть полы'},
                <String, Object>{'id': 't-2', 'status': 'closed', 'type': 'planned', 'priority': 'low', 'description': 'Старая'},
              ],
            }),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<List<TicketSummary>> result = await repository.assignedTo('u-1');

      final List<TicketSummary> tickets = result.dataOrNull!;
      expect(tickets, hasLength(2));
      expect(tickets.first.priority, 'high');
      expect(tickets.where((TicketSummary ticket) => !ticket.isClosed), hasLength(1));
    });
  });
}
