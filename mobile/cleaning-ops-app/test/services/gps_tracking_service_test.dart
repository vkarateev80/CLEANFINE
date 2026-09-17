import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/shared/data/models/gps_models.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';

import '../helpers/gps_fakes.dart';
import '../helpers/operator_fakes.dart';

/// М6.6: трекер пишет точки в буфер и отправляет их батчами; вне смены — пауза,
/// без сети — копит, старше суток — не отправляет (DS-002 `offline.md` §5.5).
void main() {
  late AppDatabase database;
  DateTime now = DateTime.utc(2026, 9, 16, 10, 0);

  setUp(() {
    database = AppDatabase.memory();
    now = DateTime.utc(2026, 9, 16, 10, 0);
  });

  tearDown(() => database.close());

  GpsTrackingService service({
    FakeGpsRepository? repository,
    FakeLocationService? location,
    bool shiftOpen = true,
  }) {
    return GpsTrackingService(
      database: database,
      repository: repository ?? FakeGpsRepository(),
      location: location ?? FakeLocationService(),
      shiftOpen: () async => shiftOpen,
      now: () => now,
    );
  }

  test('точка пишется в буфер и сразу уходит на сервер', () async {
    final FakeGpsRepository repository = FakeGpsRepository();
    final GpsTrackingState state = await service(repository: repository).tick();

    expect(repository.batches, hasLength(1));
    final GpsTrackPoint point = repository.batches.single.single;
    expect(point.lat, 55.7558);
    expect(point.lng, 37.6173);
    expect(point.accuracy, 5);
    // drift хранит и отдаёт локальное время, поэтому сравниваем момент, а не флаг UTC.
    expect(point.timestamp.toUtc(), now);

    expect(state.sent, 1);
    expect(state.buffered, 0);
    expect(state.lastSentAt, now);
    expect(state.lastError, isNull);
    expect(await database.unsyncedGpsCount(), 0);
  });

  test('вне смены трекинг на паузе: точки не пишутся и не отправляются', () async {
    final FakeGpsRepository repository = FakeGpsRepository();
    final GpsTrackingState state = await service(repository: repository, shiftOpen: false).tick();

    expect(state.paused, isTrue);
    expect(state.isTracking, isFalse);
    expect(repository.batches, isEmpty);
    expect(await database.unsyncedGpsCount(), 0);
  });

  test('без сети точка остаётся в буфере и уходит следующей итерацией', () async {
    final FakeGpsRepository failing = FakeGpsRepository(failure: const NetworkFailure());
    final GpsTrackingState offline = await service(repository: failing).tick();

    expect(offline.buffered, 1);
    expect(offline.sent, 0);
    expect(offline.lastError, isNotNull);
    expect(await database.unsyncedGpsCount(), 1);

    // Сеть появилась: следующий тик дописывает вторую точку и отправляет обе.
    final FakeGpsRepository working = FakeGpsRepository();
    now = now.add(const Duration(seconds: 12));
    final GpsTrackingState online = await service(repository: working).tick();

    expect(working.batches.single, hasLength(2));
    expect(online.sent, 2);
    expect(online.buffered, 0);
    expect(online.lastError, isNull);
  });

  test('помечаются отправленными ровно принятые сервером точки', () async {
    final FakeGpsRepository repository = FakeGpsRepository(acceptedOverride: 1);
    await database.insertGpsPoint(
      GpsPointsCompanion.insert(lat: 1, lng: 1, timestamp: now),
    );

    final GpsTrackingState state = await service(repository: repository).tick();

    expect(state.sent, 1);
    expect(await database.unsyncedGpsCount(), 1, reason: 'вторая точка ещё не принята');
    expect(repository.batches, hasLength(1), reason: 'остаток уйдёт на следующей итерации');
  });

  test('точки старше суток удаляются, а не отправляются', () async {
    await database.insertGpsPoint(
      GpsPointsCompanion.insert(
        lat: 1,
        lng: 1,
        timestamp: now.subtract(const Duration(hours: 25)),
      ),
    );
    final FakeGpsRepository repository = FakeGpsRepository();

    await service(repository: repository).flush();

    expect(repository.batches, isEmpty);
    expect(await database.unsyncedGpsCount(), 0);
  });

  test('батч ограничен пределом сервера, остаток уходит следующим', () async {
    for (int i = 0; i < 3; i++) {
      await database.insertGpsPoint(
        GpsPointsCompanion.insert(lat: 55.75 + i * 0.001, lng: 37.61, timestamp: now),
      );
    }
    final FakeGpsRepository repository = FakeGpsRepository();

    final GpsTrackingState state = await service(repository: repository).flush();

    expect(state.sent, 3);
    expect(repository.batches, hasLength(1), reason: 'три точки влезают в один батч');
    expect(repository.batches.single, hasLength(3));
  });

  test('состояние отдаёт разрешение и интервал по скорости', () async {
    final GpsTrackingService idle = service(
      location: FakeLocationService(speed: 0, access: LocationAccess.grantedWhileInUse),
    );
    final GpsTrackingState still = await idle.state();
    expect(still.access, LocationAccess.grantedWhileInUse);
    expect(still.isTracking, isTrue);
    expect(still.interval, GpsTrackingConfig.staticInterval);

    // Точка в движении: интервал становится коротким.
    final GpsTrackingService moving = service(location: FakeLocationService(speed: 2));
    await moving.tick();
    final GpsTrackingState state = await moving.state();
    expect(state.interval, GpsTrackingConfig.movingInterval);
  });

  test('нет разрешения: точка не пишется, трекинг не активен', () async {
    final GpsTrackingState state = await service(
      location: FakeLocationService(errorMessage: 'Нет доступа', access: LocationAccess.denied),
    ).tick();

    expect(await database.unsyncedGpsCount(), 0);
    expect(state.lastError, 'Нет доступа');
    expect(state.isTracking, isFalse);
  });

  test('точка хранит батарею, если платформа её отдала', () async {
    await database.insertGpsPoint(
      GpsPointsCompanion.insert(
        lat: 55.75,
        lng: 37.61,
        timestamp: now,
        battery: const Value<int>(42),
      ),
    );
    final FakeGpsRepository repository = FakeGpsRepository();

    await service(repository: repository).flush();

    expect(repository.batches.single.single.battery, 42);
  });
}
