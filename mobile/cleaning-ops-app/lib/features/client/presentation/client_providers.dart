import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/failures.dart';
import '../../../core/utils/clock.dart';
import '../../../services/service_providers.dart';
import '../../../shared/data/models/schedule_event.dart';
import '../../../shared/data/result.dart';
import '../../auth/presentation/providers/session_provider.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';

/// Провайдеры портала заказчика — зеркало `frontend/web-client/src/api/queries.ts`.
///
/// Каждый блок главной — свой провайдер с собственной ошибкой и «Повторить»:
/// частичный сбой (например, недоступен schedule-service) не гасит экран целиком.

final clientRepositoryProvider = Provider<ClientRepository>((Ref ref) {
  return ClientRepository(
    core: ref.watch(coreApiProvider),
    tickets: ref.watch(ticketsApiProvider),
    schedule: ref.watch(scheduleApiProvider),
  );
});

/// `Result` → значение или брошенный `Failure` (AsyncValue покажет его сообщение).
T unwrap<T>(Result<T> result) {
  return switch (result) {
    Ok<T>(data: final T data) => data,
    Err<T>(failure: final Failure failure) => throw failure,
  };
}

/// Объект заказчика по `ownerClientId` = id сессии; `null` — не привязан.
final myObjectProvider = FutureProvider<ClientObject?>((Ref ref) async {
  final String? userId = ref.watch(sessionScopeProvider);
  if (userId == null || userId.isEmpty) return null;
  return unwrap(await ref.watch(clientRepositoryProvider).myObject(userId));
});

final objectDetailProvider =
    FutureProvider.family<ClientObjectDetail, String>((Ref ref, String objectId) async {
  return unwrap(await ref.watch(clientRepositoryProvider).objectDetail(objectId));
});

/// Смены объекта на сегодня: день считает сервер в часовом поясе организации.
final objectEventsProvider =
    FutureProvider.family<List<ScheduleEvent>, String>((Ref ref, String objectId) async {
  return unwrap(await ref.watch(clientRepositoryProvider).events(objectId));
});

/// Последние 5 заявок («свежие сверху» — серверной сортировки нет).
final recentTicketsProvider =
    FutureProvider.family<List<ClientTicket>, String>((Ref ref, String objectId) async {
  final ClientTicketPage page = unwrap(await ref.watch(clientRepositoryProvider).tickets(objectId, take: 5));
  return sortTicketsByDate(page.items);
});

final openTicketsCountProvider = FutureProvider.family<int, String>((Ref ref, String objectId) async {
  return unwrap(await ref.watch(clientRepositoryProvider).countByStatuses(objectId, TicketStatuses.open));
});

/// «Выполнено за 30 дней»: фильтра по датам в API нет — берём страницу (100)
/// и считаем по `completedAt` на клиенте, как портал.
final doneLast30Provider = FutureProvider.family<DoneStats, String>((Ref ref, String objectId) async {
  final ClientTicketPage page =
      unwrap(await ref.watch(clientRepositoryProvider).tickets(objectId, take: 100));
  final DateTime since = ref.watch(nowProvider)().toUtc().subtract(const Duration(days: 30));
  final String sinceIso = since.toIso8601String();
  final int count = page.items
      .where((ClientTicket t) => TicketStatuses.isDone(t.status) && t.doneAt.compareTo(sinceIso) >= 0)
      .length;
  return DoneStats(count: count, truncated: page.total > page.items.length && page.items.length >= 100);
});

class DoneStats {
  const DoneStats({required this.count, required this.truncated});

  final int count;

  /// Страница упёрлась в предел `take=100` — цифра может быть занижена.
  final bool truncated;
}

/// Фильтр списка заявок (`?status=open|done` в портале).
enum TicketFilter {
  all,
  open,
  done;

  List<String>? get statuses => switch (this) {
        TicketFilter.all => null,
        TicketFilter.open => TicketStatuses.open,
        TicketFilter.done => TicketStatuses.done,
      };
}

