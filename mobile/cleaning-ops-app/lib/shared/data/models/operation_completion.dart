/// Ответ ticket-service на завершение операции техкарты (М3.6).
///
/// `alreadyCompleted: true` — повторный вызов: сервер идемпотентен по паре
/// `(ticketId, operationId)`, и для приложения это **успех**, а не ошибка.
class CompleteOperationResult {
  const CompleteOperationResult({
    required this.operationId,
    this.ticketId,
    this.completedAt,
    this.photoUrl,
    this.alreadyCompleted = false,
    this.completedOperations,
    this.operationsTotal,
    this.allOperationsCompleted = false,
  });

  final String operationId;
  final String? ticketId;
  final String? completedAt;
  final String? photoUrl;
  final bool alreadyCompleted;
  final int? completedOperations;
  final int? operationsTotal;
  final bool allOperationsCompleted;

  static CompleteOperationResult? tryParse(dynamic body) {
    if (body is! Map) return null;
    final String? operationId = body['operationId']?.toString();
    if (operationId == null || operationId.isEmpty) return null;
    return CompleteOperationResult(
      operationId: operationId,
      ticketId: _text(body['ticketId']),
      completedAt: _text(body['completedAt']),
      photoUrl: _text(body['photoUrl']),
      alreadyCompleted: body['alreadyCompleted'] == true,
      completedOperations: _int(body['completedOperations']),
      operationsTotal: _int(body['operationsTotal']),
      allOperationsCompleted: body['allOperationsCompleted'] == true,
    );
  }

  static String? _text(dynamic value) {
    final String text = value?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value?.toString() ?? '');
  }
}
