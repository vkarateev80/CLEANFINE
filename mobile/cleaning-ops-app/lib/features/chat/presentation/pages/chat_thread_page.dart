import 'dart:async';
import 'dart:io';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../../../../services/connectivity_service.dart';
import '../../../../shared/data/data_providers.dart';
import '../../../../shared/data/models/file_models.dart';
import '../../../../shared/data/result.dart';
import '../../../../shared/widgets/offline_banner.dart';
import '../../../../shared/widgets/sync_status_widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/models/chat_models.dart';
import '../chat_texts.dart';
import '../providers/chat_providers.dart';
import '../widgets/chat_states.dart';
import 'chats_page.dart';
import '../../../../core/i18n/app_language.dart';

/// Переписка `/chats/:chatId` (М6.8, DS-002 `chat.md` §2.2, §3.2–§3.5).
///
/// Одно WebSocket-соединение на экран: поднимается при входе, рвётся при уходе
/// (`dispose`), иначе на телефоне остаётся висеть сокет и расходоваться батарея.
/// Отметка прочтения уходит только когда приложение на переднем плане и
/// входящее сообщение видно (правило «не читать фоном», §3.5).
class ChatThreadPage extends ConsumerStatefulWidget {
  const ChatThreadPage({super.key, required this.chatId});

  /// id чата (chat-service `Chat`).
  final String chatId;

  @override
  ConsumerState<ChatThreadPage> createState() => _ChatThreadPageState();
}

