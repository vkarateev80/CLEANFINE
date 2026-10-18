/// Модели notification-service (М6.8, DS-002 `profile.md` §3.4).
library;

import '../../../../core/i18n/app_language.dart';

/// Машинные значения типов уведомлений (`NOTIFICATION_TYPES` в
/// `backend/notification-service/src/notifications/notification-types.ts`).
class NotificationTypes {
  const NotificationTypes._();

  static const String newTicket = 'NEW_TICKET';
  static const String emergency = 'EMERGENCY';
  static const String ticketOverdue = 'TICKET_OVERDUE';
  static const String geofenceExit = 'GEOFENCE_EXIT';
  static const String materialLow = 'MATERIAL_LOW';
  static const String scheduleMissed = 'SCHEDULE_MISSED';
  static const String chatMessage = 'CHAT_MESSAGE';
  /// Статус заявки изменён (12.10.2026): взята в работу, выполнена, закрыта.
  static const String ticketStatus = 'TICKET_STATUS';
  /// Служебные: проверка push («Проверить» в профиле) и объявления.
  static const String system = 'SYSTEM';

  /// Порядок шторки — как в макете `profile.md` §2.
  static const List<String> ordered = <String>[
    emergency,
    newTicket,
    ticketStatus,
    ticketOverdue,
    chatMessage,
    geofenceExit,
    materialLow,
    scheduleMissed,
    system,
  ];

  /// Русские подписи: словаря на сервере нет, подписи живут в приложении
  /// (`profile.md` §3.4, п. 11.3). Неизвестный тип показываем как есть — так
  /// новый тип на сервере не превращается в пустую строку.
  static const Map<String, String> labels = <String, String>{
    emergency: 'Аварийные заявки',
    newTicket: 'Новые заявки',
    ticketOverdue: 'Просроченные заявки',
    chatMessage: 'Сообщения в чате',
    ticketStatus: 'Статусы заявок',
    geofenceExit: 'Выход из геозоны',
    materialLow: 'Материал ниже нормы',
    scheduleMissed: 'Неявка на смену',
    system: 'Служебные',
  };

  static String label(String type) => tr(labels[type] ?? type);
}

/// Настройки подписок: `GET /api/notifications/settings`.
///
/// `disabledTypes` — типы, от которых пользователь **отказался**; семантика
/// инвертирована относительно тумблеров (включённый тумблер = типа нет в списке).
class NotificationSettings {
  const NotificationSettings({
    required this.disabledTypes,
    required this.availableTypes,
  });

  const NotificationSettings.empty()
      : disabledTypes = const <String>[],
        availableTypes = NotificationTypes.ordered;

  final List<String> disabledTypes;
  final List<String> availableTypes;

  bool isEnabled(String type) => !disabledTypes.contains(type);

  /// «Включены (5 из 7)» — счётчик для пункта профиля (`profile.md` §9).
  int get enabledCount => availableTypes.where(isEnabled).length;

  int get totalCount => availableTypes.length;

  String get label =>
      trArgs('Включены ({enabled} из {total})', <String, Object?>{'enabled': enabledCount, 'total': totalCount});

  /// Порядок как в макете: сначала известные типы, затем незнакомые с сервера.
  List<String> get orderedTypes {
    final List<String> known = <String>[
      ...NotificationTypes.ordered.where(availableTypes.contains),
    ];
    final List<String> extra =
        availableTypes.where((String type) => !known.contains(type)).toList(growable: false);
    return <String>[...known, ...extra];
  }

  NotificationSettings copyWith({List<String>? disabledTypes}) {
    return NotificationSettings(
      disabledTypes: disabledTypes ?? this.disabledTypes,
      availableTypes: availableTypes,
    );
  }

  /// Тумблер: включение убирает тип из `disabledTypes`, выключение — добавляет.
  NotificationSettings withEnabled(String type, bool enabled) {
    final Set<String> next = <String>{...disabledTypes};
    if (enabled) {
      next.remove(type);
    } else {
      next.add(type);
    }
    return copyWith(disabledTypes: next.toList(growable: false));
  }

  static NotificationSettings? tryParse(dynamic body) {
    if (body is! Map) return null;
    final dynamic disabled = body['disabledTypes'];
    final dynamic available = body['availableTypes'];
    return NotificationSettings(
      disabledTypes: disabled is List
          ? disabled.map((dynamic item) => item.toString()).toList(growable: false)
          : const <String>[],
      availableTypes: available is List
          ? available.map((dynamic item) => item.toString()).toList(growable: false)
          : NotificationTypes.ordered,
    );
  }
}

/// In-app уведомление (`GET /api/notifications`).
///
/// Нужен для счётчика в шапке shell (`chat.md` §8: `unreadCount`), сам список
/// на экранах М6.8 не показывается.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.isRead = false,
    this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final DateTime? createdAt;

  static AppNotification? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String id = body['id']?.toString() ?? '';
    if (id.isEmpty) return null;
    final dynamic createdAt = body['createdAt'];
    return AppNotification(
      id: id,
      type: body['type']?.toString() ?? '',
      title: body['title']?.toString() ?? '',
      body: body['body']?.toString() ?? '',
      isRead: body['isRead'] == true,
      createdAt: createdAt == null ? null : DateTime.tryParse(createdAt.toString()),
    );
  }
}