class TicketsFeedKey {
  const TicketsFeedKey(this.objectId, this.filter);

  final String objectId;
  final TicketFilter filter;

  @override
  bool operator ==(Object other) =>
      other is TicketsFeedKey && other.objectId == objectId && other.filter == filter;

  @override
  int get hashCode => Object.hash(objectId, filter);
}

/// Лента заявок по фильтру. Контракт принимает один `status`, поэтому для
/// «открытых»/«выполненных» — по запросу на статус, слияние и сортировка.
final ticketsFeedProvider =
    FutureProvider.family<ClientTicketPage, TicketsFeedKey>((Ref ref, TicketsFeedKey key) async {
  final ClientRepository repo = ref.watch(clientRepositoryProvider);
  final List<String>? statuses = key.filter.statuses;
  if (statuses == null) {
    final ClientTicketPage page = unwrap(await repo.tickets(key.objectId, take: 100));
    return ClientTicketPage(items: sortTicketsByDate(page.items), total: page.total);
  }
  final List<ClientTicketPage> pages = await Future.wait(
    statuses
        .map((String status) async => unwrap(await repo.tickets(key.objectId, status: status, take: 100))),
  );
  final List<ClientTicket> items = sortTicketsByDate(pages.expand((ClientTicketPage p) => p.items).toList());
  return ClientTicketPage(items: items, total: pages.fold(0, (int sum, ClientTicketPage p) => sum + p.total));
});

final ticketDetailProvider = FutureProvider.family<ClientTicketDetail, String>((Ref ref, String id) async {
  return unwrap(await ref.watch(clientRepositoryProvider).ticket(id));
});

List<ClientTicket> sortTicketsByDate(List<ClientTicket> items) {
  final List<ClientTicket> copy = List<ClientTicket>.of(items);
  copy.sort((ClientTicket a, ClientTicket b) => b.createdAt.compareTo(a.createdAt));
  return copy;
}

/// Ближайшие смены: только будущие PLANNED/CHECKED_IN, по `plannedStart`.
List<ScheduleEvent> upcomingShifts(List<ScheduleEvent> events, DateTime now) {
  final String nowIso = now.toUtc().toIso8601String();
  final List<ScheduleEvent> list = events
      .where((ScheduleEvent e) => e.status == 'PLANNED' || e.status == 'CHECKED_IN')
      .where((ScheduleEvent e) => e.plannedStart.compareTo(nowIso) >= 0)
      .toList();
  list.sort((ScheduleEvent a, ScheduleEvent b) => a.plannedStart.compareTo(b.plannedStart));
  return list;
}

/// Последняя завершённая смена (по `checkOutAt`).
ScheduleEvent? lastCompletedShift(List<ScheduleEvent> events) {
  final List<ScheduleEvent> done = events
      .where((ScheduleEvent e) => e.status == 'CHECKED_OUT' && (e.checkOutAt ?? '').isNotEmpty)
      .toList();
  if (done.isEmpty) return null;
  done.sort((ScheduleEvent a, ScheduleEvent b) => (b.checkOutAt ?? '').compareTo(a.checkOutAt ?? ''));
  return done.first;
}

/// Короткая дата-время: «8 окт., 14:30» (локаль `ru`, местное время).
class ClientFormat {
  const ClientFormat._();

  static final DateFormat _short = DateFormat('d MMM, HH:mm', 'ru');
  static final DateFormat _date = DateFormat('d MMMM yyyy', 'ru');

  static String dateTimeShort(String? iso) {
    final DateTime? parsed = DateTime.tryParse(iso ?? '')?.toLocal();
    return parsed == null ? '—' : _short.format(parsed);
  }

  static String date(String? iso) {
    final DateTime? parsed = DateTime.tryParse(iso ?? '')?.toLocal();
    return parsed == null ? '—' : _date.format(parsed);
  }

  static String area(double value) =>
      value == value.roundToDouble() ? value.toInt().toString() : value.toStringAsFixed(1);
}
