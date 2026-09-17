import 'dart:async';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants/api_constants.dart';
import '../database/app_database.dart';
import '../database/database_provider.dart';
import '../shared/data/data_providers.dart';
import '../shared/data/models/gps_models.dart';
import '../shared/data/models/schedule_event.dart';
import '../shared/data/repositories/gps_repository.dart';
import '../shared/data/result.dart';
import '../shared/services/location_service.dart';

/// Интервалы и пределы трекинга (DS-002 `offline.md` §5.5).
class GpsTrackingConfig {
  const GpsTrackingConfig._();

  /// В движении точка отправляется чаще, статично — реже: экономия батареи.
  static const Duration movingInterval = Duration(seconds: 12);
  static const Duration staticInterval = Duration(seconds: 60);

  /// Порог «в движении», м/с.
  static const double movingSpeedMps = 0.5;

  /// Точки старше этого срока не отправляются — их съедает время (DS-002 §5.5).
  static const Duration pointMaxAge = Duration(hours: 24);
}

/// Состояние трекинга — его показывает профиль (DS-002 `profile.md` §3.3).
class GpsTrackingState {
  const GpsTrackingState({
    this.access,
    this.paused = false,
    this.sent = 0,
    this.buffered = 0,
    this.lastSentAt,
    this.lastError,
    this.lastSpeed,
  });

  /// Разрешение на геолокацию: `null` — ещё не спрашивали.
  final LocationAccess? access;

  /// Смена не открыта: трекинг на паузе, это норма, а не ошибка.
  final bool paused;

  /// Сколько точек ушло на сервер за сессию.
  final int sent;

  /// Сколько точек лежит в буфере `gps_points`.
  final int buffered;

  final DateTime? lastSentAt;
  final String? lastError;

  /// Последняя известная скорость: по ней выбирается интервал следующей точки.
  final double? lastSpeed;

  /// Есть разрешение и смена открыта.
  bool get isTracking => (access?.isGranted ?? false) && !paused;

  /// Интервал до следующей точки.
  Duration get interval => (lastSpeed ?? 0) >= GpsTrackingConfig.movingSpeedMps
      ? GpsTrackingConfig.movingInterval
      : GpsTrackingConfig.staticInterval;

  factory GpsTrackingState.fromRows({
    required LocationAccess? access,
    required bool paused,
    required int sent,
    required List<GpsPointRow> rows,
    DateTime? lastSentAt,
    String? lastError,
    double? lastSpeed,
  }) {
    return GpsTrackingState(
      access: access,
      paused: paused,
      sent: sent,
      buffered: rows.length,
      lastSentAt: lastSentAt,
      lastError: lastError,
      lastSpeed: lastSpeed ?? rows.lastOrNull?.speed,
    );
  }
}

/// Трекинг местоположения оператора (М6.6).
///
/// Каждая точка сначала пишется в локальный буфер `gps_points` (единый путь и
/// онлайн, и оффлайн), затем буфер отправляется батчами до
/// [ApiConstants.trackBatchLimit] точек в `POST /api/gps/track`. Вне смены
/// (`CHECKED_IN`) трекинг на паузе — это требование ПЛАН М6.6.
class GpsTrackingService {
  GpsTrackingService({
    required AppDatabase database,
    required GpsRepository repository,
    required LocationService location,
    required Future<bool> Function() shiftOpen,
    DateTime Function()? now,
  })  : _database = database,
        _repository = repository,
        _location = location,
        _shiftOpen = shiftOpen,
        _now = now ?? DateTime.now;

  final AppDatabase _database;
  final GpsRepository _repository;
  final LocationService _location;
  final Future<bool> Function() _shiftOpen;
  final DateTime Function() _now;

  int _sent = 0;
  DateTime? _lastSentAt;
  String? _lastError;

  /// Последняя известная скорость: по ней выбирается интервал следующей точки.
  double? _lastSpeed;

  /// Одна итерация трекера: пауза вне смены, иначе точка в буфер и отправка.
  Future<GpsTrackingState> tick() async {
    // Смену не удалось определить (нет сети и кэша): продолжаем копить точки —
    // потерять трек хуже, чем записать лишние точки вне смены.
    bool open = true;
    try {
      open = await _shiftOpen();
    } on Object {
      open = true;
    }

    if (!open) {
      return _state(paused: true);
    }

    try {
      final LocationSample sample = await _location.currentSample();
      _lastSpeed = sample.speed;
      await _database.insertGpsPoint(
        GpsPointsCompanion.insert(
          lat: sample.point.lat,
          lng: sample.point.lng,
          timestamp: _now(),
          accuracy: Value<double?>(sample.accuracy),
          speed: Value<double?>(sample.speed),
        ),
      );
    } on LocationUnavailable catch (error) {
      // Разрешения нет — точка не пишется, но уже накопленное уходит на сервер.
      _lastError = error.message;
    }

    return flush();
  }

