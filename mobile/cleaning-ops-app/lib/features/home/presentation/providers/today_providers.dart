import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../features/auth/presentation/providers/session_provider.dart';
import '../../../../shared/data/cache/cache_providers.dart';
import '../../../../shared/data/cache/cache_store.dart';
import '../../../../shared/data/data_providers.dart';
import '../../../../shared/data/models/operator_models.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../../../shared/data/repositories/schedule_repository.dart';
import '../../../../shared/data/result.dart';
import '../../../../shared/services/location_service.dart';

/// Всё, что нужно главному экрану: смены дня, текущая смена, её объект и маршрут,
/// заявки оператора.
class TodayOverview {
  const TodayOverview({
    required this.events,
    required this.tickets,
    this.current,
    this.object,
    this.route,
    this.cachedAt,
    this.fromCache = false,
  });

  /// Смены дня по возрастанию `plannedStart`.
  final List<ScheduleEvent> events;

  /// Заявки, назначенные на оператора (может быть пусто при ошибке загрузки).
  final List<TicketSummary> tickets;

  /// Смена, для которой показываем кнопки: открытая, иначе ближайшая.
  final ScheduleEvent? current;

  final ObjectSummary? object;
  final RouteDetail? route;

  /// Время записи кэша: экран показывает «Данные от {HH:mm}».
  final DateTime? cachedAt;

  /// Данные нарисованы из кэша: сеть ещё не ответила (DS-002 §1, §7).
  final bool fromCache;

  bool get hasShift => current != null;

  /// Активные заявки: закрытые показываем в конце одной строкой (см. спеку).
  List<TicketSummary> get activeTickets =>
      tickets.where((TicketSummary ticket) => !ticket.isClosed).toList(growable: false);
}

/// Загрузка данных главного экрана по правилу «сначала кэш, потом сеть».
///
/// Экран не показывает пустоту только потому, что запрос не прошёл: если данные
/// есть в drift, они рисуются немедленно с пометкой «Данные от {HH:mm}», а сеть
/// дозагружается в фоне и обновляет кэш (DS-002 `offline.md` §1).
///
/// Ошибка смен — это `AsyncError` с [Failure]; ошибка заявок не роняет экран:
/// заявки просто остаются пустыми, смены показываются (спека `home_today.md` §5).
class TodayOverviewController extends AsyncNotifier<TodayOverview> {
  @override
  Future<TodayOverview> build() async {
    final CacheStore cache = ref.watch(cacheStoreProvider);
    final TodayOverview? cached = await _fromCache(cache);
    if (cached != null) {
      unawaited(_refreshInBackground());
      return cached;
    }
    return _loadFromNetwork();
  }

  /// Кэш: `null`, если по нему нечего показывать (тогда экран ждёт сеть).
  Future<TodayOverview?> _fromCache(CacheStore cache) async {
    final List<ScheduleEvent> events = await cache.events();
    if (events.isEmpty) return null;

    final List<ScheduleEvent> sorted = <ScheduleEvent>[...events]
      ..sort((ScheduleEvent a, ScheduleEvent b) => a.plannedStart.compareTo(b.plannedStart));
    final ScheduleEvent? current = pickCurrentEvent(sorted);

    ObjectSummary? object;
    RouteDetail? route;
    if (current?.objectId != null) {
      object = await cache.object(current!.objectId!);
    }
    if (current != null && current.hasRoute) {
      route = await cache.route(current.id);
    }

    return TodayOverview(
      events: sorted,
      tickets: await cache.tickets(),
      current: current,
      object: object,
      route: route,
      cachedAt: await cache.eventsUpdatedAt(),
      fromCache: true,
    );
  }

  /// Сеть: ошибку отдаём наверх (экран покажет «Повторить»), успех пишем в кэш.
  Future<TodayOverview> _loadFromNetwork() async {
    final ScheduleRepository schedule = ref.read(scheduleRepositoryProvider);
    final Result<List<ScheduleEvent>> eventsResult = await schedule.myEvents();
    final Failure? failure = eventsResult.failureOrNull;
    if (failure != null) throw failure;

    final List<ScheduleEvent> events = <ScheduleEvent>[...?eventsResult.dataOrNull]
      ..sort((ScheduleEvent a, ScheduleEvent b) => a.plannedStart.compareTo(b.plannedStart));
    final ScheduleEvent? current = pickCurrentEvent(events);

    final CacheStore cache = ref.read(cacheStoreProvider);
    await cache.saveEvents(events);

    ObjectSummary? object;
    RouteDetail? route;
    final core = ref.read(coreRepositoryProvider);
    if (current?.objectId != null) {
      final Result<ObjectSummary> result = await core.object(current!.objectId!);
      object = result.dataOrNull;
      if (object != null) await cache.saveObject(object);
    }
    if (current != null && current.hasRoute) {
      final Result<RouteDetail> result = await core.route(current.routeId!);
      route = result.dataOrNull;
      if (route != null) await cache.saveRoute(eventId: current.id, route: route);
    }

    List<TicketSummary> tickets = const <TicketSummary>[];
    final String? userId = ref.read(sessionProvider).userId;
    if (userId != null) {
      final Result<List<TicketSummary>> result =
          await ref.read(ticketsRepositoryProvider).assignedTo(userId);
      tickets = result.dataOrNull ?? const <TicketSummary>[];
      await cache.saveTickets(tickets);
    }

    return TodayOverview(
      events: events,
      tickets: tickets,
      current: current,
      object: object,
      route: route,
    );
  }