class _ChatThreadPageState extends ConsumerState<ChatThreadPage>
    with WidgetsBindingObserver {
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();

  /// «Пользователь у нижней границы ленты»: у `reverse: true` это offset ≈ 0.
  bool _atBottom = true;

  /// Мой id из сессии — по нему отличаются свои пузыри от входящих.
  String _meId = '';

  /// Вложения, выбранные до отправки (15.10.2026): файлы уходят в file-service
  /// (`kind=chat`) по одному, затем сообщение с их id — как в веб-версии.
  final List<PendingAttachment> _pending = <PendingAttachment>[];
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _input.text = ref.read(chatDraftsProvider)[widget.chatId] ?? '';
    // Открытый чат известен списку: по нему не накручиваются непрочитанные
    // (`chat.md` §3.1). Ставим после кадра — менять провайдер в `initState`
    // Riverpod запрещает.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(activeChatIdProvider.notifier).state = widget.chatId;
    });
    _input.addListener(_saveDraft);
    _scroll.addListener(_onScroll);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _meId = ref.read(sessionProvider).userId ?? '';
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _input.removeListener(_saveDraft);
    _scroll.removeListener(_onScroll);
    _input.dispose();
    _scroll.dispose();
    // Сбрасывать `activeChatIdProvider` здесь нельзя (Riverpod запрещает менять
    // провайдер в `dispose`); это делает список чатов при возврате (`ChatsPage`).
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Вернулись из фона — дочитываем то, что видно на экране.
    if (state == AppLifecycleState.resumed) _markVisibleRead();
  }

  /// Черновик чата сохраняется локально (`chat.md` §3.2).
  void _saveDraft() => ref.read(chatDraftsProvider.notifier).save(widget.chatId, _input.text);

  void _onScroll() {
    final bool atBottom = !_scroll.hasClients || _scroll.offset <= 8;
    if (atBottom != _atBottom) setState(() => _atBottom = atBottom);
    if (atBottom) _markVisibleRead();
    // Скролл вверх до начала — подгрузка истории (`chat.md` §3.2).
    if (_scroll.hasClients && _scroll.position.pixels >= _scroll.position.maxScrollExtent - 40) {
      unawaited(ref.read(chatThreadProvider(widget.chatId).notifier).loadMore());
    }
  }

  /// Отметка прочтения последнего видимого входящего сообщения.
  ///
  /// Не отправляем, если приложение в фоне или пользователь читает историю выше:
  /// иначе бригадир получил бы ложный сигнал, пока телефон лежит в кармане (§3.5).
  void _markVisibleRead() {
    if (!mounted) return;
    // `lifecycleState == null` — кадр вне жизненного цикла (тесты): считаем
    // приложение активным, иначе отметка прочтения не уходила бы никогда.
    final AppLifecycleState? lifecycle = WidgetsBinding.instance.lifecycleState;
    if (lifecycle != null && lifecycle != AppLifecycleState.resumed) return;
    if (!_atBottom) return;
    final ChatThreadState? state = ref.read(chatThreadProvider(widget.chatId)).valueOrNull;
    if (state == null || state.messages.isEmpty) return;
    final ChatMessage last = state.messages.last;
    if (last.authorId == _meId) return;
    unawaited(ref.read(chatThreadProvider(widget.chatId).notifier).markRead(last.id));
  }

  Future<void> _send() async {
    final String text = _input.text;
    final List<String> attachmentIds = <String>[];
    if (_pending.isNotEmpty) {
      // Файлы без сети не отправить: их нельзя положить в очередь localStorage.
      final bool online = ref.read(onlineProvider).valueOrNull ?? true;
      if (!online) {
        _notice(ChatTexts.attachmentsNeedNetwork);
        return;
      }
      setState(() => _uploading = true);
      try {
        for (final PendingAttachment item in List<PendingAttachment>.of(_pending)) {
          final Result<UploadedFile> result = await ref
              .read(filesRepositoryProvider)
              .uploadChatFile(filePath: item.path, fileName: item.name);
          final UploadedFile? file = result.dataOrNull;
          if (file == null) {
            if (!mounted) return;
            _notice('${item.name}: ${result.failureOrNull?.message ?? ChatTexts.attachmentUploadFailed}');
            return;
          }
          attachmentIds.add(file.id);
        }
      } finally {
        if (mounted) setState(() => _uploading = false);
      }
    }
    if (!mounted) return;
    final bool sent = await ref
        .read(chatThreadProvider(widget.chatId).notifier)
        .send(text, attachmentIds: attachmentIds);
    if (!mounted) return;
    if (sent) {
      _input.clear();
      setState(_pending.clear);
      ref.read(chatDraftsProvider.notifier).clear(widget.chatId);
      if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    }
  }

  void _notice(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// Скрепка: камера, галерея или любой файл. Опасные расширения и файлы
  /// больше 50 МБ отсекаются здесь же, не гоняя их на сервер ради отказа.
  Future<void> _attach() async {
    final AttachSource? source = await showModalBottomSheet<AttachSource>(
      context: context,
      builder: (BuildContext context) => const AttachSourceSheet(),
    );
    if (source == null || !mounted) return;
    final List<PendingAttachment> picked = <PendingAttachment>[];
    try {
      switch (source) {
        case AttachSource.camera:
          final XFile? photo = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
          if (photo != null) picked.add(PendingAttachment(path: photo.path, name: photo.name));
        case AttachSource.gallery:
          final List<XFile> photos = await ImagePicker().pickMultiImage(imageQuality: 85);
          picked.addAll(photos.map((XFile f) => PendingAttachment(path: f.path, name: f.name)));
        case AttachSource.file:
          final List<PlatformFile> files = await FilePicker.pickFiles();
          for (final PlatformFile file in files) {
            final String? path = file.path;
            if (path != null) picked.add(PendingAttachment(path: path, name: file.name));
          }
      }
    } on Object catch (error) {
      _notice('${ChatTexts.attachmentPickFailed}: $error');
      return;
    }
    if (!mounted) return;
    for (final PendingAttachment item in picked) {
      final String? error = await item.validate();
      if (error != null) {
        _notice(error);
        return;
      }
    }
    if (!mounted) return;
    setState(() {
      _pending.addAll(picked);
      if (_pending.length > PendingAttachment.maxCount) {
        _pending.removeRange(PendingAttachment.maxCount, _pending.length);
        _notice(ChatTexts.tooManyAttachmentsPick);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<ChatThreadState> async = ref.watch(chatThreadProvider(widget.chatId));
    final ChatThreadState? thread = async.valueOrNull;

    // Новое сообщение пришло: если пользователь у нижней границы — дочитываем.
    ref.listen<AsyncValue<ChatThreadState>>(chatThreadProvider(widget.chatId),
        (AsyncValue<ChatThreadState>? previous, AsyncValue<ChatThreadState> next) {
      final ChatThreadState? value = next.valueOrNull;
      if (value == null) return;
      WidgetsBinding.instance.addPostFrameCallback((_) => _markVisibleRead());
    });

    return Scaffold(
      key: const Key('chat_thread_page'),
      backgroundColor: AppPalette.background,
      appBar: AppBar(
        title: Text(thread == null ? _fallbackTitle(async) : chatTitle(_asSummary(thread))),
        bottom: thread == null
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(18),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Text(
                    _membersLine(thread),
                    key: const Key('chat_members_text'),
                    style: const TextStyle(
                      fontSize: AppTypography.sizeXS,
                      color: AppPalette.textSecondary,
                    ),
                  ),
                ),
              ),
        actions: <Widget>[
          IconButton(
            key: const Key('chat_sos_button'),
            tooltip: 'SOS',
            onPressed: () => context.push(AppRoutes.sos),
            icon: const Icon(Icons.emergency, color: AppPalette.dangerText),
          ),
        ],
      ),
      body: async.when(
        loading: () => const ChatThreadSkeleton(),
        error: (Object error, StackTrace stack) => _ThreadError(
          failure: error is Failure ? error : const ServerFailure(),
        ),
        data: (ChatThreadState value) => _ThreadBody(
          chatId: widget.chatId,
          thread: value,
          meId: _meId,
          input: _input,
          scroll: _scroll,
          onSend: _send,
          onAttach: _attach,
          pending: _pending,
          uploading: _uploading,
          onRemoveAttachment: (int index) => setState(() => _pending.removeAt(index)),
        ),
      ),
    );
  }

  /// 403 «Вы не участник этого чата»: composer и ленты нет (`chat.md` §5, §10.3).
  static String _fallbackTitle(AsyncValue<ChatThreadState> async) {
    if (async.hasError && async.error is ForbiddenFailure) return ChatTexts.chatUnavailable;
    return ChatTexts.ticketChat;
  }

  /// «Петров Пётр · в сети» — по `user:status`; имён в API нет (`chat.md` п. 11.7).
  String _membersLine(ChatThreadState thread) {
    final List<ChatMember> others = thread.others(_meId);
    if (others.isEmpty) return '';
    final int online = others
        .where((ChatMember member) => thread.onlineUsers.contains(member.userId))
        .length;
    if (thread.connection == ChatConnection.connecting) return ChatTexts.connection;
    if (online > 0) return '$online ${ChatTexts.online}';
    return ChatTexts.recently;
  }

  ChatSummary _asSummary(ChatThreadState thread) {
    return ChatSummary(
      id: thread.detail.id,
      type: thread.detail.type,
      title: thread.detail.title,
      createdAt: thread.detail.createdAt,
      unreadCount: 0,
    );
  }
}

/// Тело переписки: лента, баннеры состояния и composer.
class _ThreadBody extends ConsumerStatefulWidget {
  const _ThreadBody({
    required this.chatId,
    required this.thread,
    required this.meId,
    required this.input,
    required this.scroll,
    required this.onSend,
    required this.onAttach,
    required this.pending,
    required this.uploading,
    required this.onRemoveAttachment,
  });

  final String chatId;
  final ChatThreadState thread;
  final String meId;
  final TextEditingController input;
  final ScrollController scroll;
  final Future<void> Function() onSend;
  final Future<void> Function() onAttach;
  final List<PendingAttachment> pending;
  final bool uploading;
  final void Function(int index) onRemoveAttachment;

  @override
  ConsumerState<_ThreadBody> createState() => _ThreadBodyState();
}

class _ThreadBodyState extends ConsumerState<_ThreadBody> {
  @override
  void initState() {
    super.initState();
    widget.input.addListener(_refresh);
  }

  @override
  void dispose() {
    widget.input.removeListener(_refresh);
    super.dispose();
  }

  /// Кнопка «Отправить» активна при непустом `trim()` (`chat.md` §3.3).
  void _refresh() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final ChatThreadState thread = widget.thread;
    final bool online = ref.watch(onlineProvider).valueOrNull ?? true;
    final bool offline = thread.connection != ChatConnection.online || !online;

    return Column(
      children: <Widget>[
        // Баннер соединения/оффлайна (`chat.md` §6): composer не блокируется,
        // сообщение уйдёт в очередь.
        OfflineBanner(
          bannerKey: const Key('chat_offline_banner'),
          message: ChatTexts.offline,
          visible: offline,
        ),
        const SyncProgressBar(statusKey: Key('chat_sync_status')),
        if (thread.historyFailure != null) _HistoryError(chatId: widget.chatId),
        if (thread.sendError != null)
          _SendErrorBanner(text: thread.sendError!, textKey: const Key('chat_send_error_text')),
        Expanded(
          child: thread.messages.isEmpty
              ? ChatEmptyState(
                  icon: Icons.chat_bubble_outline,
                  title: ChatTexts.emptyThread,
                  titleKey: const Key('chat_empty_text'),
                  hint: ChatTexts.emptyThreadHint,
                )
              : _MessageList(
                  chatId: widget.chatId,
                  thread: thread,
                  meId: widget.meId,
                  scroll: widget.scroll,
                ),
        ),
        _Composer(
          input: widget.input,
          onSend: widget.onSend,
          onAttach: widget.onAttach,
          pending: widget.pending,
          uploading: widget.uploading,
          onRemoveAttachment: widget.onRemoveAttachment,
          hasText: widget.input.text.trim().isNotEmpty || widget.pending.isNotEmpty,
        ),
      ],
    );
  }
}

