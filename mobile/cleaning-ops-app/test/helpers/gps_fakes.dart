import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/shared/data/models/gps_models.dart';
import 'package:cleaning_ops_app/shared/data/repositories/gps_repository.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';

import 'auth_fakes.dart';
import 'operator_fakes.dart';

/// Заглушка трекера: отдаёт заданное состояние и не трогает базу и сеть.
///
/// Нужна там, где проверяется разметка, а не слежение: каркас приложения
/// запускает трекер, поэтому widget-тесты подменяют сервис, чтобы не упираться
/// в платформенные каналы (`path_provider`, `geolocator`).
class StubGpsTrackingService extends GpsTrackingService {
  StubGpsTrackingService(this.stub, AppDatabase database)
      : super(
          database: database,
          repository: FakeGpsRepository(),
          location: FakeLocationService(),
          shiftOpen: () async => true,
        );

  final GpsTrackingState stub;

  @override
  Future<GpsTrackingState> state({bool? paused}) async => stub;

  @override
  Future<GpsTrackingState> tick() async => stub;

  @override
  Future<GpsTrackingState> flush() async => stub;
}

/// Приём треков без сети: запоминает батчи и отвечает по сценарию.
class FakeGpsRepository extends GpsRepository {
  FakeGpsRepository({this.failure, this.acceptedOverride})
      : super(fakeApiClient(FakeHttpAdapter((_) async => const FakeResponse(201, <String, Object>{}))));

  /// Ошибка отправки: точка остаётся в буфере.
  final Failure? failure;

  /// Сколько точек «принял» сервер; по умолчанию — все отправленные.
  final int? acceptedOverride;

  final List<List<GpsTrackPoint>> batches = <List<GpsTrackPoint>>[];

  @override
  Future<Result<GpsTrackResult>> trackBatch(List<GpsTrackPoint> points) async {
    if (points.isEmpty) return const Ok<GpsTrackResult>(GpsTrackResult(accepted: 0));
    batches.add(points);
    if (failure != null) return Err<GpsTrackResult>(failure!);
    return Ok<GpsTrackResult>(
      GpsTrackResult(accepted: acceptedOverride ?? points.length, userId: 'user-1'),
    );
  }
}
