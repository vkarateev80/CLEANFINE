import 'dart:io';

import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/shared/data/models/file_models.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/models/tech_card_models.dart';
import 'package:cleaning_ops_app/shared/data/repositories/files_repository.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:cleaning_ops_app/shared/services/photo_service.dart';

import 'auth_fakes.dart';
import 'operator_fakes.dart';

/// Подмены для чек-листа (М6.4): ни камеры, ни диска, ни сети.

/// Загрузка фото: запоминает, что ушло в file-service.
class FakeFilesRepository extends FilesRepository {
  FakeFilesRepository({
    this.uploadFailure,
    this.attachFailure,
    this.url = 'http://files.test/photo.jpg',
    this.fileId = 'file-1',
  }) : super(fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(200, <String, Object>{}))));

  final Failure? uploadFailure;

  /// Ошибка привязки фото к заявке (`POST /api/files/:id/attach`).
  final Failure? attachFailure;
  final String url;
  final String fileId;

  final List<Map<String, Object?>> uploads = <Map<String, Object?>>[];
  final List<Map<String, Object?>> attachments = <Map<String, Object?>>[];

  @override
  Future<Result<UploadedFile>> uploadPhoto({
    required String filePath,
    DateTime? takenAt,
    double? lat,
    double? lng,
    String? fileName,
    void Function(int sent, int total)? onProgress,
  }) async {
    uploads.add(<String, Object?>{
      'filePath': filePath,
      'takenAt': takenAt?.toUtc().toIso8601String(),
      'lat': lat,
      'lng': lng,
    });
    if (uploadFailure != null) return Err<UploadedFile>(uploadFailure!);
    return Ok<UploadedFile>(
      UploadedFile(
        id: fileId,
        url: url,
        thumbnailUrl: '$url.thumb.jpg',
        width: 1920,
        height: 1080,
        watermarked: true,
      ),
    );
  }

  @override
  Future<Result<String>> attachToTicket({required String fileId, required String ticketId}) async {
    attachments.add(<String, Object?>{'fileId': fileId, 'ticketId': ticketId});
    if (attachFailure != null) return Err<String>(attachFailure!);
    return const Ok<String>('attachment-1');
  }
}

/// Камера: отдаёт снимок нужного разрешения (или «оператор закрыл камеру»).
class FakePhotoCaptureService implements PhotoCaptureService {
  FakePhotoCaptureService({
    this.width = 1920,
    this.height = 1080,
    this.cancelled = false,
    this.failOnCapture = false,
  });

  final int width;
  final int height;
  final bool cancelled;
  final bool failOnCapture;

  int captureCalls = 0;
  final List<String> deleted = <String>[];

  @override
  Future<CapturedPhoto?> capture({required String operationId}) async {
    captureCalls += 1;
    if (failOnCapture) throw StateError('Камера недоступна');
    if (cancelled) return null;
    return CapturedPhoto(
      path: '${Directory.systemTemp.path}/$operationId.jpg',
      width: width,
      height: height,
      takenAt: DateTime(2026, 9, 16, 8, 30),
    );
  }

  @override
  Future<void> delete(String? path) async {
    if (path != null && path.isNotEmpty) deleted.add(path);
  }
}

/// Операция техкарты для тестов.
TechOperation techOperation({
  String id = 'op1',
  String name = 'Надеть СИЗ',
  int orderIndex = 0,
  int estimatedTimeMin = 2,
  bool requiresPhoto = false,
  bool requiresQr = false,
  String? description,
  Map<String, dynamic> equipment = const <String, dynamic>{},
  List<OperationMaterial> materials = const <OperationMaterial>[],
}) {
  return TechOperation(
    id: id,
    name: name,
    orderIndex: orderIndex,
    estimatedTimeMin: estimatedTimeMin,
    requiresPhoto: requiresPhoto,
    requiresQr: requiresQr,
    description: description,
    equipment: equipment,
    materials: materials,
  );
}

/// Техкарта из операций с корректным суммарным временем.
TechCardDetail techCardOf(List<TechOperation> operations, {String name = 'Влажная уборка санузла'}) {
  return TechCardDetail(
    id: 'tc1',
    name: name,
    operations: operations,
    totalEstimatedTimeMin: operations.fold<int>(
      0,
      (int sum, TechOperation op) => sum + op.estimatedTimeMin,
    ),
  );
}

/// Смена, открытая и с заявкой: чек-лист может отправлять отметки.
ScheduleEvent checkedInEvent({
  String id = 'ev1',
  String? ticketId = 'ticket-1',
  String? routeId = 'r1',
  String? objectId = 'object-1',
  String status = 'CHECKED_IN',
}) {
  return plannedEvent(
    id: id,
    status: status,
    ticketId: ticketId,
    routeId: routeId,
    objectId: objectId,
  );
}

/// Маршрут из двух помещений: `room-1` (санузел) и `room-2` (кухня).
RouteDetail routeWithTwoRooms() {
  return const RouteDetail(
    id: 'r1',
    name: 'Маршрут 3 этажа',
    status: 'ACTIVE',
    floorId: 'f1',
    points: <RoutePointView>[
      RoutePointView(id: 'p1', roomId: 'room-1', orderIndex: 0, roomName: 'Санузел'),
      RoutePointView(id: 'p2', roomId: 'room-2', orderIndex: 1, roomName: 'Кухня'),
    ],
  );
}

/// Помещение с техкартой. Тип «Санузел» → красный инвентарь (`ColorZone.forRoom`).
RoomDetail roomWithTechCard({
  String id = 'room-1',
  String? techCardId = 'tc1',
  String? floorType = 'Санузел',
  String? zone,
}) {
  return RoomDetail(
    id: id,
    name: 'Санузел 101',
    floorId: 'f1',
    techCardId: techCardId,
    floorType: floorType,
    zone: zone,
  );
}