/// Лента: `ListView(reverse: true)`, разделители дней, пузыри и вложения.
class _MessageList extends ConsumerWidget {
  const _MessageList({
    required this.chatId,
    required this.thread,
    required this.meId,
    required this.scroll,
  });

  final String chatId;
  final ChatThreadState thread;
  final String meId;
  final ScrollController scroll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final List<ChatMessage> ordered = thread.messages.reversed.toList(growable: false);
    final DateTime now = DateTime.now();

    return ListView.builder(
      key: const Key('chat_message_list'),
      controller: scroll,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      itemCount: ordered.length + 1,
      itemBuilder: (BuildContext context, int index) {
        if (index == ordered.length) {
          // Подсказка «Начало переписки» — в конце истории (`chat.md` §3.2).
          return _HistoryStart(hasMore: thread.hasMore, loading: thread.loadingMore);
        }
        final ChatMessage message = ordered[index];
        final ChatMessage? next = index + 1 < ordered.length ? ordered[index + 1] : null;
        final bool showDay = next == null || !_sameDay(next.createdAt, message.createdAt);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (showDay) _DayDivider(label: dayLabel(message.createdAt ?? now, now)),
            _MessageBubble(
              message: message,
              mine: message.authorId == meId,
              readUpTo: thread.detail.lastReadAtOfOthers(meId),
            ),
          ],
        );
      },
    );
  }

  static bool _sameDay(DateTime? a, DateTime? b) {
    if (a == null || b == null) return false;
    final DateTime left = a.toLocal();
    final DateTime right = b.toLocal();
    return left.year == right.year && left.month == right.month && left.day == right.day;
  }
}