  /// Фоновое обновление: ошибка сети не должна стирать показанный кэш.
  Future<void> _refreshInBackground() async {
    final TodayOverview fresh;
    try {
      fresh = await _loadFromNetwork();
    } on Object {
      // Кэш уже на экране: молча оставляем его и оффлайн-баннер.
      return;
    }
    try {
      state = AsyncData<TodayOverview>(fresh);
    } on StateError {
      // Провайдер закрыт — обновлять нечего.
    }
  }
}

final todayOverviewProvider =
    AsyncNotifierProvider<TodayOverviewController, TodayOverview>(TodayOverviewController.new);

/// Текущая смена: открытая имеет приоритет, иначе — ближайшая по времени начала.
ScheduleEvent? pickCurrentEvent(List<ScheduleEvent> events) {
  if (events.isEmpty) return null;
  for (final ScheduleEvent event in events) {
    if (event.isCheckedIn) return event;
  }
  return events.first;
}

/// Состояние действий смены (check-in/check-out): занятость и сообщение об ошибке.
class TodayActionState {
  const TodayActionState({this.isSubmitting = false, this.message});

  final bool isSubmitting;

  /// Текст ошибки, который показываем на карточке смены.
  final String? message;

  bool get hasMessage => message != null;
}

class TodayController extends Notifier<TodayActionState> {
  @override
  TodayActionState build() => const TodayActionState();

  /// Отметка прихода: геолокация → `POST /api/schedule/check-in`.
  ///
  /// Сервер ищет смену по `scheduleId` **графика** (`findTodayEvent`), а не по
  /// `id` смены: раньше сюда уходил `event.id`, и отметка отвечала 404.
  Future<bool> checkIn(ScheduleEvent event) async {
    state = const TodayActionState(isSubmitting: true);
    try {
      final GeoPoint point = await ref.read(locationServiceProvider).currentPosition();
      final Result<bool> result = await ref.read(scheduleRepositoryProvider).checkIn(
            scheduleId: event.scheduleId ?? event.id,
            lat: point.lat,
            lng: point.lng,
          );
      return await _finish(result, onSuccess: 'Смена открыта', event: event, status: 'CHECKED_IN');
    } on LocationUnavailable catch (error) {
      state = TodayActionState(message: error.message);
      return false;
    }
  }

  /// Закрытие смены: координаты необязательны, ошибка геолокации не мешает.
  Future<bool> checkOut(ScheduleEvent event) async {
    state = const TodayActionState(isSubmitting: true);
    double? lat;
    double? lng;
    try {
      final GeoPoint point = await ref.read(locationServiceProvider).currentPosition();
      lat = point.lat;
      lng = point.lng;
    } on LocationUnavailable {
      // Закрыть смену можно и без координат: сервер их не требует.
    }
    final Result<bool> result = await ref.read(scheduleRepositoryProvider).checkOut(
          scheduleId: event.scheduleId ?? event.id,
          lat: lat,
          lng: lng,
        );
    return _finish(result, onSuccess: 'Смена закрыта', event: event, status: 'CHECKED_OUT');
  }

  /// Итог отметки: успех пишется в кэш и перечитывается обзор.
  ///
  /// Кэш обновляется до инвалидации: экран рисует статус из кэша немедленно и не
  /// ждёт сети (DS-002 `offline.md` §1).
  Future<bool> _finish(
    Result<bool> result, {
    required String onSuccess,
    ScheduleEvent? event,
    String? status,
  }) async {
    final Failure? failure = result.failureOrNull;
    if (failure != null) {
      state = TodayActionState(message: failure.message);
      return false;
    }
    if (event != null && status != null) {
      await ref.read(cacheStoreProvider).saveEventStatus(event.id, status: status);
    }
    state = TodayActionState(message: onSuccess);
    // Данные смены изменились на сервере — перечитываем обзор.
    ref.invalidate(todayOverviewProvider);
    return true;
  }
}

final todayControllerProvider = NotifierProvider<TodayController, TodayActionState>(
  TodayController.new,
);