  /// Отправить буфер пачками. Без сети точки остаются и уходят позже.
  Future<GpsTrackingState> flush() async {
    final DateTime now = _now();
    final DateTime fresh = now.subtract(GpsTrackingConfig.pointMaxAge);

    while (true) {
      final List<GpsPointRow> rows = await _database.unsyncedGpsPoints(
        limit: ApiConstants.trackBatchLimit,
      );
      if (rows.isEmpty) break;

      // Старые точки не отправляем: трек за сутки уже не нужен (DS-002 §5.5).
      final List<int> stale = <int>[
        for (final GpsPointRow row in rows)
          if (row.timestamp.isBefore(fresh)) row.id,
      ];
      if (stale.length == rows.length) {
        await _database.deleteGpsPoints(stale);
        continue;
      }

      final List<GpsPointRow> batch = <GpsPointRow>[
        for (final GpsPointRow row in rows)
          if (!stale.contains(row.id)) row,
      ];
      final Result<GpsTrackResult> result = await _repository.trackBatch(
        batch
            .map(
              (GpsPointRow row) => GpsTrackPoint(
                lat: row.lat,
                lng: row.lng,
                timestamp: row.timestamp,
                accuracy: row.accuracy,
                speed: row.speed,
                battery: row.battery,
              ),
            )
            .toList(),
      );

      final failure = result.failureOrNull;
      if (failure != null) {
        _lastError = failure.message;
        break;
      }

      // Помечаем отправленными ровно те точки, которые сервер принял.
      final int accepted = result.dataOrNull!.accepted;
      if (accepted <= 0) break;
      final List<int> acceptedIds = batch.take(accepted).map((GpsPointRow row) => row.id).toList();
      await _database.markGpsPointsSynced(acceptedIds);
      _sent += accepted;
      _lastSentAt = now;
      _lastError = null;

      if (stale.isNotEmpty) await _database.deleteGpsPoints(stale);
      if (accepted < batch.length) break;
    }

    return _state(paused: false);
  }

  /// Текущее состояние для профиля.
  Future<GpsTrackingState> state({bool? paused}) async {
    final LocationAccess access = await _location.accessStatus();
    return _state(paused: paused ?? false, access: access);
  }

  Future<GpsTrackingState> _state({required bool paused, LocationAccess? access}) async {
    final List<GpsPointRow> rows = await _database.unsyncedGpsPoints();
    return GpsTrackingState.fromRows(
      access: access,
      paused: paused,
      sent: _sent,
      rows: rows,
      lastSentAt: _lastSentAt,
      lastError: _lastError,
      lastSpeed: _lastSpeed,
    );
  }
}

final gpsTrackingServiceProvider = Provider<GpsTrackingService>((Ref ref) {
  return GpsTrackingService(
    database: ref.watch(appDatabaseProvider),
    repository: ref.watch(gpsRepositoryProvider),
    location: ref.watch(locationServiceProvider),
    shiftOpen: () async {
      final Result<List<ScheduleEvent>> result =
          await ref.read(scheduleRepositoryProvider).myEvents();
      final List<ScheduleEvent>? events = result.dataOrNull;
      // Смену не удалось узнать (нет сети и кэша): точки не теряем, трекинг идёт.
      if (events == null) return true;
      return events.any((ScheduleEvent event) => event.isCheckedIn);
    },
  );
});

/// Периодический трекинг: сам планирует следующую точку с адаптивным интервалом
/// (в движении 12 с, статично 60 с), состояние отдаёт профилю.
class GpsTrackerController extends Notifier<GpsTrackingState> {
  Timer? _timer;
  bool _running = false;

  @override
  GpsTrackingState build() {
    ref.onDispose(stop);
    return const GpsTrackingState();
  }

  /// Запуск трекинга: вызывается каркасом приложения после входа.
  void start() {
    if (_running) return;
    _running = true;
    _schedule(Duration.zero);
  }

  void stop() {
    _running = false;
    _timer?.cancel();
    _timer = null;
  }

  /// Один проход вне расписания (тесты, ручная проверка).
  Future<void> tick() async {
    final GpsTrackingState next = await ref.read(gpsTrackingServiceProvider).tick();
    if (_running || state.access == null) state = next;
  }

  /// Обновить состояние для профиля (разрешение, буфер, последняя отправка).
  Future<void> refresh() async {
    state = await ref.read(gpsTrackingServiceProvider).state();
  }

  void _schedule(Duration delay) {
    _timer?.cancel();
    if (!_running) return;
    _timer = Timer(delay, () async {
      if (!_running) return;
      try {
        final GpsTrackingState next = await ref.read(gpsTrackingServiceProvider).tick();
        if (!_running) return;
        state = next;
        _schedule(next.interval);
      } on Object {
        // Сбой итерации трекинг не останавливает: пробуем с обычным интервалом.
        _schedule(GpsTrackingConfig.staticInterval);
      }
    });
  }
}

final gpsTrackerProvider = NotifierProvider<GpsTrackerController, GpsTrackingState>(
  GpsTrackerController.new,
);
