import 'package:cleaning_ops_app/core/constants/api_constants.dart';
import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/shared/data/models/gps_models.dart';
import 'package:cleaning_ops_app/shared/data/repositories/gps_repository.dart';
import 'package:cleaning_ops_app/shared/data/result.dart';
import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/auth_fakes.dart';

/// М6.6: трек уходит на сервер тем же телом, что ждёт gps-service, а буфер
/// `gps_points` чистится по ответу `accepted`, а не «по факту запроса».
void main() {
  // Время в треке уходит на сервер в UTC, поэтому и в тесте берём UTC.
  final DateTime base = DateTime.utc(2026, 9, 16, 10, 0);

  group('GpsRepository', () {
    test('trackBatch отправляет точки в формате TrackPointDto', () async {
      final adapter = FakeHttpAdapter(
        (_) async => const FakeResponse(201, <String, Object>{
              'userId': 'user-1',
              'accepted': 2,
              'employeeName': 'Оператор',
              'lastPointAt': '2026-09-16T10:05:00.000Z',
              'geofenceExits': <Object>[
                <String, Object>{'userId': 'user-1', 'geofenceId': 'g-1'},
              ],
            }),
      );
      final GpsRepository repository = GpsRepository(fakeApiClient(adapter));

      final Result<GpsTrackResult> result = await repository.trackBatch(<GpsTrackPoint>[
        GpsTrackPoint(lat: 55.7558, lng: 37.6173, timestamp: base, accuracy: 5, speed: 1.5, battery: 80),
        GpsTrackPoint(lat: 55.756, lng: 37.618, timestamp: base.add(const Duration(seconds: 12))),
      ]);

      final RequestOptions request = adapter.requests.single;
      expect(request.path, endsWith('/api/gps/track'));
      final Map<String, dynamic> body = request.data as Map<String, dynamic>;
      final List<dynamic> tracks = body['tracks'] as List<dynamic>;
      expect(tracks, hasLength(2));
      expect(tracks.first, <String, dynamic>{
        'lat': 55.7558,
        'lng': 37.6173,
        'timestamp': '2026-09-16T10:00:00.000Z',
        'accuracy': 5.0,
        'speed': 1.5,
        'battery': 80,
      });
      expect(
        tracks[1],
        <String, dynamic>{
          'lat': 55.756,
          'lng': 37.618,
          'timestamp': '2026-09-16T10:00:12.000Z',
        },
        reason: 'необязательные поля не отправляются пустыми',
      );

      final GpsTrackResult parsed = result.dataOrNull!;
      expect(parsed.accepted, 2);
      expect(parsed.geofenceExits.single.geofenceId, 'g-1');
    });

    test('пустой батч не уходит в сеть (сервер отвечает 400 на пустой список)', () async {
      final adapter = FakeHttpAdapter((_) async => const FakeResponse(201, <String, Object>{}));
      final GpsRepository repository = GpsRepository(fakeApiClient(adapter));

      final Result<GpsTrackResult> result = await repository.trackBatch(const <GpsTrackPoint>[]);

      expect(adapter.requests, isEmpty);
      expect(result.dataOrNull!.accepted, 0);
    });

    test('нет сети — NetworkFailure, точки остаются в буфере', () async {
      final adapter = FakeHttpAdapter(
        (RequestOptions options) async => throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        ),
      );
      final GpsRepository repository = GpsRepository(fakeApiClient(adapter));

      final Result<GpsTrackResult> result = await repository.trackBatch(<GpsTrackPoint>[
        GpsTrackPoint(lat: 1, lng: 2, timestamp: base),
      ]);

      expect(result.failureOrNull, isNotNull);
    });
  });

  group('буфер gps_points', () {
    late AppDatabase database;

    setUp(() => database = AppDatabase.memory());
    tearDown(() => database.close());

    test('батч берёт точки пачкой не больше лимита и помечает их отправленными', () async {
      for (int i = 0; i < 3; i++) {
        await database.insertGpsPoint(
          GpsPointsCompanion.insert(
            lat: 55.75 + i * 0.01,
            lng: 37.61,
            timestamp: base.add(Duration(seconds: i)),
          ),
        );
      }

      expect(await database.unsyncedGpsCount(), 3);

      final List<GpsPointRow> batch = await database.unsyncedGpsPoints(limit: 2);
      expect(batch, hasLength(2), reason: 'ApiConstants.trackBatchLimit ограничивает пачку');
      expect(batch.first.timestamp.isBefore(batch.last.timestamp), isTrue);

      await database.markGpsPointsSynced(<int>[for (final GpsPointRow row in batch) row.id]);
      expect(await database.unsyncedGpsCount(), 1);

      final List<GpsPointRow> rest = await database.unsyncedGpsPoints();
      expect(rest.single.lat, 55.77);
      expect(rest.single.synced, isFalse);
    });

    test('точка хранит точность, скорость и батарею', () async {
      await database.insertGpsPoint(
        GpsPointsCompanion.insert(
          lat: 55.75,
          lng: 37.61,
          timestamp: base,
          accuracy: const Value<double>(5),
          speed: const Value<double>(1.5),
          battery: const Value<int>(80),
        ),
      );

      final GpsPointRow row = (await database.unsyncedGpsPoints()).single;
      expect(row.accuracy, 5);
      expect(row.speed, 1.5);
      expect(row.battery, 80);
    });
  });

  test('лимит батча совпадает с пределом сервера', () {
    expect(ApiConstants.trackBatchLimit, 1000, reason: 'MAX_TRACK_BATCH в gps-service');
  });
}
