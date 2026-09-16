import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/service_providers.dart';
import 'repositories/operator_repositories.dart';
import 'repositories/schedule_repository.dart';

/// Репозитории чтения для экранов оператора. Один экземпляр на приложение.
final scheduleRepositoryProvider = Provider<ScheduleRepository>((ref) {
  return ScheduleRepository(ref.watch(scheduleApiProvider));
});

final coreRepositoryProvider = Provider<CoreRepository>((ref) {
  return CoreRepository(ref.watch(coreApiProvider));
});

final ticketsRepositoryProvider = Provider<TicketsRepository>((ref) {
  return TicketsRepository(ref.watch(ticketsApiProvider));
});