/// Пузырь сообщения: слева — входящее, справа — своё (`chat.md` §3.2, §3.5).
class _MessageBubble extends ConsumerWidget {
  const _MessageBubble({
    required this.message,
    required this.mine,
    this.readUpTo,
  });

  final ChatMessage message;
  final bool mine;
  final DateTime? readUpTo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Системное сообщение — по центру, без пузыря (`chat.md` §3.2).
    if (message.authorId.isEmpty && !mine) {
      return _SystemMessage(text: message.text, messageId: message.id);
    }

    final bool failed = message.isFailed;
    final Color background = failed
        ? AppPalette.surface
        : mine
            ? AppPalette.primary
            : AppPalette.surfaceMuted;
    final Color foreground = failed
        ? AppPalette.dangerText
        : mine
            ? Colors.white
            : AppPalette.textPrimary;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        child: Container(
          key: Key('chat_message_bubble_${message.id}'),
          margin: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: background,
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: failed ? Border.all(color: AppPalette.danger) : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (message.text.isNotEmpty)
                Text(
                  message.text,
                  style: TextStyle(fontSize: AppTypography.sizeBASE, color: foreground),
                ),
              for (final String fileId in message.attachmentIds)
                _AttachmentChip(fileId: fileId, messageId: message.id, mine: mine),
              const SizedBox(height: AppSpacing.xs),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    timeLabel(message.createdAt),
                    style: TextStyle(
                      fontSize: AppTypography.sizeXS,
                      color: mine ? AppPalette.primaryLight : AppPalette.textSecondary,
                    ),
                  ),
                  if (mine) ...<Widget>[
                    const SizedBox(width: AppSpacing.xs),
                    _MessageStatus(message: message, readUpTo: readUpTo),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Статус доставки своего сообщения (`chat.md` §3.5, §6).
class _MessageStatus extends ConsumerWidget {
  const _MessageStatus({required this.message, this.readUpTo});

  final ChatMessage message;
  final DateTime? readUpTo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ChatMessageStatus status = message.status;
    switch (status) {
      case ChatMessageStatus.pending:
        return Semantics(
          label: status.label,
          child: Text(
            status.label,
            key: Key('chat_message_status_${message.id}'),
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.primaryLight),
          ),
        );
      case ChatMessageStatus.sent:
        // «Прочитано до {HH:mm}» — агрегат по участнику из `ChatDetail.members`
        // (`chat.md` §3.5): пока собеседник не прочитал именно это сообщение,
        // показываем время его последнего прочтения.
        final DateTime? readUpTo = this.readUpTo;
        if (readUpTo != null) {
          return Text(
            '${ChatTexts.readUpTo} ${timeLabel(readUpTo)}',
            key: Key('chat_message_status_${message.id}'),
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.primaryLight),
          );
        }
        return Semantics(
          label: status.label,
          child: Icon(
            Icons.check,
            key: Key('chat_message_status_${message.id}'),
            size: 14,
            color: AppPalette.primaryLight,
          ),
        );
      case ChatMessageStatus.delivered:
        // Две галочки = устройство получило (серверный `deliveredAt`);
        // прочтено отличается цветом и подписью в `readUpTo`/семантике.
        return Semantics(
          label: status.label,
          child: Icon(
            Icons.done_all,
            key: Key('chat_message_status_${message.id}'),
            size: 14,
            color: AppPalette.primaryLight,
          ),
        );
      case ChatMessageStatus.read:
        return Semantics(
          label: status.label,
          child: Icon(
            Icons.done_all,
            key: Key('chat_message_status_${message.id}'),
            size: 14,
            color: AppPalette.primary,
          ),
        );
      case ChatMessageStatus.failed:
        return InkWell(
          key: Key('chat_message_status_${message.id}'),
          onTap: () {
            final String? clientId = message.clientId;
            if (clientId != null) {
              unawaited(
                ref.read(chatThreadProvider(message.chatId).notifier).retry(clientId),
              );
            }
          },
          child: Text(
            status.label,
            style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.dangerText),
          ),
        );
    }
  }
}

