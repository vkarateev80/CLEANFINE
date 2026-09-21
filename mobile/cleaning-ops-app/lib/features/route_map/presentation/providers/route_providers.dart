import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../services/floor_plan_cache.dart';
import '../../../../shared/data/cache/cache_providers.dart';
import '../../../../shared/data/cache/cache_store.dart';
import '../../../../shared/data/data_providers.dart';
import '../../../../shared/data/models/operator_models.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../../../shared/data/result.dart';

/// Точка маршрута вместе с её локальным статусом.
class RoutePointState {
  const RoutePointState({required this.point, required this.status, this.skipReason});

  final RoutePointView point;
  final RoutePointStatus status;

  /// Причина пропуска: вводит оператор, уходит бригадиру (см. `route_map.md` §7).
  final String? skipReason;

  RoutePointState copyWith({RoutePointStatus? status, String? skipReason}) {
    return RoutePointState(
      point: point,
      status: status ?? this.status,
      skipReason: skipReason ?? this.skipReason,
    );
  }
}

/// Маршрут дня: смена, маршрут, план этажа и точки с прогрессом.
class RouteDay {
  const RouteDay({
    required this.event,
    required this.route,
    required this.points,
    this.floor,
    this.planFilePath,
    this.cachedAt,
    this.fromCache = false,
  });

  final ScheduleEvent event;
  final RouteDetail route;
  final FloorPlan? floor;
  final List<RoutePointState> points;

  /// План этажа из файлового кэша (`plans_dir/{floorId}.img`): показывается без сети.
  final String? planFilePath;

  /// Время записи кэша для баннера «Данные от {HH:mm}».
  final DateTime? cachedAt;

  /// Маршрут нарисован из кэша: сеть ещё не ответила.
  final bool fromCache;

  int get total => points.length;
  int get done => points.where((RoutePointState p) => p.status == RoutePointStatus.done).length;
  bool get isFinished => points.every((RoutePointState p) => p.status != RoutePointStatus.pending);

  /// Активная (текущая) точка — первая незавершённая и непропущенная.
  RoutePointState? get active {
    for (final RoutePointState point in points) {
      if (point.status == RoutePointStatus.active) return point;
    }
    return null;
  }

  /// Следующая точка для чек-листа — первая `pending` в порядке маршрута.
  RoutePointState? get nextPending {
    for (final RoutePointState point in points) {
      if (point.status == RoutePointStatus.pending) return point;
    }
    return null;
  }

  /// План пригоден для режима «План»: есть картинка, ширина и высота.
  bool get hasPlan => floor?.hasPlan == true && floor!.planWidth != null && floor!.planHeight != null;

  RouteDay withPoints(List<RoutePointState> updated) {
    return RouteDay(
      event: event,
      route: route,
      floor: floor,
      points: updated,
      planFilePath: planFilePath,
      cachedAt: cachedAt,
      fromCache: fromCache,
    );
  }
}

/// Загрузка и локальный прогресс маршрута дня.
///
/// Сервер не хранит прогресс (в `design/screens/mobile/route_map.md` п. 10 это
/// зафиксировано как пробел API), поэтому статусы точек живут в состоянии этого
/// контроллера и дублируются в `route_points`: чек-лист (М6.4) вызывает
/// [markRoomDone], кнопка «Пропустить» — [skipRoom].
///
/// Порядок загрузки — из `route_map.md` §8: смена и точки маршрута из drift,
/// затем сеть; план этажа — из файлового кэша, затем сеть.
class RouteDayController extends FamilyAsyncNotifier<RouteDay, String> {
  @override
  Future<RouteDay> build(String arg) async {
    final String eventId = arg;
    final CacheStore cache = ref.watch(cacheStoreProvider);

    final ScheduleEvent? cachedEvent = await cache.event(eventId);
    if (cachedEvent != null) {
      final RouteDay? cached = await _fromCache(cache, cachedEvent);
      if (cached != null) {
        unawaited(_refreshInBackground(eventId));
        return cached;
      }
    }
    return _loadFromNetwork(eventId);
  }

