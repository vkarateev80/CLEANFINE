import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/clock.dart';
import '../../../../router/app_router.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../client_texts.dart';
import '../../data/client_models.dart';
import '../client_providers.dart';
import '../widgets/client_widgets.dart';

/// Главный экран портала заказчика — «Статус объекта» (DS-004, `dashboard.md`).
///
/// Три вопроса клиента без переходов: что с объектом (паспорт), что делается
/// (ближайшие смены, последние заявки), нужно ли что-то от него (открытые
/// заявки). Правок нет — единственное действие «Создать заявку».
class ClientHomePage extends ConsumerWidget {
  const ClientHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ClientObject?> object = ref.watch(myObjectProvider);
    return Scaffold(
      key: const Key('client_home_page'),
      appBar: AppBar(title: const Text(ClientTexts.homeTitle)),
      body: object.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object error, _) => ClientErrorView(
          message: ClientTexts.loadFailed,
          detail: error.toString(),
          onRetry: () => ref.invalidate(myObjectProvider),
        ),
        data: (ClientObject? value) => value == null
            ? const ClientEmptyView(
                key: Key('client_no_object'),
                icon: Icons.apartment_outlined,
                title: ClientTexts.noObjectTitle,
                hint: ClientTexts.noObjectHint,
              )
            : _ObjectStatus(object: value),
      ),
      floatingActionButton: object.valueOrNull == null
          ? null
          : FloatingActionButton.extended(
              key: const Key('client_create_ticket_fab'),
              onPressed: () => context.push(AppRoutes.clientTicketNew),
              icon: const Icon(Icons.add),
              label: const Text(ClientTexts.createTicket),
            ),
    );
  }
}

class _ObjectStatus extends ConsumerWidget {
  const _ObjectStatus({required this.object});

  final ClientObject object;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<ScheduleEvent>> events = ref.watch(objectEventsProvider(object.id));
    final AsyncValue<ClientObjectDetail> detail = ref.watch(objectDetailProvider(object.id));
    final AsyncValue<int> open = ref.watch(openTicketsCountProvider(object.id));
    final AsyncValue<DoneStats> done = ref.watch(doneLast30Provider(object.id));
    final AsyncValue<List<ClientTicket>> recent = ref.watch(recentTicketsProvider(object.id));
    final DateTime now = ref.watch(nowProvider)();

