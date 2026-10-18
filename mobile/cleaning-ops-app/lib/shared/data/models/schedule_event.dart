import '../../../core/i18n/app_language.dart';

/// Модели ответов schedule-service (`ScheduleEventView`).
class ScheduleEvent {
  const ScheduleEvent({
    required this.id,
    required this.scheduleName,
    required this.date,
    required this.plannedStart,
    required this.status,
    this.scheduleId,
    this.objectId,
    this.routeId,
    this.plannedEnd,
    this.checkInAt,
    this.checkOutAt,
    this.ticketId,
    this.checkOutReason,
  });

  final String id;

  /// `scheduleId` графика, по которому создана смена: его ждёт
  /// `POST /api/schedule/check-in` (`findTodayEvent` ищет смену по `scheduleId`).
  final String? scheduleId;

  final String scheduleName;
  final String date;
  final String plannedStart;

  /// Плановый конец смены (plannedStart + durationMin). UI: «окончание» — план,
  /// `checkOutAt` — факт закрытия.
  final String? plannedEnd;
  final String status;
  final String? objectId;
  final String? routeId;
  final String? checkInAt;
  final String? checkOutAt;
  final String? ticketId;

  /// Причина авто check-out; непустая — показываем строкой-предупреждением.
  final String? checkOutReason;

  bool get isPlanned => status == 'PLANNED';
  bool get isCheckedIn => status == 'CHECKED_IN';
  bool get isCheckedOut => status == 'CHECKED_OUT';
  bool get isMissed => status == 'MISSED';

  /// Маршрут назначен: без него кнопка маршрута показывает snackbar.
  bool get hasRoute => routeId != null && routeId!.isNotEmpty;

  static ScheduleEvent? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? id = body['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return ScheduleEvent(
      id: id,
      scheduleId: _text(body['scheduleId']),
      scheduleName: body['scheduleName']?.toString() ?? tr('Смена'),
      date: body['date']?.toString() ?? '',
      plannedStart: body['plannedStart']?.toString() ?? '',
      plannedEnd: _text(body['plannedEnd']),
      status: body['status']?.toString() ?? 'PLANNED',
      objectId: _text(body['objectId']),
      routeId: _text(body['routeId']),
      checkInAt: _text(body['checkInAt']),
      checkOutAt: _text(body['checkOutAt']),
      ticketId: _text(body['ticketId']),
      checkOutReason: _text(body['checkOutReason']),
    );
  }

  static List<ScheduleEvent> listFrom(dynamic body) {
    if (body is! List) return const <ScheduleEvent>[];
    return body
        .map(ScheduleEvent.tryParse)
        .whereType<ScheduleEvent>()
        .toList(growable: false);
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}
