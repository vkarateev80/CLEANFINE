import 'dart:io';

import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/shared/data/models/file_models.dart';
import 'package:cleaning_ops_app/shared/data/models/operation_completion.dart';
import 'package:cleaning_ops_app/shared/data/models/tech_card_models.dart';
import 'package:cleaning_ops_app/shared/data/repositories/files_repository.dart';
import 'package:cleaning_ops_app/shared/data/repositories/operator_repositories.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';

/// Временный файл теста удаляется без падения: на Windows он бывает занят
/// потоком multipart-загрузки ещё несколько миллисекунд после ответа.
void deleteTempPhoto(File file) {
  try {
    if (file.existsSync()) file.deleteSync();
  } on FileSystemException {
    // Файл во временном каталоге: система очистит его сама.
  }
}

/// М6.4: репозитории чек-листа читают реальные формы ответов и собирают
/// ровно те тела запросов, которые ждут core-, ticket- и file-service.
void main() {
  group('CoreRepository: помещение и техкарта', () {
    test('room разбирает помещение вместе с привязанной техкартой', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(200, <String, Object>{
              'id': 'room-1',
              'name': 'Санузел 101',
              'floorId': 'f-1',
              'techCardId': 'tc-1',
            }),
      );
      final repository = CoreRepository(fakeApiClient(adapter));

      final Result<RoomDetail> result = await repository.room('room-1');

      expect(adapter.requests.single.path, endsWith('/api/rooms/room-1'));
      final RoomDetail room = result.dataOrNull!;
      expect(room.name, 'Санузел 101');
      expect(room.floorId, 'f-1');
      expect(room.techCardId, 'tc-1');
    });

    test('room без техкарты отдаёт null в techCardId, а не ошибку', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(200, <String, Object>{'id': 'room-2', 'name': 'Кухня'}),
      );
      final repository = CoreRepository(fakeApiClient(adapter));

      final Result<RoomDetail> result = await repository.room('room-2');

      expect(result.dataOrNull!.techCardId, isNull);
    });

    test('techCard сортирует операции по orderIndex и разбирает оборудование', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(200, <String, Object>{
              'id': 'tc-1',
              'name': 'Влажная уборка санузла',
              'totalEstimatedTimeMin': 24,
              'operations': <Object>[
                <String, Object>{
                  'id': 'op-2',
                  'name': 'Нанести чистящее средство',
                  'orderIndex': 1,
                  'estimatedTimeMin': 5,
                  'requiresPhoto': true,
                  'equipment': <String, Object>{
                    'items': <Object>['швабра', 'ведро'],
                    'ppe': <Object>['перчатки'],
                  },
                  'materials': <Object>[
                    <String, Object>{'materialId': 'm-1', 'consumptionPerOperation': 0.05, 'unit': 'л'},
                  ],
                },
                <String, Object>{
                  'id': 'op-1',
                  'name': 'Надеть СИЗ',
                  'orderIndex': 0,
                  'estimatedTimeMin': 2,
                  'description': 'Перчатки и очки',
                },
              ],
            }),
      );
      final repository = CoreRepository(fakeApiClient(adapter));

      final Result<TechCardDetail> result = await repository.techCard('tc-1');

      final TechCardDetail card = result.dataOrNull!;
      expect(card.totalEstimatedTimeMin, 24);
      expect(card.operations.map((TechOperation op) => op.id), <String>['op-1', 'op-2']);

      final TechOperation second = card.operations[1];
      expect(second.requiresPhoto, isTrue);
      expect(second.norm, const Duration(minutes: 5));
      expect(second.equipmentLines, <String>['швабра', 'ведро', 'перчатки']);
      expect(second.materials.single.unit, 'л');
      expect(card.operations.first.equipmentLines, isEmpty);
    });

    test('битый ответ техкарты — ServerFailure, а не исключение', () async {
      final adapter = FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}));
      final repository = CoreRepository(fakeApiClient(adapter));

      final Result<TechCardDetail> result = await repository.techCard('tc-1');

      expect(result.failureOrNull, isA<ServerFailure>());
    });
  });

  group('TicketsRepository: завершение операции', () {
    test('completeOperation уходит на endpoint М3.6 с фото и totalOperations', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{
              'ticketId': 't-1',
              'operationId': 'op-1',
              'completedAt': '2026-09-16T08:30:00.000Z',
              'photoUrl': 'http://files.test/photo.jpg',
              'alreadyCompleted': false,
              'completedOperations': 1,
              'operationsTotal': 5,
              'allOperationsCompleted': false,
            }),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<CompleteOperationResult> result = await repository.completeOperation(
        ticketId: 't-1',
        operationId: 'op-1',
        completedAt: DateTime.utc(2026, 9, 16, 8, 30),
        photoUrl: 'http://files.test/photo.jpg',
        requiresPhoto: true,
        totalOperations: 5,
      );

      final RequestOptions request = adapter.requests.single;
      expect(request.path, endsWith('/api/tickets/t-1/operations/op-1/complete'));
      expect(request.data, <String, Object>{
        'completedAt': '2026-09-16T08:30:00.000Z',
        'photoUrl': 'http://files.test/photo.jpg',
        'requiresPhoto': true,
        'totalOperations': 5,
      });

      final CompleteOperationResult completion = result.dataOrNull!;
      expect(completion.alreadyCompleted, isFalse);
      expect(completion.operationsTotal, 5);
    });

    test('без фото requiresPhoto не отправляется: сервер отвечает 400 на такое тело', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{'operationId': 'op-1'}),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      await repository.completeOperation(
        ticketId: 't-1',
        operationId: 'op-1',
        requiresPhoto: true,
      );

      expect(adapter.requests.single.data, <String, Object>{});
    });

    test('повтор (alreadyCompleted) — успех, а не ошибка', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{
              'operationId': 'op-1',
              'alreadyCompleted': true,
            }),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<CompleteOperationResult> result = await repository.completeOperation(
        ticketId: 't-1',
        operationId: 'op-1',
      );

      expect(result.isSuccess, isTrue);
      expect(result.dataOrNull!.alreadyCompleted, isTrue);
    });

    test('400 от сервера превращается в ValidationFailure с текстом', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(400, <String, Object>{
              'message': 'Для операции требуется фото (photoUrl)',
            }),
      );
      final repository = TicketsRepository(fakeApiClient(adapter));

      final Result<CompleteOperationResult> result = await repository.completeOperation(
        ticketId: 't-1',
        operationId: 'op-1',
        requiresPhoto: true,
      );

      expect(result.failureOrNull, isA<ValidationFailure>());
      expect(result.failureOrNull?.message, 'Для операции требуется фото (photoUrl)');
    });
  });

  group('FilesRepository: загрузка фото', () {
    test('uploadPhoto отправляет multipart с kind=photo и разбирает ответ', () async {
      final File photo = File('${Directory.systemTemp.path}/checklist_upload_test.jpg')
        ..writeAsBytesSync(<int>[0xFF, 0xD8, 0xFF, 0xE0]);
      addTearDown(() => deleteTempPhoto(photo));

      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{
              'id': 'file-1',
              'url': 'http://files.test/photo.jpg',
              'thumbnailUrl': 'http://files.test/photo.thumb.jpg',
              'width': 1920,
              'height': 1080,
              'watermarked': true,
            }),
      );
      final repository = FilesRepository(fakeApiClient(adapter));

      final Result<UploadedFile> result = await repository.uploadPhoto(
        filePath: photo.path,
        takenAt: DateTime.utc(2026, 9, 16, 8, 30),
        lat: 55.75,
        lng: 37.61,
      );

      final RequestOptions request = adapter.requests.single;
      expect(request.path, endsWith('/api/files/upload'));
      expect(request.method, 'POST');
      expect(request.contentType, contains('multipart/form-data'));

      final FormData body = request.data as FormData;
      final Map<String, dynamic> fields = <String, dynamic>{
        for (final MapEntry<String, String> field in body.fields) field.key: field.value,
      };
      expect(fields['kind'], 'photo');
      expect(fields['takenAt'], '2026-09-16T08:30:00.000Z');
      expect(fields['lat'], '55.75');
      expect(fields['lng'], '37.61');
      expect(body.files.single.key, 'file');

      final UploadedFile file = result.dataOrNull!;
      expect(file.url, 'http://files.test/photo.jpg');
      expect(file.watermarked, isTrue, reason: 'водяной знак ставит сервер');
    });

    test('ответ без url — ServerFailure', () async {
      final File photo = File('${Directory.systemTemp.path}/checklist_upload_bad.jpg')
        ..writeAsBytesSync(<int>[1, 2, 3]);
      addTearDown(() => deleteTempPhoto(photo));

      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{'id': 'file-1'}),
      );
      final repository = FilesRepository(fakeApiClient(adapter));

      final Result<UploadedFile> result = await repository.uploadPhoto(filePath: photo.path);

      expect(result.failureOrNull, isA<ServerFailure>());
    });
  });
}
