import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
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
  });

  final ScheduleEvent event;
  final RouteDetail route;
  final FloorPlan? floor;
  final List<RoutePointState> points;

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
    return RouteDay(event: event, route: route, floor: floor, points: updated);
  }
}

/// Загрузка и локальный прогресс маршрута дня.
///
/// Сервер не хранит прогресс (в `design/screens/mobile/route_map.md` п. 10 это
/// зафиксировано как пробел API), поэтому статусы точек живут в состоянии этого
/// контроллера: чек-лист (М6.4) вызывает [markRoomDone], кнопка «Пропустить» —
/// [skipRoom].
class RouteDayController extends FamilyAsyncNotifier<RouteDay, String> {
  @override
  Future<RouteDay> build(String arg) async {
    final String eventId = arg;
    final Result<ScheduleEvent> eventResult =
        await ref.watch(scheduleRepositoryProvider).eventById(eventId);
    final Failure? eventFailure = eventResult.failureOrNull;
    if (eventFailure != null) throw eventFailure;

    final ScheduleEvent event = eventResult.dataOrNull!;
    if (!event.hasRoute) {
      // Смена без маршрута: экран покажет «Маршрут не назначен».
      return RouteDay(
        event: event,
        route: const RouteDetail(id: '', name: '', status: 'DRAFT', points: <RoutePointView>[]),
        points: const <RoutePointState>[],
      );
    }

    final Result<RouteDetail> routeResult =
        await ref.watch(coreRepositoryProvider).route(event.routeId!);
    final Failure? routeFailure = routeResult.failureOrNull;
    if (routeFailure != null) throw routeFailure;
    final RouteDetail route = routeResult.dataOrNull!;

    FloorPlan? floor;
    if (route.floorId != null) {
      final Result<FloorPlan> floorResult =
          await ref.watch(coreRepositoryProvider).floor(route.floorId!);
      floor = floorResult.dataOrNull;
    }

    return RouteDay(
      event: event,
      route: route,
      floor: floor,
      points: _initialPoints(route.points),
    );
  }

  /// Начальные статусы: первая точка — «В работе», остальные «Ожидает».
  List<RoutePointState> _initialPoints(List<RoutePointView> points) {
    return <RoutePointState>[
      for (int index = 0; index < points.length; index++)
        RoutePointState(
          point: points[index],
          status: index == 0 ? RoutePointStatus.active : RoutePointStatus.pending,
        ),
    ];
  }

  /// Помещение пройдено (вызывает чек-лист после «Завершить помещение»).
  void markRoomDone(String roomId) {
    final RouteDay? day = state.valueOrNull;
    if (day == null) return;
    state = AsyncData<RouteDay>(day.withPoints(_withStatus(day, roomId, RoutePointStatus.done)));
  }

  /// Точка пропущена с причиной; активной становится следующая ожидающая.
  void skipRoom(String roomId, String reason) {
    final RouteDay? day = state.valueOrNull;
    if (day == null) return;
    state = AsyncData<RouteDay>(
      day.withPoints(_withStatus(day, roomId, RoutePointStatus.skipped, reason: reason)),
    );
  }

  /// Сброс локального прогресса: снова первая точка активна.
  void reset() {
    final RouteDay? day = state.valueOrNull;
    if (day == null) return;
    state = AsyncData<RouteDay>(day.withPoints(_initialPoints(day.route.points)));
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
