import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../shared/data/models/schedule_event.dart';
import '../../client_texts.dart';
import '../../data/client_models.dart';
import '../client_providers.dart';

/// Общие виджеты портала заказчика: статусы, плитки, карточки, состояния.

class ObjectStatusChip extends StatelessWidget {
  const ObjectStatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (String label, Color color) = switch (status) {
      'ACTIVE' => ('Активен', AppPalette.successText),
      'PAUSED' => ('Приостановлен', AppPalette.warningText),
      'ARCHIVED' => ('В архиве', AppPalette.textSecondary),
      _ => (status, AppPalette.textSecondary),
    };
    return _Pill(label: label, color: color);
  }
}

class TicketStatusChip extends StatelessWidget {
  const TicketStatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final Color color = switch (status) {
      'completed' || 'verified' || 'closed' => AppPalette.successText,
      'in_progress' || 'assigned' => AppPalette.primary,
      'overdue' || 'rejected' => AppPalette.dangerText,
      'paused' => AppPalette.warningText,
      _ => AppPalette.textSecondary,
    };
    return _Pill(label: TicketStatuses.label(status), color: color);
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: AppPalette.border),
        borderRadius: BorderRadius.circular(999),
        color: Colors.white,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: AppSpacing.xs),
          Text(label,
              style: TextStyle(fontSize: AppTypography.sizeXS, fontWeight: FontWeight.w500, color: color)),
        ],
      ),
    );
  }
}

class PassportItem extends StatelessWidget {
  const PassportItem(
      {super.key, required this.label, required this.value, this.mono = false, this.muted = false});

  final String label;
  final String value;
  final bool mono;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 140,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label,
              style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary)),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: AppTypography.sizeSM,
              fontFamily: mono ? 'monospace' : null,
              color: muted ? AppPalette.textMuted : AppPalette.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class KpiTile extends StatelessWidget {
  const KpiTile(
      {super.key, required this.label, this.value, this.loading = false, this.accent = false, this.onTap});

  final String label;
  final String? value;
  final bool loading;
  final bool accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: accent ? AppPalette.primaryLight : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          constraints: const BoxConstraints(minHeight: 88),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
              border: Border.all(color: AppPalette.border), borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(label,
                  style: TextStyle(
                      fontSize: AppTypography.sizeXS,
                      color: accent ? AppPalette.primaryDark : AppPalette.textSecondary)),
              const SizedBox(height: AppSpacing.sm),
              if (loading)
                const SizedBox(width: 40, height: 20, child: LinearProgressIndicator(minHeight: 4))
              else
                Text(value ?? '0',
                    style: const TextStyle(
                        fontSize: AppTypography.sizeXL,
                        fontWeight: FontWeight.w600,
                        fontFamily: 'monospace')),
            ],
          ),
        ),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontSize: AppTypography.sizeSM, fontWeight: FontWeight.w600));
}

class SoftNotice extends StatelessWidget {
  const SoftNotice({super.key, required this.text, this.warning = false});

  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: warning ? const Color(0xFFFFF7DB) : AppPalette.surfaceMuted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text,
          style: TextStyle(
              fontSize: AppTypography.sizeSM,
              color: warning ? AppPalette.warningText : AppPalette.textStrong)),
    );
  }
}

class ShiftRow extends StatelessWidget {
  const ShiftRow({super.key, required this.event});

  final ScheduleEvent event;

  @override
  Widget build(BuildContext context) {
    final String label = switch (event.status) {
      'PLANNED' => 'Запланирована',
      'CHECKED_IN' => 'Идёт уборка',
      'CHECKED_OUT' => 'Завершена',
      'MISSED' => 'Пропущена',
      _ => event.status,
    };
    return ListTile(
      title: Text(ClientFormat.dateTimeShort(event.plannedStart),
          style: const TextStyle(fontFamily: 'monospace', fontSize: AppTypography.sizeSM)),
      subtitle: Text(event.scheduleName, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: _Pill(
          label: label, color: event.status == 'CHECKED_IN' ? AppPalette.primary : AppPalette.textSecondary),
    );
  }
}

class TicketCard extends StatelessWidget {
  const TicketCard({super.key, required this.ticket, this.onTap});

  final ClientTicket ticket;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: Key('client_ticket_${ticket.id}'),
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Text(ticket.shortId,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: AppTypography.sizeXS,
                          color: AppPalette.textMuted)),
                  const Spacer(),
                  TicketStatusChip(status: ticket.status),
                  const SizedBox(width: AppSpacing.sm),
                  Text(ClientFormat.dateTimeShort(ticket.createdAt),
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: AppTypography.sizeXS,
                          color: AppPalette.textSecondary)),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(ticket.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: AppTypography.sizeSM)),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '${TicketStatuses.typeLabels[ticket.type] ?? ticket.type} · ${TicketStatuses.priorityLabels[ticket.priority] ?? ticket.priority}'
                '${ticket.commentsCount > 0 ? ' · комментариев: ${ticket.commentsCount}' : ''}',
                style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
              ),
              if (ticket.isOverdue)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(ClientTexts.overdueSince(ClientFormat.dateTimeShort(ticket.overdueAt)),
                      style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.dangerText)),
                ),
              if (ticket.assigneeId != null)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(ClientTexts.assigneeSet,
                      style: TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ClientEmptyView extends StatelessWidget {
  const ClientEmptyView({super.key, required this.icon, required this.title, this.hint, this.action});

  final IconData icon;
  final String title;
  final String? hint;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Column(
        children: <Widget>[
          Icon(icon, size: 40, color: AppPalette.textMuted),
          const SizedBox(height: AppSpacing.sm),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (hint != null) ...<Widget>[
            const SizedBox(height: AppSpacing.xs),
            Text(hint!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppPalette.textSecondary, fontSize: AppTypography.sizeSM)),
          ],
          if (action != null) ...<Widget>[const SizedBox(height: AppSpacing.md), action!],
        ],
      ),
    );
  }
}

class ClientErrorView extends StatelessWidget {
  const ClientErrorView({super.key, required this.message, this.detail, required this.onRetry});

  final String message;
  final String? detail;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: const Color(0xFFFDECEE),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: <Widget>[
          const Icon(Icons.error_outline, color: AppPalette.dangerText),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(message,
                    style: const TextStyle(color: AppPalette.dangerText, fontWeight: FontWeight.w500)),
                if (detail != null && detail!.isNotEmpty)
                  Text(detail!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style:
                          const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary)),
              ],
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text(ClientTexts.retry)),
        ],
      ),
    );
  }
}

class LoadingRows extends StatelessWidget {
  const LoadingRows({super.key, this.rows = 2});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        for (int i = 0; i < rows; i++)
          Container(
            height: 64,
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            decoration:
                BoxDecoration(color: AppPalette.surfaceMuted, borderRadius: BorderRadius.circular(12)),
          ),
      ],
    );
  }
}
