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

  const EmergencyCategory(this.label);

  final String label;

  /// Префикс описания, по которому бригадир видит тип заявки.
  String get descriptionPrefix => '[Тип: $label]';

  /// Собирает описание для сервера: `[Тип: …]` + текст оператора.
  String toDescription(String text) {
    final String trimmed = text.trim();
    return trimmed.isEmpty ? descriptionPrefix : '$descriptionPrefix $trimmed';
  }
}