  /// Маршрут из кэша: `null`, если точек маршрута в кэше нет — тогда ждём сеть.
  Future<RouteDay?> _fromCache(CacheStore cache, ScheduleEvent event) async {
    if (!event.hasRoute) {
      // Смена без маршрута: экран покажет «Маршрут не назначен» и без сети.
      return RouteDay(
        event: event,
        route: const RouteDetail(id: '', name: '', status: 'DRAFT', points: <RoutePointView>[]),
        points: const <RoutePointState>[],
        cachedAt: await cache.eventsUpdatedAt(),
        fromCache: true,
      );
    }

    final RouteDetail? route = await cache.route(event.id);
    if (route == null) return null;

    final Map<String, RoutePointStatus> statuses = await cache.routePointStatuses(event.id);
    final FloorPlan? floor = await _cachedFloor(route.floorId);
    return RouteDay(
      event: event,
      route: route,
      floor: floor,
      points: _points(route.points, statuses),
      planFilePath: await _cachedPlanPath(route.floorId),
      cachedAt: await cache.eventsUpdatedAt(),
      fromCache: true,
    );
  }

  /// Сеть: смена, маршрут, план этажа; всё успешное пишется в кэш.
  Future<RouteDay> _loadFromNetwork(String eventId) async {
    final Result<ScheduleEvent> eventResult =
        await ref.read(scheduleRepositoryProvider).eventById(eventId);
    final Failure? eventFailure = eventResult.failureOrNull;
    if (eventFailure != null) throw eventFailure;

    final ScheduleEvent event = eventResult.dataOrNull!;
    final CacheStore cache = ref.read(cacheStoreProvider);
    await cache.saveEvents(<ScheduleEvent>[event]);

    if (!event.hasRoute) {
      // Смена без маршрута: экран покажет «Маршрут не назначен».
      return RouteDay(
        event: event,
        route: const RouteDetail(id: '', name: '', status: 'DRAFT', points: <RoutePointView>[]),
        points: const <RoutePointState>[],
      );
    }

    final Result<RouteDetail> routeResult =
        await ref.read(coreRepositoryProvider).route(event.routeId!);
    final Failure? routeFailure = routeResult.failureOrNull;
    if (routeFailure != null) throw routeFailure;
    final RouteDetail route = routeResult.dataOrNull!;
    await cache.saveRoute(eventId: event.id, route: route);

    FloorPlan? floor;
    if (route.floorId != null) {
      final Result<FloorPlan> floorResult =
          await ref.read(coreRepositoryProvider).floor(route.floorId!);
      floor = floorResult.dataOrNull;
      // Файл плана пишется в `plans_dir` **в фоне**: экран рисует план из сети
      // (`Image.network`) и не ждёт ни `path_provider`, ни скачивания картинки —
      // DS-002 `offline.md` §1 («сначала кэш, потом сеть») и §3.
      // Следующее открытие поднимет план уже из файлового кэша (`_fromCache`).
      if (floor != null) unawaited(_warmFloorPlan(floor));
    }

    return RouteDay(
      event: event,
      route: route,
      floor: floor,
      points: _points(route.points, const <String, RoutePointStatus>{}),
    );
  }

  /// Прогрев файлового кэша плана (`plans_dir/{floorId}.img`).
  ///
  /// Best-effort и в фоне: маршрут не должен ждать диск, чтобы показать точки.
  Future<void> _warmFloorPlan(FloorPlan floor) async {
    try {
      await ref.read(floorPlanCacheProvider).ensure(floor);
    } on Object {
      // Плана в файловом кэше не будет: без сети экран покажет список точек.
    }
  }

  /// Фоновое обновление: ошибка сети не стирает показанный кэш.
  Future<void> _refreshInBackground(String eventId) async {
    final RouteDay fresh;
    try {
      fresh = await _loadFromNetwork(eventId);
    } on Object {
      // Оставляем кэш и оффлайн-баннер.
      return;
    }
    try {
      state = AsyncData<RouteDay>(fresh);
    } on StateError {
      // Провайдер закрыт — обновлять нечего.
    }
  }

  /// План этажа из файлового кэша (`plans_dir`).
  ///
  /// Best-effort: сбой `path_provider` или диска не должен ронять маршрут —
  /// экран покажется списком точек, как и без плана (DS-002 §1, §7).
  Future<FloorPlan?> _cachedFloor(String? floorId) async {
    if (floorId == null) return null;
    try {
      final CachedFloorPlan? plan = await ref.read(floorPlanCacheProvider).read(floorId);
      return plan?.floor;
    } on Object {
      return null;
    }
  }

  /// Путь к файлу плана в `plans_dir` — тоже best-effort, см. [_cachedFloor].
  Future<String?> _cachedPlanPath(String? floorId) async {
    if (floorId == null) return null;
    try {
      return (await ref.read(floorPlanCacheProvider).cachedImage(floorId))?.path;
    } on Object {
      return null;
    }
  }

