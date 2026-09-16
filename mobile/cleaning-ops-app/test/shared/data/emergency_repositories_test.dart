import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/shared/data/models/emergency_ticket.dart';
import 'package:cleaning_ops_app/shared/data/repositories/files_repository.dart';
import 'package:cleaning_ops_app/shared/data/repositories/operator_repositories.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';

/// М6.5: запросы SOS собираются ровно так, как их ждут ticket- и file-service.
void main() {
  group('TicketsRepository: аварийная заявка', () {
    test('createEmergency отправляет объект, описание, координаты и контекст', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{
              'id': 'ticket-1',
              'type': 'emergency',
              'priority': 'critical',
              'status': 'new',
              'objectId': 'object-1',
              'roomId': 'room-1',
              'description': '[Тип: Прорыв трубы / затопление] Вода на полу',
              'lat': 55.7558,
              'lng': 37.6173,
              'reactionDeadline': '2026-09-16T10:15:00.000Z',
              'nearbyOperators': <Object>[
                <String, Object>{'userId': 'u-1', 'distanceMeters': 120},
                <String, Object>{'userId': 'u-2', 'distanceMeters': 240},
              ],
            }),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<EmergencyTicket> result = await repository.createEmergency(
        objectId: 'object-1',
        description: '[Тип: Прорыв трубы / затопление] Вода на полу',
        lat: 55.7558,
        lng: 37.6173,
        roomId: 'room-1',
        objectName: 'Бизнес-центр',
        floor: 'Санузел 101, 3 этаж',
        radiusM: 500,
      );

      final RequestOptions request = adapter.requests.single;
      expect(request.path, endsWith('/api/tickets/emergency'));
      expect(request.data, <String, Object>{
        'objectId': 'object-1',
        'description': '[Тип: Прорыв трубы / затопление] Вода на полу',
        'lat': 55.7558,
        'lng': 37.6173,
        'roomId': 'room-1',
        'objectName': 'Бизнес-центр',
        'floor': 'Санузел 101, 3 этаж',
        'radiusM': 500,
      });

      final EmergencyTicket ticket = result.dataOrNull!;
      expect(ticket.priority, 'critical');
      expect(ticket.status, 'new');
      expect(ticket.notifiedCount, 2);
      expect(ticket.nearbyOperators.first.distanceMeters, 120);
      expect(ticket.reactionDeadline, isNotNull);
    });

    test('необязательные поля не отправляются, если не заданы', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{
              'id': 'ticket-2',
              'type': 'emergency',
              'priority': 'critical',
              'status': 'new',
              'description': '[Тип: Другое]',
              'nearbyOperators': <Object>[],
            }),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<EmergencyTicket> result = await repository.createEmergency(
        objectId: 'object-1',
        description: '[Тип: Другое]',
        lat: 1,
        lng: 2,
      );

      expect(adapter.requests.single.data, <String, Object>{
        'objectId': 'object-1',
        'description': '[Тип: Другое]',
        'lat': 1.0,
        'lng': 2.0,
      });
      expect(result.dataOrNull!.notifiedCount, 0, reason: 'gps-service мог не найти никого');
    });

    test('400 без объекта — ValidationFailure с текстом сервера', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(400, <String, Object>{'message': 'Укажите объект'}),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<EmergencyTicket> result = await repository.createEmergency(
        objectId: '',
        description: 'авария',
        lat: 1,
        lng: 2,
      );

      expect(result.failureOrNull, isA<ValidationFailure>());
      expect(result.failureOrNull?.message, 'Укажите объект');
    });

    test('нет сети — NetworkFailure (экран уводит заявку в очередь)', () async {
      final adapter = FakeHttpAdapter(
        (RequestOptions options) async => throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        ),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<EmergencyTicket> result = await repository.createEmergency(
        objectId: 'object-1',
        description: 'авария',
        lat: 1,
        lng: 2,
      );

      expect(result.failureOrNull, isA<NetworkFailure>());
    });
  });

  group('FilesRepository: привязка фото к заявке', () {
    test('attachToTicket отправляет entityType TICKET и возвращает id привязки', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{'id': 'attachment-1'}),
      );
      final repository = FilesRepository(fakeApiClient(adapter));

      final Result<String> result =
          await repository.attachToTicket(fileId: 'file-1', ticketId: 'ticket-1');

      expect(adapter.requests.single.path, endsWith('/api/files/file-1/attach'));
      expect(adapter.requests.single.data, <String, Object>{
        'entityType': 'TICKET',
        'entityId': 'ticket-1',
      });
      expect(result.dataOrNull, 'attachment-1');
    });

    test('ответ без id — ServerFailure', () async {
      final adapter = FakeHttpAdapter((_) async => const FakeResponse(201, <String, Object>{}));
      final repository = FilesRepository(fakeApiClient(adapter));

      final Result<String> result =
          await repository.attachToTicket(fileId: 'file-1', ticketId: 'ticket-1');

      expect(result.failureOrNull, isA<ServerFailure>());
    });
  });
}
