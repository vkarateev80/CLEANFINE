import '../../../../shared/data/pending_actions.dart';

/// Дословные тексты экрана очереди (`design/screens/mobile/offline.md` §9).
class OfflineTexts {
  const OfflineTexts._();

  static const String title = 'Очередь отправки';
  static const String syncNow = 'Синхронизировать сейчас';
  static const String retry = 'Повторить';
  static const String delete = 'Удалить';
  static const String deleteTitle = 'Удалить действие? Оно не будет отправлено.';
  static const String cancel = 'Отмена';
  static const String empty = 'Очередь пуста — всё отправлено';
  static const String loadFailed = 'Не удалось прочитать очередь';

  /// «Нет соединения — 2 действия ждут отправки».
  static String offlineStatus(int count) =>
      count == 0
          ? 'Нет соединения — очередь пуста'
          : 'Нет соединения — $count ${_actions(count)} ждут отправки';

  /// «Отправлено 3 из 5».
  static String progress(int done, int total) => 'Отправлено $done из $total';

  static const String onlineReady = 'Соединение есть — очередь отправится автоматически';

  static String failed(String error) => 'Не удалось отправить: $error';
  static String attempts(int count) => 'Попыток: $count';
  static String retryIn(int seconds) => 'Повтор через $seconds с';
  static String created(String time) => 'создана $time';

  /// Название действия для строки очереди (DS-002 §9, «Виды действий»).
  static String kind(PendingAction action) {
    switch (action.type) {
      case PendingActionTypes.sos:
        return 'Аварийная заявка';
      case PendingActionTypes.sosAttachPhoto:
        return 'Фото к аварийной заявке';
      case PendingActionTypes.operationCompleted:
        final String name = _text(action.payload['operationName']) ?? 'операция техкарты';
        final String? room = _text(action.payload['roomName']);
        return room == null ? 'Операция «$name»' : 'Операция «$name» · $room';
      case PendingActionTypes.roomCompleted:
        final String? room = _text(action.payload['roomName']);
        return room == null ? 'Помещение завершено' : 'Помещение «$room»';
      default:
        return action.type;
    }
  }

  static String _actions(int count) {
    final int mod10 = count % 10;
    final int mod100 = count % 100;
    if (mod10 == 1 && mod100 != 11) return 'действие';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'действия';
    return 'действий';
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }
}

/// Время создания записи в очереди: «10:42».
String offlineTime(DateTime value) {
  final DateTime local = value.toLocal();
  final String hours = local.hour.toString().padLeft(2, '0');
  final String minutes = local.minute.toString().padLeft(2, '0');
  return '$hours:$minutes';
}

/// Секунды до следующей попытки: `null`, если повтор не назначен.
int? offlineSecondsToRetry(DateTime? nextAttemptAt, DateTime now) {
  if (nextAttemptAt == null) return null;
  final int seconds = nextAttemptAt.difference(now).inSeconds;
  return seconds <= 0 ? null : seconds;
}
