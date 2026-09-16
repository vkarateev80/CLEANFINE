import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/labels.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../router/app_router.dart';
import '../../../../shared/data/models/operator_models.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../providers/today_providers.dart';

/// Главный экран `/today` (М6.3): смена на сегодня, отметки прихода/ухода,
/// маршрут и мои заявки. Элементы и тексты — по `design/screens/mobile/home_today.md`.
class HomeTodayPage extends ConsumerWidget {
  const HomeTodayPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<TodayOverview> overview = ref.watch(todayOverviewProvider);
    final TodayOverview? data = overview.valueOrNull;

    return Scaffold(
      key: const Key('today_page'),
      appBar: AppBar(title: Text(_title(data))),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(todayOverviewProvider.future),
        child: overview.when(
          loading: () => const _TodaySkeleton(),
          error: (Object error, StackTrace stack) => _TodayError(
            failure: error is Failure ? error : const ServerFailure(),
            onRetry: () => ref.invalidate(todayOverviewProvider),
          ),
          data: (TodayOverview value) => _TodayContent(overview: value),
        ),
      ),
    );
  }

  /// «Сегодня · {objectName}» — имя объекта только когда объект известен.
  static String _title(TodayOverview? data) {
    final String? name = data?.object?.name;
    return name == null || name.isEmpty ? 'Сегодня' : 'Сегодня · $name';
  }
}

class _TodayContent extends ConsumerWidget {
  const _TodayContent({required this.overview});

  final TodayOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!overview.hasShift) {
      return ListView(
        // Экран должен уметь pull-to-refresh, даже когда он пуст.
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: <Widget>[
          Text(
            Formatters.dateWithWeekday(DateTime.now()),
            style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          _EmptyShifts(onRetry: () => ref.invalidate(todayOverviewProvider)),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.space3xl,
      ),
      children: <Widget>[
        Text(
          Formatters.dateWithWeekday(DateTime.now()),
          style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        _ShiftCard(overview: overview),
        const SizedBox(height: AppSpacing.lg),
        _TicketsSection(
          tickets: overview.activeTickets,
          closed: overview.tickets.length - overview.activeTickets.length,
        ),
      ],
    );
  }
}

/// Пустое состояние: смен на сегодня нет (текст дословно из спецификации).
class _EmptyShifts extends StatelessWidget {
  const _EmptyShifts({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('today_empty_text'),
      children: <Widget>[
        const Icon(Icons.event_busy_outlined, size: 56, color: AppPalette.textSecondary),
        const SizedBox(height: AppSpacing.md),
        const Text(
          'На смену сегодня вы не назначены',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.sm),
        const Text(
          'Смены назначает бригадир в графике',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
        ),
        const SizedBox(height: AppSpacing.lg),
        OutlinedButton(
          key: const Key('today_empty_retry'),
          onPressed: onRetry,
          child: const Text('Обновить'),
        ),
      ],
    );
  }
}

/// Ошибка загрузки смен: текст и кнопка повтора.
class _TodayError extends StatelessWidget {
  const _TodayError({required this.failure, required this.onRetry});

  final Failure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: <Widget>[
        const SizedBox(height: AppSpacing.space3xl),
        const Icon(Icons.cloud_off_outlined, size: 56, color: AppPalette.danger),
        const SizedBox(height: AppSpacing.md),
        const Text(
          'Не удалось загрузить смены',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          failure.message,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
        ),
        const SizedBox(height: AppSpacing.lg),
        OutlinedButton(
          key: const Key('today_error_retry'),
          onPressed: onRetry,
          child: const Text('Повторить'),
        ),
      ],
    );
  }
}

/// Скелетон первой загрузки: две карточки высотой 140 — экран не «прыгает».
class _TodaySkeleton extends StatelessWidget {
  const _TodaySkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: const <Widget>[
        _SkeletonCard(),
        SizedBox(height: AppSpacing.md),
        _SkeletonCard(),
      ],
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 140,
      decoration: BoxDecoration(
        color: AppPalette.border,
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
    );
  }
}