    final List<ScheduleEvent> allEvents = events.valueOrNull ?? const <ScheduleEvent>[];
    final List<ScheduleEvent> upcoming = upcomingShifts(allEvents, now);
    final ScheduleEvent? next = upcoming.isEmpty ? null : upcoming.first;
    final ScheduleEvent? last = lastCompletedShift(allEvents);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myObjectProvider);
        ref.invalidate(objectEventsProvider(object.id));
        ref.invalidate(objectDetailProvider(object.id));
        ref.invalidate(openTicketsCountProvider(object.id));
        ref.invalidate(doneLast30Provider(object.id));
        ref.invalidate(recentTicketsProvider(object.id));
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 96),
        children: <Widget>[
          // ── Шапка объекта ─────────────────────────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Text(
                  object.name,
                  key: const Key('client_object_name'),
                  style: const TextStyle(fontSize: AppTypography.sizeXL, fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ObjectStatusChip(status: object.status),
            ],
          ),
          if (object.address.isNotEmpty) ...<Widget>[
            const SizedBox(height: AppSpacing.xs),
            Text(object.address, style: const TextStyle(color: AppPalette.textSecondary)),
          ],
          if (object.isArchived) ...<Widget>[
            const SizedBox(height: AppSpacing.md),
            const SoftNotice(text: ClientTexts.archived, key: Key('client_archived_notice')),
          ],
          if (object.isPaused) ...<Widget>[
            const SizedBox(height: AppSpacing.md),
            const SoftNotice(text: ClientTexts.paused, warning: true, key: Key('client_paused_notice')),
          ],
          const SizedBox(height: AppSpacing.lg),

          // ── Паспорт объекта ───────────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Wrap(
                spacing: AppSpacing.xl,
                runSpacing: AppSpacing.md,
                children: <Widget>[
                  PassportItem(label: ClientTexts.passportType, value: object.type),
                  PassportItem(
                      label: ClientTexts.passportArea,
                      value: '${ClientFormat.area(object.totalArea)} м²',
                      mono: true),
                  PassportItem(label: ClientTexts.passportFloors, value: '${object.floorsCount}', mono: true),
                  PassportItem(
                    label: ClientTexts.passportNext,
                    value:
                        next == null ? ClientTexts.notPlanned : ClientFormat.dateTimeShort(next.plannedStart),
                    mono: next != null,
                    muted: next == null,
                  ),
                  if (last?.checkOutAt != null)
                    PassportItem(
                        label: ClientTexts.passportLast,
                        value: ClientFormat.dateTimeShort(last!.checkOutAt),
                        mono: true),
                  if (detail.valueOrNull != null)
                    PassportItem(
                        label: ClientTexts.passportRooms,
                        value: '${detail.valueOrNull!.roomsCount}',
                        mono: true),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // ── KPI-плитки ────────────────────────────────────────────────
          Row(
            children: <Widget>[
              Expanded(
                child: KpiTile(
                  key: const Key('client_kpi_open'),
                  label: ClientTexts.kpiOpen,
                  value: open.valueOrNull?.toString(),
                  loading: open.isLoading,
                  accent: (open.valueOrNull ?? 0) > 0,
                  onTap: () => context.push(AppRoutes.clientTicketsFiltered('open')),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: KpiTile(
                  key: const Key('client_kpi_done'),
                  label: ClientTexts.kpiDone30,
                  value: done.valueOrNull?.count.toString(),
                  loading: done.isLoading,
                  onTap: () => context.push(AppRoutes.clientTicketsFiltered('done')),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          KpiTile(
            key: const Key('client_kpi_next'),
            label: ClientTexts.kpiNextShift,
            value: next == null ? ClientTexts.kpiNone : ClientFormat.dateTimeShort(next.plannedStart),
            loading: events.isLoading,
          ),
          if (done.valueOrNull?.truncated ?? false) ...<Widget>[
            const SizedBox(height: AppSpacing.md),
            const SoftNotice(
              text:
                  'Выполненные заявки показаны не полностью (первые 100): цифра за 30 дней может быть занижена.',
              warning: true,
            ),
          ],
          const SizedBox(height: AppSpacing.xl),

          // ── Ближайшие смены ───────────────────────────────────────────
          const SectionTitle(ClientTexts.upcomingShifts),
          const SizedBox(height: AppSpacing.sm),
          if (events.hasError)
            ClientErrorView(
              message: ClientTexts.loadFailed,
              detail: events.error.toString(),
              onRetry: () => ref.invalidate(objectEventsProvider(object.id)),
            )
          else if (object.isArchived)
            const ClientEmptyView(
                icon: Icons.event_busy_outlined,
                title: 'Обслуживание приостановлено',
                hint: 'Смены по объекту в архиве не планируются.')
          else if (events.isLoading)
            const LoadingRows()
          else if (upcoming.isEmpty)
            const ClientEmptyView(
              key: Key('client_no_shifts'),
              icon: Icons.event_outlined,
              title: ClientTexts.noShiftsTitle,
              hint: ClientTexts.noShiftsHint,
            )
          else
            Card(
              child: Column(
                children: <Widget>[for (final ScheduleEvent e in upcoming.take(3)) ShiftRow(event: e)],
              ),
            ),
          const SizedBox(height: AppSpacing.xl),

          // ── Последние заявки ──────────────────────────────────────────
          Row(
            children: <Widget>[
              const Expanded(child: SectionTitle(ClientTexts.recentTickets)),
              TextButton(
                key: const Key('client_all_tickets'),
                onPressed: () => context.push(AppRoutes.clientTickets),
                child: const Text('${ClientTexts.allTickets} →'),
              ),
            ],
          ),
          if (recent.hasError)
            ClientErrorView(
              message: ClientTexts.loadFailed,
              detail: recent.error.toString(),
              onRetry: () => ref.invalidate(recentTicketsProvider(object.id)),
            )
          else if (recent.isLoading)
            const LoadingRows()
          else if ((recent.valueOrNull ?? const <ClientTicket>[]).isEmpty)
            ClientEmptyView(
              key: const Key('client_no_tickets'),
              icon: Icons.assignment_outlined,
              title: ClientTexts.noTicketsTitle,
              hint: ClientTexts.noTicketsHint,
              action: FilledButton(
                onPressed: () => context.push(AppRoutes.clientTicketNew),
                child: const Text(ClientTexts.createTicket),
              ),
            )
          else
            for (final ClientTicket ticket in recent.valueOrNull!)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: TicketCard(
                    ticket: ticket, onTap: () => context.push(AppRoutes.clientTicketFor(ticket.id))),
              ),
        ],
      ),
    );
  }
}
