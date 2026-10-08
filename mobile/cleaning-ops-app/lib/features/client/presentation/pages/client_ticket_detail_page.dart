import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../client_texts.dart';
import '../../data/client_models.dart';
import '../client_providers.dart';
import '../widgets/client_widgets.dart';

/// Карточка заявки `/client/tickets/:id` (DS-004, `tickets.md` п. 7.2).
///
/// Два действия клиента: прочитать и уточнить комментарием. 403 и 404 не
/// различаем — одно сообщение, иначе экран стал бы способом проверять
/// существование чужих заявок.
class ClientTicketDetailPage extends ConsumerStatefulWidget {
  const ClientTicketDetailPage({super.key, required this.ticketId});

  final String ticketId;

  @override
  ConsumerState<ClientTicketDetailPage> createState() => _ClientTicketDetailPageState();
}

class _ClientTicketDetailPageState extends ConsumerState<ClientTicketDetailPage> {
  final TextEditingController _comment = TextEditingController();
  bool _sending = false;
  String? _sendError;
  bool _sent = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final String text = _comment.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _sending = true;
      _sendError = null;
      _sent = false;
    });
    final result = await ref.read(clientRepositoryProvider).addComment(widget.ticketId, text);
    if (!mounted) return;
    setState(() => _sending = false);
    if (result.isSuccess) {
      _comment.clear();
      setState(() => _sent = true);
      ref.invalidate(ticketDetailProvider(widget.ticketId));
    } else {
      setState(() => _sendError = result.failureOrNull?.message ?? ClientTexts.loadFailed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ClientTicketDetail> detail = ref.watch(ticketDetailProvider(widget.ticketId));
    final String? me = ref.watch(sessionProvider).userId;
    return Scaffold(
      key: const Key('client_ticket_detail_page'),
      appBar: AppBar(title: const Text(ClientTexts.ticketTitle)),
      body: detail.when(
        loading: () => const Padding(padding: EdgeInsets.all(AppSpacing.lg), child: LoadingRows(rows: 3)),
        error: (Object error, _) {
          final bool unavailable = error is ForbiddenFailure || error is NotFoundFailure;
          return Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: unavailable
                ? ClientEmptyView(
                    key: const Key('client_ticket_unavailable'),
                    icon: Icons.lock_outline,
                    title: ClientTexts.ticketUnavailable,
                    action: OutlinedButton(
                        onPressed: () => context.pop(), child: const Text(ClientTexts.backToTickets)),
                  )
                : ClientErrorView(
                    message: ClientTexts.loadFailed,
                    detail: error.toString(),
                    onRetry: () => ref.invalidate(ticketDetailProvider(widget.ticketId)),
                  ),
          );
        },
        data: (ClientTicketDetail data) => _body(context, data, me),
      ),
    );
  }

  Widget _body(BuildContext context, ClientTicketDetail data, String? me) {
    final ClientTicket t = data.ticket;
    final List<(String, String?)> timeline = <(String, String?)>[
      (ClientTexts.stepCreated, t.createdAt),
      (TicketStatuses.label('assigned'), t.assignedAt),
      (ClientTexts.stepArrived, t.arrivedAt),
      (ClientTexts.stepAccepted, t.acceptedAt),
      (TicketStatuses.label('completed'), t.completedAt),
      (TicketStatuses.label('verified'), t.verifiedAt),
      (TicketStatuses.label('closed'), t.closedAt),
      (TicketStatuses.label('overdue'), t.overdueAt),
    ].where(((String, String?) step) => step.$2 != null && step.$2!.isNotEmpty).toList();

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: Text(
                '${ClientTexts.ticketTitle} ${t.shortId}',
                key: const Key('client_ticket_heading'),
                style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
              ),
            ),
            TicketStatusChip(status: t.status),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          '${ClientFormat.dateTimeShort(t.createdAt)} · ${TicketStatuses.priorityLabels[t.priority] ?? t.priority}',
          style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
        ),
        const SizedBox(height: AppSpacing.lg),
        _Section(
          title: ClientTexts.description,
          child: Text(t.description, key: const Key('client_ticket_description_text')),
        ),
        _Section(
          title: ClientTexts.progress,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                ClientTexts.operations(data.operationsCompleted, t.operationsTotal),
                style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
              for (final (String, String?) step in timeline)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Row(
                    children: <Widget>[
                      Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(color: AppPalette.success, shape: BoxShape.circle)),
                      const SizedBox(width: AppSpacing.sm),
                      Text(step.$1, style: const TextStyle(fontSize: AppTypography.sizeSM)),
                      const SizedBox(width: AppSpacing.sm),
                      Text(ClientFormat.dateTimeShort(step.$2),
                          style: const TextStyle(
                              fontSize: AppTypography.sizeXS,
                              fontFamily: 'monospace',
                              color: AppPalette.textSecondary)),
                    ],
                  ),
                ),
              if (timeline.length <= 1)
                const Text(ClientTexts.waitingAssignee,
                    style: TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted)),
            ],
          ),
        ),
        _Section(
          title: ClientTexts.comments,
          child: data.comments.isEmpty
              ? const Text(ClientTexts.noComments,
                  style: TextStyle(color: AppPalette.textSecondary, fontSize: AppTypography.sizeSM))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    for (final TicketComment c in data.comments)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Row(
                              children: <Widget>[
                                // ФИО не показываем: справочник `/api/users` закрыт для CLIENT.
                                Text(c.authorId == me ? ClientTexts.you : ClientTexts.manager,
                                    style: const TextStyle(
                                        fontSize: AppTypography.sizeXS, fontWeight: FontWeight.w600)),
                                const SizedBox(width: AppSpacing.sm),
                                Text(ClientFormat.dateTimeShort(c.createdAt),
                                    style: const TextStyle(
                                        fontSize: AppTypography.sizeXS,
                                        fontFamily: 'monospace',
                                        color: AppPalette.textMuted)),
                              ],
                            ),
                            Text(c.text, style: const TextStyle(fontSize: AppTypography.sizeSM)),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        TextField(
          key: const Key('client_ticket_comment'),
          controller: _comment,
          maxLines: 3,
          maxLength: 2000,
          enabled: !_sending,
          decoration: const InputDecoration(
              labelText: ClientTexts.clarify,
              hintText: ClientTexts.clarifyPlaceholder,
              border: OutlineInputBorder()),
        ),
        if (_sendError != null)
          Text(_sendError!,
              style: const TextStyle(color: AppPalette.dangerText, fontSize: AppTypography.sizeXS)),
        const SizedBox(height: AppSpacing.sm),
        FilledButton(
          key: const Key('client_ticket_comment_send'),
          onPressed: _sending ? null : _send,
          child: const Text(ClientTexts.send),
        ),
        if (_sent) ...<Widget>[
          const SizedBox(height: AppSpacing.sm),
          const SoftNotice(text: ClientTexts.commentSent, key: Key('client_ticket_comment_sent')),
        ],
        const SizedBox(height: AppSpacing.lg),
        Text('Заявка создана ${ClientFormat.date(t.createdAt)}',
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted)),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title, style: const TextStyle(fontSize: AppTypography.sizeSM, fontWeight: FontWeight.w600)),
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        ),
      ),
    );
  }
}
