import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../../client_texts.dart';
import '../../data/client_models.dart';
import '../client_providers.dart';
import '../widgets/client_widgets.dart';

/// Экран «Заявки» портала (DS-004, `tickets.md`): список заявок объекта с
/// фильтром «Все / Открытые / Выполненные» и переходом к созданию.
///
/// Клиент не управляет заявкой: статусы и назначения — только у менеджера,
/// соответствующих кнопок на экране нет вовсе (не «disabled», а отсутствие).
class ClientTicketsPage extends ConsumerStatefulWidget {
  const ClientTicketsPage({super.key, this.initialFilter});

  /// `open` / `done` из query-параметра `?status=` (KPI-плитки главной).
  final String? initialFilter;

  @override
  ConsumerState<ClientTicketsPage> createState() => _ClientTicketsPageState();
}

class _ClientTicketsPageState extends ConsumerState<ClientTicketsPage> {
  late TicketFilter _filter;

  @override
  void initState() {
    super.initState();
    _filter = switch (widget.initialFilter) {
      'open' => TicketFilter.open,
      'done' => TicketFilter.done,
      _ => TicketFilter.all,
    };
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ClientObject?> object = ref.watch(myObjectProvider);
    final ClientObject? value = object.valueOrNull;
    return Scaffold(
      key: const Key('client_tickets_page'),
      appBar: AppBar(title: const Text(ClientTexts.ticketsTitle)),
      body: value == null
          ? (object.isLoading
              ? const Center(child: CircularProgressIndicator())
              : const ClientEmptyView(
                  icon: Icons.apartment_outlined,
                  title: ClientTexts.noObjectTitle,
                  hint: ClientTexts.noObjectHint))
          : _Feed(
              objectId: value.id, filter: _filter, onFilter: (TicketFilter f) => setState(() => _filter = f)),
      floatingActionButton: value == null
          ? null
          : FloatingActionButton.extended(
              key: const Key('client_tickets_create_fab'),
              onPressed: () => context.push(AppRoutes.clientTicketNew),
              icon: const Icon(Icons.add),
              label: const Text(ClientTexts.createTicket),
            ),
    );
  }
}

class _Feed extends ConsumerWidget {
  const _Feed({required this.objectId, required this.filter, required this.onFilter});

