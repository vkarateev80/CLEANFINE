import '../../../../shared/data/pending_actions.dart';
import '../../../core/i18n/app_language.dart';

/// Дословные тексты экрана очереди (`design/screens/mobile/offline.md` §9).
class OfflineTexts {
  const OfflineTexts._();

  static String get title => tr('Очередь отправки');
  static String get syncNow => tr('Синхронизировать сейчас');
  static String get retry => tr('Повторить');
  static String get delete => tr('Удалить');
  static String get deleteTitle => tr('Удалить действие? Оно не будет отправлено.');
  static String get cancel => tr('Отмена');
  static String get empty => tr('Очередь пуста — всё отправлено');
  static String get loadFailed => tr('Не удалось прочитать очередь');

  /// «Нет соединения — 2 действия ждут отправки».
  static String offlineStatus(int count) => count == 0
      ? tr('Нет соединения — очередь пуста')
      : trArgs('Нет соединения — {count} {actions} ждут отправки',
          <String, Object?>{'count': count, 'actions': _actions(count)});

  /// «Отправлено 3 из 5».
  static String progress(int done, int total) =>
      trArgs('Отправлено {done} из {total}', <String, Object?>{'done': done, 'total': total});

  static String get onlineReady => tr('Соединение есть — очередь отправится автоматически');

  static String failed(String error) =>
      trArgs('Не удалось отправить: {error}', <String, Object?>{'error': error});
  static String attempts(int count) =>
      trArgs('Попыток: {count}', <String, Object?>{'count': count});
  static String retryIn(int seconds) =>
      trArgs('Повтор через {seconds} с', <String, Object?>{'seconds': seconds});
  static String created(String time) =>
      trArgs('создана {time}', <String, Object?>{'time': time});

  /// Название действия для строки очереди (DS-002 §9, «Виды действий»).
  static String kind(PendingAction action) {
    switch (action.type) {
      case PendingActionTypes.sos:
        return tr('Аварийная заявка');
      case PendingActionTypes.sosAttachPhoto:
        return tr('Фото к аварийной заявке');
      case PendingActionTypes.operationCompleted:
        final String name = _text(action.payload['operationName']) ?? tr('операция техкарты');
        final String? room = _text(action.payload['roomName']);
        return room == null
            ? trArgs('Операция «{name}»', <String, Object?>{'name': name})
            : trArgs('Операция «{name}» · {room}', <String, Object?>{'name': name, 'room': room});
      case PendingActionTypes.roomCompleted:
        final String? room = _text(action.payload['roomName']);
        return room == null
            ? tr('Помещение завершено')
            : trArgs('Помещение «{room}»', <String, Object?>{'room': room});
      default:
        return action.type;
    }
  }

  static String _actions(int count) {
    final int mod10 = count % 10;
    final int mod100 = count % 100;
    if (mod10 == 1 && mod100 != 11) return tr('действие');
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return tr('действия');
    return tr('действий');
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