  /// Начальные статусы: из кэша, иначе первая точка — «В работе», остальные «Ожидает».
  List<RoutePointState> _points(
    List<RoutePointView> points,
    Map<String, RoutePointStatus> statuses,
  ) {
    final List<RoutePointState> result = <RoutePointState>[
      for (final RoutePointView point in points)
        RoutePointState(
          point: point,
          status: statuses[point.id] ?? RoutePointStatus.pending,
        ),
    ];
    if (result.any((RoutePointState point) => point.status == RoutePointStatus.active)) {
      return result;
    }
    return _activate(result);
  }

  /// Активной становится первая ожидающая точка (как в `_initialPoints`).
  List<RoutePointState> _activate(List<RoutePointState> points) {
    final int activeIndex = points.indexWhere(
      (RoutePointState point) => point.status == RoutePointStatus.pending,
    );
    if (activeIndex < 0) return points;
    final List<RoutePointState> updated = List<RoutePointState>.of(points);
    updated[activeIndex] = updated[activeIndex].copyWith(status: RoutePointStatus.active);
    return updated;
  }

  /// Помещение пройдено (вызывает чек-лист после «Завершить помещение»).
  void markRoomDone(String roomId) {
    final RouteDay? day = state.valueOrNull;
    if (day == null) return;
    final List<RoutePointState> updated = _withStatus(day, roomId, RoutePointStatus.done);
    state = AsyncData<RouteDay>(day.withPoints(updated));
    _persistStatus(updated, roomId, RoutePointStatus.done);
  }

  /// Точка пропущена с причиной; активной становится следующая ожидающая.
  void skipRoom(String roomId, String reason) {
    final RouteDay? day = state.valueOrNull;
    if (day == null) return;
    final List<RoutePointState> updated =
        _withStatus(day, roomId, RoutePointStatus.skipped, reason: reason);
    state = AsyncData<RouteDay>(day.withPoints(updated));
    _persistStatus(updated, roomId, RoutePointStatus.skipped, reason: reason);
  }

  /// Сброс локального прогресса: снова первая точка активна.
  void reset() {
    final RouteDay? day = state.valueOrNull;
    if (day == null) return;
    final List<RoutePointState> updated = _points(day.route.points, const <String, RoutePointStatus>{});
    state = AsyncData<RouteDay>(day.withPoints(updated));
    for (final RoutePointState point in updated) {
      _persist(point, point.status);
    }
  }

  /// Прогресс уходит в `route_points`: он переживает перезапуск и оффлайн
  /// (DS-002 `offline.md` §3, поле `status`).
  void _persistStatus(
    List<RoutePointState> points,
    String roomId,
    RoutePointStatus status, {
    String? reason,
  }) {
    for (final RoutePointState point in points) {
      if (point.point.roomId != roomId) continue;
      _persist(point, status, reason: reason);
      return;
    }
  }

  void _persist(RoutePointState point, RoutePointStatus status, {String? reason}) {
    unawaited(
      ref.read(cacheStoreProvider).saveRoutePointStatus(
            pointId: point.point.id,
            status: status,
            skippedReason: reason,
            completedAtLocal: status == RoutePointStatus.done ? DateTime.now() : null,
          ),
    );
  }

  List<RoutePointState> _withStatus(
    RouteDay day,
    String roomId,
    RoutePointStatus status, {
    String? reason,
  }) {
    final List<RoutePointState> updated = day.points
        .map(
          (RoutePointState point) => point.point.roomId == roomId
              ? point.copyWith(status: status, skipReason: reason)
              : point,
        )
        .toList();

    // Активной становится первая ожидающая точка — «В работе» в спецификации.
    final int activeIndex = updated.indexWhere(
      (RoutePointState point) => point.status == RoutePointStatus.pending,
    );
    for (int index = 0; index < updated.length; index++) {
      final RoutePointStatus current = updated[index].status;
      if (current == RoutePointStatus.done || current == RoutePointStatus.skipped) continue;
      updated[index] = updated[index].copyWith(
        status: index == activeIndex ? RoutePointStatus.active : RoutePointStatus.pending,
      );
    }
    return updated;
  }
}

final routeDayProvider = AsyncNotifierProvider.family<RouteDayController, RouteDay, String>(
  RouteDayController.new,
);