/// Вложение: id файла резолвится в URL и имя через `GET /api/files/:id`.
class _AttachmentChip extends ConsumerStatefulWidget {
  const _AttachmentChip({
    required this.fileId,
    required this.messageId,
    required this.mine,
  });

  final String fileId;
  final String messageId;
  final bool mine;

  @override
  ConsumerState<_AttachmentChip> createState() => _AttachmentChipState();
}

class _AttachmentChipState extends ConsumerState<_AttachmentChip> {
  ChatAttachment? _attachment;

  @override
  void initState() {
    super.initState();
    // Файловые запросы — только фоном и best-effort: недоступный файл не должен
    // задерживать отрисовку ленты (урок М6.7 про path_provider на пути отрисовки).
    unawaited(_resolve());
  }

  Future<void> _resolve() async {
    final ChatAttachment? resolved =
        await ref.read(chatAttachmentResolverProvider).resolve(widget.fileId);
    if (!mounted || resolved == null) return;
    setState(() => _attachment = resolved);
  }

  Future<void> _open(ChatAttachment attachment) async {
    final String? url = attachment.url;
    if (url == null) return;
    if (attachment.isImage) {
      await showDialog<void>(
        context: context,
        builder: (BuildContext context) => Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: Stack(
            children: <Widget>[
              Center(
                child: InteractiveViewer(
                  child: Image.network(url, fit: BoxFit.contain),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: SafeArea(
                  child: IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
      return;
    }
    final Uri uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ChatTexts.attachmentOpenFailed)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ChatAttachment? attachment = _attachment;
    final String? preview = attachment == null ? null : (attachment.thumbnailUrl ?? attachment.url);
    // Картинка — превью прямо в пузыре (15.10.2026), по нажатию во весь экран;
    // прочие файлы — строкой с именем, по нажатию открываются внешним приложением.
    if (attachment != null && attachment.isImage && preview != null) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xs),
        child: GestureDetector(
          key: Key('chat_attachment_${widget.messageId}'),
          onTap: () => _open(attachment),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Image.network(
              preview,
              height: 160,
              width: 220,
              fit: BoxFit.cover,
              // Ключ уже на обёртке: второй такой же ключ в запасной строке не нужен.
              errorBuilder: (BuildContext context, Object error, StackTrace? stack) =>
                  _chip(attachment, keyed: false),
            ),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: InkWell(
        onTap: attachment == null ? null : () => _open(attachment),
        child: _chip(attachment),
      ),
    );
  }

  Widget _chip(ChatAttachment? attachment, {bool keyed = true}) {
    return Row(
        key: keyed ? Key('chat_attachment_${widget.messageId}') : null,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            attachment?.isImage == false ? Icons.description_outlined : Icons.photo_outlined,
            size: 16,
            color: widget.mine ? Colors.white : AppPalette.textSecondary,
          ),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(
              attachment == null
                  ? tr('📄 Документ')
                  : '${attachment.label} ${attachment.displayName}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: AppTypography.sizeXS,
                color: widget.mine ? Colors.white : AppPalette.textSecondary,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ],
      );
  }
}

/// Поле ввода, кнопки вложения и отправки (`chat.md` §3.3).
class _Composer extends StatelessWidget {
  const _Composer({
    required this.input,
    required this.onSend,
    required this.onAttach,
    required this.pending,
    required this.uploading,
    required this.onRemoveAttachment,
    required this.hasText,
  });

  final TextEditingController input;
  final Future<void> Function() onSend;
  final Future<void> Function() onAttach;
  final List<PendingAttachment> pending;
  final bool uploading;
  final void Function(int index) onRemoveAttachment;

  /// Кнопка «Отправить» активна при тексте или выбранных вложениях.
  final bool hasText;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppPalette.border)),
      ),
      padding: EdgeInsets.only(
        left: AppSpacing.md,
        right: AppSpacing.md,
        top: AppSpacing.sm,
        // Поле поднимается над клавиатурой (`chat.md` §3.3).
        bottom: AppSpacing.sm + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (pending.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Wrap(
                key: const Key('chat_pending_attachments'),
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: <Widget>[
                  for (int i = 0; i < pending.length; i++)
                    InputChip(
                      key: Key('chat_pending_attachment_$i'),
                      avatar: Icon(pending[i].icon, size: 16),
                      label: Text(pending[i].name, overflow: TextOverflow.ellipsis),
                      onDeleted: uploading ? null : () => onRemoveAttachment(i),
                    ),
                ],
              ),
            ),
          if (uploading)
            const Padding(
              padding: EdgeInsets.only(bottom: AppSpacing.xs),
              child: LinearProgressIndicator(key: Key('chat_upload_progress'), minHeight: 2),
            ),
          Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: <Widget>[
          IconButton(
            key: const Key('chat_attach_button'),
            tooltip: ChatTexts.attachTooltip,
            onPressed: uploading ? null : onAttach,
            icon: const Icon(Icons.attach_file, color: AppPalette.textSecondary),
          ),
          Expanded(
            child: TextField(
              key: const Key('chat_input_field'),
              controller: input,
              minLines: 1,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: ChatTexts.inputHint,
                filled: true,
                fillColor: AppPalette.background,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.lg,
                  vertical: AppSpacing.sm,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  borderSide: BorderSide.none,
                ),
              ),
              style: const TextStyle(fontSize: AppTypography.sizeBASE),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          SizedBox(
            width: 48,
            height: 48,
            child: IconButton.filled(
              key: const Key('chat_send_button'),
              onPressed: hasText && !uploading ? onSend : null,
              style: IconButton.styleFrom(
                backgroundColor: hasText ? AppPalette.primary : AppPalette.surfaceMuted,
                foregroundColor: hasText ? Colors.white : AppPalette.textMuted,
              ),
              icon: const Icon(Icons.send),
            ),
          ),
        ],
          ),
        ],
      ),
    );
  }

}

