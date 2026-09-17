import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/services/queue_action_sender.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/checklist_fakes.dart';
import '../helpers/offline_fakes.dart';
import '../helpers/operator_fakes.dart';

/// М6.7: запись из очереди превращается в те же запросы, что и онлайн-действие.
void main() {
  late FakeFilesRepository files;
  late FakeTicketsRepository tickets;
  late FakePhotoCaptureService photos;
  late QueueActionSender sender;

  setUp(() {
    files = FakeFilesRepository();
    tickets = FakeTicketsRepository();
    photos = FakePhotoCaptureService();
    sender = QueueActionSender(files: files, tickets: tickets, photos: photos);
  });

  group('завершение операции', () {
    test('payload превращается в тело М3.6', () async {
      final QueueSendResult result = await sender.send(
        queued(
          id: 'q1',
          payload: <String, dynamic>{
            'ticketId': 'ticket-1',
            'operationId': 'op-1',
            'completedAt': '2026-09-16T08:30:00.000Z',
            'photoUrl': 'http://files.test/photo.jpg',
            'requiresPhoto': true,
            'totalOperations': 5,
          },
        ),
      );

      expect(result.isSuccess, isTrue);
      final Map<String, Object?> call = tickets.completeCalls.single;
      expect(call['ticketId'], 'ticket-1');
      expect(call['operationId'], 'op-1');
      expect(call['photoUrl'], 'http://files.test/photo.jpg');
      expect(call['requiresPhoto'], isTrue);
      expect(call['totalOperations'], 5);
      expect(call['completedAt'], '2026-09-16T08:30:00.000Z');
    });

    test('без ticketId или operationId — постоянная ошибка', () async {
      final QueueSendResult result = await sender.send(
        queued(id: 'q1', payload: <String, dynamic>{'operationId': 'op-1'}),
      );

      expect(result.isSuccess, isFalse);
      expect(result.permanent, isTrue);
      expect(result.error, contains('ticketId'));
      expect(tickets.completeCalls, isEmpty);
    });

    test('сеть — повторяемая ошибка, 400 — постоянная', () async {
      final QueueActionSender networkSender = QueueActionSender(
        files: FakeFilesRepository(),
        tickets: FakeTicketsRepository(completeFailure: const NetworkFailure()),
        photos: FakePhotoCaptureService(),
      );
      final QueueSendResult network = await networkSender.send(
        queued(id: 'q1', payload: <String, dynamic>{'ticketId': 't-1', 'operationId': 'op-1'}),
      );
      expect(network.permanent, isFalse);
      expect(network.error, isNotNull);

      final QueueActionSender validationSender = QueueActionSender(
        files: FakeFilesRepository(),
        tickets: FakeTicketsRepository(
          completeFailure: const ValidationFailure('Для операции требуется фото (photoUrl)'),
        ),
        photos: FakePhotoCaptureService(),
      );
      final QueueSendResult validation = await validationSender.send(
        queued(id: 'q2', payload: <String, dynamic>{'ticketId': 't-1', 'operationId': 'op-1'}),
      );
      expect(validation.permanent, isTrue);
      expect(validation.error, 'Для операции требуется фото (photoUrl)');
    });
  });

  group('аварийная заявка', () {
    Map<String, dynamic> sosPayload({String? photoPath}) => <String, dynamic>{
          'clientRequestId': 'client-1',
          'objectId': 'object-1',
          'roomId': 'room-1',
          'description': '[Тип: Прорыв трубы / затопление] Вода на полу',
          'lat': 55.7558,
          'lng': 37.6173,
          'objectName': 'Бизнес-центр',
          'floor': 'Санузел 101, 3 этаж',
          'radiusM': 500,
          if (photoPath != null) 'localPhotoPath': photoPath,
        };

    test('фото → заявка → привязка, локальный файл удаляется', () async {
      final QueueSendResult result = await sender.send(
        queued(
          id: 'q1',
          type: PendingActionTypes.sos,
          payload: sosPayload(photoPath: '/tmp/sos_client-1.jpg'),
        ),
      );

      expect(result.isSuccess, isTrue);
      expect(files.uploads.single['filePath'], '/tmp/sos_client-1.jpg');
      expect(files.attachments.single['fileId'], 'file-1');
      expect(files.attachments.single['ticketId'], 'ticket-sos');

      final Map<String, Object?> emergency = tickets.emergencyCalls.single;
      expect(emergency['objectId'], 'object-1');
      expect(emergency['description'], startsWith('[Тип: '));
      expect(emergency['roomId'], 'room-1');
      expect(emergency['floor'], 'Санузел 101, 3 этаж');
      expect(emergency['radiusM'], 500);

      expect(photos.deleted, contains('/tmp/sos_client-1.jpg'), reason: 'фото уже на сервере');
    });

    test('без обязательных полей — постоянная ошибка без запросов', () async {
      final QueueSendResult result = await sender.send(
        queued(
          id: 'q1',
          type: PendingActionTypes.sos,
          payload: <String, dynamic>{'objectId': 'object-1', 'description': 'авария'},
        ),
      );

      expect(result.permanent, isTrue);
      expect(tickets.emergencyCalls, isEmpty);
      expect(files.uploads, isEmpty);
    });

    test('фото отклонено file-service — постоянная ошибка с текстом сервера', () async {
      final QueueActionSender rejectingSender = QueueActionSender(
        files: FakeFilesRepository(
          uploadFailure: const ValidationFailure('Разрешение фото 640×480 меньше минимального'),
        ),
        tickets: FakeTicketsRepository(),
        photos: FakePhotoCaptureService(),
      );

      final QueueSendResult result = await rejectingSender.send(
        queued(
          id: 'q1',
          type: PendingActionTypes.sos,
          payload: sosPayload(photoPath: '/tmp/sos.jpg'),
        ),
      );

      expect(result.permanent, isTrue);
      expect(result.error, contains('Разрешение фото'));
      expect(tickets.emergencyCalls, isEmpty);
    });

    test('падает только привязка фото — заявка всё равно успешна', () async {
      final QueueActionSender attachingSender = QueueActionSender(
        files: FakeFilesRepository(attachFailure: const ForbiddenFailure('Нет прав')),
        tickets: FakeTicketsRepository(),
        photos: FakePhotoCaptureService(),
      );

      final QueueSendResult result = await attachingSender.send(
        queued(
          id: 'q1',
          type: PendingActionTypes.sos,
          payload: sosPayload(photoPath: '/tmp/sos.jpg'),
        ),
      );

      expect(result.isSuccess, isTrue, reason: 'заявка создана — повторять её нельзя');
    });

    test('отдельная запись привязки фото отправляет attach', () async {
      final QueueSendResult result = await sender.send(
        queued(
          id: 'q1',
          type: PendingActionTypes.sosAttachPhoto,
          payload: <String, dynamic>{'fileId': 'file-9', 'ticketId': 'ticket-9'},
        ),
      );

      expect(result.isSuccess, isTrue);
      expect(files.attachments.single['fileId'], 'file-9');
      expect(tickets.emergencyCalls, isEmpty);
    });
  });

  test('неизвестный тип действия не отправляется', () async {
    final QueueSendResult result = await sender.send(
      queued(id: 'q1', type: 'something_else', payload: <String, dynamic>{}),
    );

    expect(result.permanent, isTrue);
    expect(result.error, contains('something_else'));
  });
}