  final String objectId;
  final TicketFilter filter;
  final ValueChanged<TicketFilter> onFilter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final TicketsFeedKey key = TicketsFeedKey(objectId, filter);
    final AsyncValue<ClientTicketPage> feed = ref.watch(ticketsFeedProvider(key));
    return Column(
      children: <Widget>[
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
          child: Row(
            children: <Widget>[
              for (final TicketFilter f in TicketFilter.values) ...<Widget>[
                ChoiceChip(
                  key: Key('client_ticket_filter_${f.name}'),
                  label: Text(switch (f) {
                    TicketFilter.all => ClientTexts.filterAll,
                    TicketFilter.open => ClientTexts.filterOpen,
                    TicketFilter.done => ClientTexts.filterDone,
                  }),
                  selected: f == filter,
                  onSelected: (_) => onFilter(f),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
            ],
          ),
        ),
        Expanded(
          child: feed.when(
            loading: () => const Padding(padding: EdgeInsets.all(AppSpacing.lg), child: LoadingRows(rows: 3)),
            error: (Object error, _) => Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: ClientErrorView(
                  message: ClientTexts.loadFailed,
                  detail: error.toString(),
                  onRetry: () => ref.invalidate(ticketsFeedProvider(key))),
            ),
            data: (ClientTicketPage page) {
              if (page.items.isEmpty) {
                return filter == TicketFilter.all
                    ? ClientEmptyView(
                        key: const Key('client_tickets_empty'),
                        icon: Icons.assignment_outlined,
                        title: ClientTexts.noTicketsTitle,
                        hint: ClientTexts.noTicketsHint,
                        action: FilledButton(
                            onPressed: () => context.push(AppRoutes.clientTicketNew),
                            child: const Text(ClientTexts.createTicket)),
                      )
                    : ClientEmptyView(
                        key: const Key('client_tickets_filter_empty'),
                        icon: Icons.filter_alt_off_outlined,
                        title: ClientTexts.nothingFoundTitle,
                        hint: ClientTexts.nothingFoundHint,
                        action: OutlinedButton(
                            onPressed: () => onFilter(TicketFilter.all),
                            child: const Text(ClientTexts.showAll)),
                      );
              }
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(ticketsFeedProvider(key)),
                child: ListView.separated(
                  key: const Key('client_tickets_list'),
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, 96),
                  itemCount: page.items.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
                  itemBuilder: (BuildContext context, int index) {
                    if (index == page.items.length) {
                      return Center(
                        child: Text(
                          ClientTexts.shownAll(page.total),
                          style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted),
                        ),
                      );
                    }
                    final ClientTicket ticket = page.items[index];
                    return TicketCard(
                        ticket: ticket, onTap: () => context.push(AppRoutes.clientTicketFor(ticket.id)));
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Экран «Новая заявка» (`tickets.md` п. 7.1). Клиент не выбирает приоритет
/// и аварийный тип (SOS требует координат оператора на месте); объект — из сессии.
class ClientTicketCreatePage extends ConsumerStatefulWidget {
  const ClientTicketCreatePage({super.key});

  @override
  ConsumerState<ClientTicketCreatePage> createState() => _ClientTicketCreatePageState();
}

class _ClientTicketCreatePageState extends ConsumerState<ClientTicketCreatePage> {
  final TextEditingController _description = TextEditingController();
  String _type = 'unscheduled';
  String? _floorId;
  String? _roomId;
  String? _fieldError;
  String? _error;
  bool _busy = false;

  /// Заявка создана — закрытие экрана больше не спрашивает про потерю текста.
  bool _done = false;

  @override
  void initState() {
    super.initState();
    // `canPop` зависит от набранного текста — перерисовываем PopScope при вводе.
    _description.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit(String objectId) async {
    final String text = _description.text.trim();
    setState(() {
      _fieldError = null;
      _error = null;
    });
    if (text.length < ClientTexts.descriptionMin) {
      setState(() => _fieldError = ClientTexts.tooShort(ClientTexts.descriptionMin));
      return;
    }
    if (text.length > ClientTexts.descriptionMax) {
      setState(() => _fieldError = ClientTexts.tooLong(ClientTexts.descriptionMax));
      return;
    }
    setState(() => _busy = true);
    final result = await ref.read(clientRepositoryProvider).createTicket(
          objectId: objectId,
          description: text,
          type: _type,
          roomId: _roomId,
        );
    if (!mounted) return;
    setState(() => _busy = false);
    final ClientTicket? created = result.dataOrNull;
    if (created == null) {
      setState(() => _error = result.failureOrNull?.message ?? ClientTexts.loadFailed);
      return;
    }
    // Новая заявка должна появиться первой и в списке, и в KPI главной.
    ref.invalidate(ticketsFeedProvider);
    ref.invalidate(recentTicketsProvider(objectId));
    ref.invalidate(openTicketsCountProvider(objectId));
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text(ClientTexts.created)));
    setState(() => _done = true);
    context.pop();
  }

  Future<bool> _confirmDiscard() async {
    if (_description.text.trim().isEmpty) return true;
    final bool? discard = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const Text(ClientTexts.discardTitle),
        content: const Text(ClientTexts.discardHint),
        actions: <Widget>[
          TextButton(
              onPressed: () => Navigator.of(context).pop(false), child: const Text(ClientTexts.discardNo)),
          TextButton(
              onPressed: () => Navigator.of(context).pop(true), child: const Text(ClientTexts.discardYes)),
        ],
      ),
    );
    return discard ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final ClientObject? object = ref.watch(myObjectProvider).valueOrNull;
    final AsyncValue<ClientObjectDetail>? detail =
        object == null ? null : ref.watch(objectDetailProvider(object.id));
    final List<ClientFloor> floors = detail?.valueOrNull?.floors ?? const <ClientFloor>[];
    final List<ClientRoom> rooms =
        floors.where((ClientFloor f) => f.id == _floorId).expand((ClientFloor f) => f.rooms).toList();

    return PopScope(
      // Пустая форма или уже созданная заявка закрываются сразу; набранный
      // текст — только после подтверждения (случайный тап не стирает ввод).
      canPop: _done || _description.text.trim().isEmpty,
      onPopInvokedWithResult: (bool didPop, _) async {
        if (didPop || _busy) return;
        if (await _confirmDiscard() && context.mounted) context.pop();
      },
      child: Scaffold(
        key: const Key('client_ticket_create_page'),
        appBar: AppBar(title: const Text(ClientTexts.newTicket)),
        body: object == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: <Widget>[
                  TextField(
                    key: const Key('client_ticket_description'),
                    controller: _description,
                    maxLines: 5,
                    maxLength: ClientTexts.descriptionMax,
                    autofocus: true,
                    enabled: !_busy,
                    decoration: InputDecoration(
                      labelText: ClientTexts.whatHappened,
                      hintText: ClientTexts.describePlaceholder,
                      helperText: _fieldError == null ? ClientTexts.describeHint : null,
                      errorText: _fieldError,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  DropdownButtonFormField<String>(
                    key: const Key('client_ticket_type'),
                    initialValue: _type,
                    decoration:
                        const InputDecoration(labelText: ClientTexts.typeLabel, border: OutlineInputBorder()),
                    items: const <DropdownMenuItem<String>>[
                      DropdownMenuItem<String>(
                          value: 'unscheduled', child: Text(ClientTexts.typeUnscheduled)),
                      DropdownMenuItem<String>(value: 'planned', child: Text(ClientTexts.typePlanned)),
                    ],
                    onChanged: _busy ? null : (String? v) => setState(() => _type = v ?? 'unscheduled'),
                  ),
                  if (floors.isNotEmpty) ...<Widget>[
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<String?>(
                      key: const Key('client_ticket_floor'),
                      initialValue: _floorId,
                      decoration: const InputDecoration(
                          labelText: ClientTexts.floorLabel, border: OutlineInputBorder()),
                      items: <DropdownMenuItem<String?>>[
                        const DropdownMenuItem<String?>(value: null, child: Text(ClientTexts.anyFloor)),
                        for (final ClientFloor f in floors)
                          DropdownMenuItem<String?>(value: f.id, child: Text('${f.number}. ${f.name}')),
                      ],
                      onChanged: _busy
                          ? null
                          : (String? v) => setState(() {
                                _floorId = v;
                                _roomId = null;
                              }),
                    ),
                    if (rooms.isNotEmpty) ...<Widget>[
                      const SizedBox(height: AppSpacing.md),
                      DropdownButtonFormField<String?>(
                        key: const Key('client_ticket_room'),
                        initialValue: _roomId,
                        decoration: const InputDecoration(
                            labelText: ClientTexts.roomLabel, border: OutlineInputBorder()),
                        items: <DropdownMenuItem<String?>>[
                          const DropdownMenuItem<String?>(value: null, child: Text(ClientTexts.anyRoom)),
                          for (final ClientRoom r in rooms)
                            DropdownMenuItem<String?>(value: r.id, child: Text(r.name)),
                        ],
                        onChanged: _busy ? null : (String? v) => setState(() => _roomId = v),
                      ),
                    ],
                  ],
                  if (_error != null) ...<Widget>[
                    const SizedBox(height: AppSpacing.md),
                    Text(_error!,
                        key: const Key('client_ticket_error'),
                        style: const TextStyle(color: AppPalette.dangerText)),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  FilledButton(
                    key: const Key('client_ticket_submit'),
                    onPressed: _busy ? null : () => _submit(object.id),
                    child: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text(ClientTexts.send),
                  ),
                ],
              ),
      ),
    );
  }
}