/// Откуда взять вложение (лист внизу экрана по скрепке).
enum AttachSource { camera, gallery, file }

class AttachSourceSheet extends StatelessWidget {
  const AttachSourceSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ListTile(
            key: const Key('chat_attach_camera'),
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text(ChatTexts.attachCamera),
            onTap: () => Navigator.of(context).pop(AttachSource.camera),
          ),
          ListTile(
            key: const Key('chat_attach_gallery'),
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(ChatTexts.attachGallery),
            onTap: () => Navigator.of(context).pop(AttachSource.gallery),
          ),
          ListTile(
            key: const Key('chat_attach_file'),
            leading: const Icon(Icons.insert_drive_file_outlined),
            title: Text(ChatTexts.attachFile),
            onTap: () => Navigator.of(context).pop(AttachSource.file),
          ),
        ],
      ),
    );
  }
}

/// Выбранный, но ещё не загруженный файл.
class PendingAttachment {
  const PendingAttachment({required this.path, required this.name});

  final String path;
  final String name;

  static const int maxCount = 10;
  static const int maxBytes = 50 * 1024 * 1024;

  /// Те же запреты, что в file-service (`BLOCKED_EXTENSIONS`): исполняемые,
  /// скрипты, html/svg.
  static const List<String> blockedExtensions = <String>[
    '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.ps1', '.sh', '.bash',
    '.js', '.mjs', '.cjs', '.vbs', '.vbe', '.wsf', '.jar', '.php', '.phtml', '.cgi',
    '.html', '.htm', '.xhtml', '.svg', '.svgz', '.hta', '.dll', '.so', '.dmg', '.app',
  ];

