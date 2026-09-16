import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/failures.dart';
import '../../../../features/auth/presentation/providers/session_provider.dart';
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
  });

  /// Смены дня по возрастанию `plannedStart`.
  final List<ScheduleEvent> events;

  /// Заявки, назначенные на оператора (может быть пусто при ошибке загрузки).
  final List<TicketSummary> tickets;

  /// Смена, для которой показываем кнопки: открытая, иначе ближайшая.
  final ScheduleEvent? current;

  final ObjectSummary? object;
  final RouteDetail? route;

  bool get hasShift => current != null;

  /// Активные заявки: закрытые показываем в конце одной строкой (см. спеку).
  List<TicketSummary> get activeTickets =>
      tickets.where((TicketSummary ticket) => !ticket.isClosed).toList(growable: false);
}

/// Загрузка данных главного экрана.
///
/// Ошибка смен — это `AsyncError` с [Failure]; ошибка заявок не роняет экран:
/// заявки просто остаются пустыми, смены показываются (спека `home_today.md` §5).
final todayOverviewProvider = FutureProvider.autoDispose<TodayOverview>((ref) async {
  final ScheduleRepository schedule = ref.watch(scheduleRepositoryProvider);
  final Result<List<ScheduleEvent>> eventsResult = await schedule.myEvents();
  final Failure? failure = eventsResult.failureOrNull;
  if (failure != null) throw failure;

  final List<ScheduleEvent> events = <ScheduleEvent>[...?eventsResult.dataOrNull]
    ..sort((ScheduleEvent a, ScheduleEvent b) => a.plannedStart.compareTo(b.plannedStart));
  final ScheduleEvent? current = pickCurrentEvent(events);

  ObjectSummary? object;
  RouteDetail? route;
  final core = ref.watch(coreRepositoryProvider);
  if (current?.objectId != null) {
    final Result<ObjectSummary> result = await core.object(current!.objectId!);
    object = result.dataOrNull;
  }
  if (current != null && current.hasRoute) {
    final Result<RouteDetail> result = await core.route(current.routeId!);
    route = result.dataOrNull;
  }

  List<TicketSummary> tickets = const <TicketSummary>[];
  final String? userId = ref.watch(sessionProvider).userId;
  if (userId != null) {
    final Result<List<TicketSummary>> result =
        await ref.watch(ticketsRepositoryProvider).assignedTo(userId);
    tickets = result.dataOrNull ?? const <TicketSummary>[];
  }

  return TodayOverview(
    events: events,
    tickets: tickets,
    current: current,
    object: object,
    route: route,
  );
});

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
  Future<bool> checkIn(ScheduleEvent event) async {
    state = const TodayActionState(isSubmitting: true);
    try {
      final GeoPoint point = await ref.read(locationServiceProvider).currentPosition();
      final Result<bool> result = await ref
          .read(scheduleRepositoryProvider)
          .checkIn(scheduleId: event.id, lat: point.lat, lng: point.lng);
      return _finish(result, onSuccess: 'Смена открыта');
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
    final Result<bool> result = await ref
        .read(scheduleRepositoryProvider)
        .checkOut(scheduleId: event.id, lat: lat, lng: lng);
    return _finish(result, onSuccess: 'Смена закрыта');
  }

  bool _finish(Result<bool> result, {required String onSuccess}) {
    final Failure? failure = result.failureOrNull;
    if (failure != null) {
      state = TodayActionState(message: failure.message);
      return false;
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
