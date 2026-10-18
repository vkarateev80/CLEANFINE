import '../../../core/i18n/app_language.dart';

/// Тип аварии, который выбирает оператор.
///
/// ⚠️ В API такого поля нет: `EmergencyTicketDto` принимает только `objectId`,
/// `roomId`, `description`, `lat`, `lng`, `objectName`, `floor`, `radiusM`
/// (DS-002 `sos.md` п. 10.1). Поэтому выбранный тип уходит **первой строкой
/// описания** в формате `[Тип: …]`, а словарь живёт в приложении. Когда на
/// сервере появится `category`, менять придётся только сборку описания.
enum EmergencyCategory {
  flood('Прорыв трубы / затопление'),
  sewage('Засор канализации'),
  power('Нет электричества'),
  property('Повреждение имущества'),
  danger('Опасность для людей'),
  other('Другое');

  const EmergencyCategory(this._label);

  /// Русская подпись: ключ перевода и то, что уходит на сервер в описании —
  /// бригадир и админка читают по-русски независимо от языка оператора.
  final String _label;

  /// Подпись на языке интерфейса.
  String get label => tr(_label);

  /// Префикс описания, по которому бригадир видит тип заявки (всегда по-русски).
  String get descriptionPrefix => '[Тип: $_label]';

  /// Собирает описание для сервера: `[Тип: …]` + текст оператора.
  String toDescription(String text) {
    final String trimmed = text.trim();
    return trimmed.isEmpty ? descriptionPrefix : '$descriptionPrefix $trimmed';
  }
}