/// Карточка смены: статус, время, объект, маршрут, подсказка и кнопки отметок.
class _ShiftCard extends ConsumerWidget {
  const _ShiftCard({required this.overview});

  final TodayOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ScheduleEvent event = overview.current!;
    final TodayActionState action = ref.watch(todayControllerProvider);
    final RouteDetail? route = overview.route;

    return Card(
      key: const Key('today_shift_card'),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    event.scheduleName,
                    style: const TextStyle(
                      fontSize: AppTypography.sizeLG,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                _StatusBadge(status: event.status),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              Formatters.timeRange(event.plannedStart, event.checkOutAt),
              style: const TextStyle(fontSize: AppTypography.sizeBASE),
            ),
            if (overview.object != null) ...<Widget>[
              const SizedBox(height: AppSpacing.xs),
              Text(
                <String?>[overview.object!.name, overview.object!.address]
                    .whereType<String>()
                    .join(' · '),
                style: const TextStyle(
                  fontSize: AppTypography.sizeSM,
                  color: AppPalette.textSecondary,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Text(
              route == null
                  ? 'Маршрут не назначен'
                  : 'Маршрут: ${route.name} · ${route.pointsCount} помещений · ~${route.estimatedMinutes} мин',
              style: const TextStyle(fontSize: AppTypography.sizeSM),
            ),
            if (event.checkOutReason != null) ...<Widget>[
              const SizedBox(height: AppSpacing.xs),
              Text(
                event.checkOutReason!,
                style: const TextStyle(
                  fontSize: AppTypography.sizeXS,
                  color: AppPalette.warning,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            Text(
              _hintFor(event),
              style: const TextStyle(
                fontSize: AppTypography.sizeSM,
                color: AppPalette.textSecondary,
              ),
            ),
            if (action.hasMessage) ...<Widget>[
              const SizedBox(height: AppSpacing.sm),
              Text(
                action.message!,
                key: const Key('today_action_message'),
                style: TextStyle(
                  fontSize: AppTypography.sizeSM,
                  color: action.message == 'Смена открыта' || action.message == 'Смена закрыта'
                      ? AppPalette.success
                      : AppPalette.danger,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            _ShiftActions(event: event, action: action),
          ],
        ),
      ),
    );
  }

  /// Подсказка состояния смены (`home_today.md` §4).
  String _hintFor(ScheduleEvent event) {
    if (event.isPlanned) {
      return 'Вы ещё не вышли на смену. Отметка возможна только в зоне объекта';
    }
    if (event.isCheckedIn) {
      return 'Смена открыта в ${Formatters.time(event.checkInAt) ?? '--:--'}';
    }
    if (event.isCheckedOut) {
      return 'Смена закрыта в ${Formatters.time(event.checkOutAt) ?? '--:--'}';
    }
    if (event.isMissed) {
      return 'Вы не отметились на смене. Обратитесь к бригадиру.';
    }
    return '';
  }
}

/// Кнопки смены: «Начать смену» / «Закрыть смену» + «Маршрут»/«Продолжить».
class _ShiftActions extends ConsumerWidget {
  const _ShiftActions({required this.event, required this.action});

  final ScheduleEvent event;
  final TodayActionState action;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool busy = action.isSubmitting;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (event.isPlanned)
          FilledButton(
            key: const Key('today_checkin_button'),
            onPressed:
                busy ? null : () => ref.read(todayControllerProvider.notifier).checkIn(event),
            child: const Text('Начать смену'),
          ),
        if (event.isCheckedIn) ...<Widget>[
          FilledButton(
            key: const Key('today_route_button'),
            onPressed: () => _openRoute(context),
            child: const Text('Продолжить'),
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(
            key: const Key('today_checkout_button'),
            onPressed: busy ? null : () => _confirmCheckOut(context, ref),
            child: const Text('Закрыть смену'),
          ),
        ],
        if (event.isCheckedOut || event.isMissed)
          OutlinedButton(
            key: const Key('today_route_button'),
            onPressed: () => _openRoute(context),
            child: const Text('Маршрут'),
          ),
      ],
    );
  }

  /// Переход к маршруту смены; без маршрута — snackbar «Маршрут не назначен».
  void _openRoute(BuildContext context) {
    if (!event.hasRoute) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Маршрут не назначен')),
      );
      return;
    }
    context.push(AppRoutes.routeMapFor(event.id));
  }

  /// Подтверждение закрытия смены (текст диалога — дословно из спецификации).
  Future<void> _confirmCheckOut(BuildContext context, WidgetRef ref) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        key: const Key('today_checkout_dialog'),
        title: const Text('Закрыть смену?'),
        content: const Text('После закрытия отметить операции будет нельзя.'),
        actions: <Widget>[
          TextButton(
            key: const Key('today_checkout_cancel'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            key: const Key('today_checkout_confirm'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Закрыть'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(todayControllerProvider.notifier).checkOut(event);
  }
}

/// Бейдж статуса смены с русской подписью из shared-словаря.
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final ScheduleStatusStyle style = ScheduleStatusStyle.of(status);
    return Container(
      key: Key('today_status_${status.toLowerCase()}'),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
      decoration: BoxDecoration(
        color: style.color.withOpacity(0.14),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        ScheduleStatusLabels.of(status),
        style: TextStyle(
          fontSize: AppTypography.sizeXS,
          fontWeight: FontWeight.w600,
          color: style.color,
        ),
      ),
    );
  }
}

/// Блок «Мои заявки»: активные карточки, пустое состояние и переход к полному списку.
class _TicketsSection extends StatelessWidget {
  const _TicketsSection({required this.tickets, required this.closed});

  final List<TicketSummary> tickets;
  final int closed;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            const Expanded(
              child: Text(
                'Мои заявки',
                style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(
              key: const Key('today_tickets_all_button'),
              onPressed: () => _openAll(context),
              child: const Text('Все →'),
            ),
          ],
        ),
        if (tickets.isEmpty)
          const Padding(
            key: Key('today_tickets_empty_text'),
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Text(
              'Заявок нет',
              style: TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
            ),
          )
        else
          ...tickets.map((TicketSummary ticket) => _TicketTile(ticket: ticket)),
        if (closed > 0)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Text(
              'Закрытых заявок: $closed',
              style: const TextStyle(
                fontSize: AppTypography.sizeXS,
                color: AppPalette.textSecondary,
              ),
            ),
          ),
      ],
    );
  }

  void _openAll(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext context) => ListView(
        key: const Key('today_tickets_sheet'),
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: <Widget>[
          const Text(
            'Мои заявки',
            style: TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: AppSpacing.md),
          if (tickets.isEmpty)
            const Text('Заявок нет')
          else
            ...tickets.map((TicketSummary ticket) => _TicketTile(ticket: ticket)),
        ],
      ),
    );
  }
}

/// Карточка заявки: приоритет-точка, тип, статус, описание и срок.
class _TicketTile extends StatelessWidget {
  const _TicketTile({required this.ticket});

  final TicketSummary ticket;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: Key('today_ticket_${ticket.id}'),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              margin: const EdgeInsets.only(top: 6, right: AppSpacing.sm),
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: ticketPriorityColor(ticket.priority),
                shape: BoxShape.circle,
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          TicketLabels.type(ticket.type),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text(
                        TicketLabels.status(ticket.status),
                        style: TextStyle(
                          fontSize: AppTypography.sizeXS,
                          color: ticketStatusColor(ticket.status),
                        ),
                      ),
                    ],
                  ),
                  if (ticket.description.isNotEmpty) ...<Widget>[
                    const SizedBox(height: AppSpacing.xs),
                    Text(ticket.description, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                  if (ticket.deadline != null) ...<Widget>[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'до ${Formatters.time(ticket.deadline) ?? ''}',
                      style: const TextStyle(
                        fontSize: AppTypography.sizeXS,
                        color: AppPalette.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