  bool get isBlocked {
    final String lower = name.toLowerCase();
    return blockedExtensions.any(lower.endsWith);
  }

  bool get isImage {
    final String lower = name.toLowerCase();
    return const <String>['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp']
        .any(lower.endsWith);
  }

  IconData get icon {
    final String lower = name.toLowerCase();
    if (isImage) return Icons.photo_outlined;
    if (const <String>['.mp4', '.mov', '.webm', '.3gp', '.avi', '.mkv'].any(lower.endsWith)) {
      return Icons.videocam_outlined;
    }
    if (const <String>['.zip', '.rar', '.7z', '.gz'].any(lower.endsWith)) return Icons.folder_zip_outlined;
    return Icons.insert_drive_file_outlined;
  }

  /// `null` — файл годится; иначе текст для пользователя.
  Future<String?> validate() async {
    if (isBlocked) return '«$name»: ${ChatTexts.attachmentBlocked}';
    try {
      final int size = await File(path).length();
      if (size == 0) return '«$name»: ${ChatTexts.attachmentEmpty}';
      if (size > maxBytes) return '«$name»: ${ChatTexts.attachmentTooLarge}';
    } on Object {
      // Размер не узнали (например, content:// без доступа) — пусть решит сервер.
    }
    return null;
  }
}

