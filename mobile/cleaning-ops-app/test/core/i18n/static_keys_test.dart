import 'package:cleaning_ops_app/core/app_product.dart';
import 'package:cleaning_ops_app/core/constants/labels.dart';
import 'package:cleaning_ops_app/core/domain/color_zone.dart';
import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/core/i18n/app_language.dart';
import 'package:cleaning_ops_app/core/i18n/static_keys.dart';
import 'package:cleaning_ops_app/core/theme/app_colors.dart';
import 'package:cleaning_ops_app/features/chat/data/models/chat_models.dart';
import 'package:cleaning_ops_app/features/chat/presentation/providers/chat_providers.dart';
import 'package:cleaning_ops_app/features/checklist/presentation/providers/checklist_providers.dart';
import 'package:cleaning_ops_app/features/profile/data/models/notification_models.dart';
import 'package:cleaning_ops_app/features/profile/presentation/profile_formatters.dart';
import 'package:cleaning_ops_app/features/sos/domain/emergency_category.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter_test/flutter_test.dart';

/// Подписи из const-контекста переводятся через `tr(label)`, поэтому их ключи
/// перечислены в `kStaticLabelKeys` руками. Тест ловит новую подпись без ключа.
void main() {
  setUp(() => AppI18n.current = AppLanguage.ru);

  test('все const-подписи перечислены в kStaticLabelKeys', () {
    final Set<String> keys = kStaticLabelKeys.toSet();
    final List<String> labels = <String>[
      ...ScheduleStatusLabels.labels.values,
      ...TicketLabels.statuses.values,
      ...TicketLabels.types.values,
      ...TicketLabels.priorities.values,
      ...<ScheduleStatusStyle>[
        ScheduleStatusStyle.planned,
        ScheduleStatusStyle.checkedIn,
        ScheduleStatusStyle.checkedOut,
        ScheduleStatusStyle.missed,
      ].map((ScheduleStatusStyle s) => s.label),
      ...RoutePointStatus.values.map((RoutePointStatus s) => s.label),
      ...OperationStatus.values.map((OperationStatus s) => s.label),
      ...PendingActionStatus.values.map((PendingActionStatus s) => s.label),
      ...ChatMessageStatus.values.map((ChatMessageStatus s) => s.label),
      ...ChatConnection.values.map((ChatConnection s) => s.label),
      ...LocationAccess.values.map((LocationAccess s) => s.label),
      ...NotificationTypes.labels.values,
      ...RoleLabels.labels.values,
      ...EmergencyCategory.values.map((EmergencyCategory c) => c.label),
      ...ColorZone.values.map((ColorZone z) => z.name),
      ...ColorZone.values.map((ColorZone z) => z.adjective),
      ...ColorZone.values.map((ColorZone z) => z.zoneName),
      ...ProductConfig.of(AppProduct.operator).tabs.map((ProductTab t) => t.label),
      ...ProductConfig.of(AppProduct.team).tabs.map((ProductTab t) => t.label),
      const NetworkFailure().message,
      const UnauthorizedFailure().message,
      const ForbiddenFailure().message,
      const NotFoundFailure().message,
      const ConflictFailure().message,
      const TooManyRequestsFailure().message,
      const ServerFailure().message,
      const StorageFailure().message,
    ];
    final List<String> missing = labels.where((String l) => !keys.contains(l)).toSet().toList();
    expect(missing, isEmpty, reason: 'добавьте в lib/core/i18n/static_keys.dart');
  });
}