/// По центру, без пузыря: системное сообщение (`chat.md` §3.2).
class _SystemMessage extends StatelessWidget {
  const _SystemMessage({required this.text, required this.messageId});

  final String text;
  final String messageId;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: Key('chat_message_bubble_$messageId'),
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textSecondary),
      ),
    );
  }
}

class _DayDivider extends StatelessWidget {
  const _DayDivider({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted),
      ),
    );
  }
}

class _HistoryStart extends StatelessWidget {
  const _HistoryStart({required this.hasMore, required this.loading});

  final bool hasMore;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (hasMore) {
      // История ещё есть: на этом конце ленты показываем только индикатор —
      // текста «Загрузка истории…» в `chat.md` §9 нет.
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Center(
          child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Text(
        ChatTexts.historyStart,
        key: const Key('chat_history_start_text'),
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: AppTypography.sizeXS, color: AppPalette.textMuted),
      ),
    );
  }
}

/// Баннер ошибки истории: composer остаётся активным (`chat.md` §5).
class _HistoryError extends ConsumerWidget {
  const _HistoryError({required this.chatId});

  final String chatId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _SendErrorBanner(
      text: ChatTexts.threadLoadError,
      textKey: const Key('chat_history_error_text'),
      action: TextButton(
        key: const Key('chat_history_retry_button'),
        onPressed: () => ref.read(chatThreadProvider(chatId).notifier).retryHistory(),
        child: Text(ChatTexts.retry),
      ),
    );
  }
}

class _SendErrorBanner extends StatelessWidget {
  const _SendErrorBanner({required this.text, required this.textKey, this.action});

  final String text;
  final Key textKey;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppPalette.danger.withValues(alpha: 0.08),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              text,
              key: textKey,
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

/// 403 «Чат недоступен»: `EmptyStateWidget` с кнопкой «К чатам» (`chat.md` §5).
class _ThreadError extends StatelessWidget {
  const _ThreadError({required this.failure});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    final bool forbidden = failure is ForbiddenFailure;
    return ChatEmptyState(
      icon: forbidden ? Icons.lock_outline : Icons.cloud_off_outlined,
      title: forbidden ? ChatTexts.chatUnavailable : ChatTexts.chatTemporarilyUnavailable,
      titleKey: Key(forbidden ? 'chat_forbidden_text' : 'chat_error_text'),
      hint: forbidden ? null : failure.message,
      action: TextButton(
        key: const Key('chat_back_to_list_button'),
        onPressed: () => context.go(AppRoutes.chats),
        child: Text(ChatTexts.backToChats),
      ),
    );
  }
}
