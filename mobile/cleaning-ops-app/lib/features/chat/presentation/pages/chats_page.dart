import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/failures.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../../../../shared/widgets/offline_banner.dart';
import '../../../../shared/widgets/sync_status_widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/models/chat_models.dart';
import '../chat_texts.dart';
import '../providers/chat_providers.dart';
import '../widgets/chat_states.dart';

/// Список чатов оператора `/chats` (М6.8, DS-002 `chat.md` §2.1, §3.1).
///
/// Чаты, где оператор не участник, сюда не попадают: список приходит с сервера
/// (`GET /api/chat/chats` — **голый массив**, не `{items}`). Индикаторы оффлайна
/// (`offline.md` §2) живут здесь же: баннер и счётчик очереди.
class ChatsPage extends ConsumerStatefulWidget {
  const ChatsPage({super.key});

  @override
  ConsumerState<ChatsPage> createState() => _ChatsPageState();
}

class _ChatsPageState extends ConsumerState<ChatsPage> {
  @override
  void initState() {
    super.initState();
    // Список открыт — значит переписка закрыта: входящие снова считаются
    // непрочитанными (`chat.md` §3.1). После кадра: в `initState` менять
    // провайдер Riverpod запрещает.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(activeChatIdProvider.notifier).state = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<ChatSummary>> chats = ref.watch(chatsListProvider);

    return Scaffold(
      key: const Key('chats_page'),
      appBar: AppBar(
        title: const Text(ChatTexts.listTitle),
        actions: const <Widget>[SyncStatusCounter(statusKey: Key('chats_sync_status'))],
      ),
      backgroundColor: AppPalette.background,
      body: Column(
        children: <Widget>[
          const OfflineBanner(bannerKey: Key('chats_offline_banner')),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.read(chatsListProvider.notifier).refresh(),
              child: chats.when(
                loading: () => const ChatListSkeleton(),
                error: (Object error, StackTrace stack) => ChatErrorState(
                  message: ChatTexts.chatsLoadError,
                  textKey: const Key('chats_error_text'),
                  onRetry: () => ref.invalidate(chatsListProvider),
                  icon: error is ForbiddenFailure
                      ? Icons.lock_outline
                      : Icons.cloud_off_outlined,
                ),
                data: (List<ChatSummary> value) =>
                    value.isEmpty ? const _EmptyChats() : _ChatsList(chats: value),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Пустое состояние: чатов нет (`chat.md` §5, §10.4).
class _EmptyChats extends StatelessWidget {
  const _EmptyChats();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const <Widget>[
        SizedBox(height: 120),
        ChatEmptyState(
          icon: Icons.forum_outlined,
          title: ChatTexts.emptyChats,
          titleKey: Key('chats_empty_text'),
          hint: ChatTexts.emptyChatsHint,
        ),
      ],
    );
  }
}

class _ChatsList extends StatelessWidget {
  const _ChatsList({required this.chats});

  final List<ChatSummary> chats;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      key: const Key('chats_list'),
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: chats.length,
      itemBuilder: (BuildContext context, int index) => _ChatTile(chat: chats[index]),
    );
  }
}

/// Строка чата: иконка типа, заголовок, превью последнего сообщения, время и
/// бейдж непрочитанных (`chat.md` §3.1, §6).
class _ChatTile extends ConsumerWidget {
  const _ChatTile({required this.chat});

  final ChatSummary chat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // «Вы: {текст}» — префикс только у своих сообщений, поэтому нужен мой id.
    final String meId = ref.watch(sessionProvider).userId ?? '';
    // Именно `Material`, а не `Container(color:)`: ListTile рисует фон и
    // всплеск нажатия на ближайшем Material, и цветной контейнер их бы скрыл.
    return Material(
      color: AppPalette.surface,
      child: Column(
        children: <Widget>[
          ListTile(
            key: Key('chat_tile_${chat.id}'),
            leading: CircleAvatar(
              backgroundColor: AppPalette.primaryLight,
              child: Icon(_icon(chat.type), color: AppPalette.primaryDark, size: 20),
            ),
            title: Text(
              chatTitle(chat),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: AppTypography.sizeBASE,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: Text(
              previewText(chat, meId),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: AppTypography.sizeSM,
                color: AppPalette.textSecondary,
              ),
            ),
            trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Text(
                  listTimeLabel(chat.lastMessage?.createdAt ?? chat.createdAt, DateTime.now()),
                  style: const TextStyle(
                    fontSize: AppTypography.sizeXS,
                    color: AppPalette.textMuted,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                if (chat.hasUnread)
                  Badge(
                    key: Key('chat_unread_badge_${chat.id}'),
                    backgroundColor: AppPalette.primary,
                    textColor: Colors.white,
                    label: Text('${chat.unreadCount}'),
                  )
                else
                  const SizedBox(height: 16),
              ],
            ),
            onTap: () => context.push(AppRoutes.chatThreadFor(chat.id)),
          ),
          const Divider(height: 1, color: AppPalette.border),
        ],
      ),
    );
  }

  /// Иконка типа чата (`chat.md` §3.1).
  static IconData _icon(String type) => switch (type) {
        ChatTypes.object => Icons.business,
        ChatTypes.ticket => Icons.receipt_long,
        ChatTypes.direct => Icons.person,
        ChatTypes.system => Icons.campaign,
        _ => Icons.chat_bubble_outline,
      };
}

/// Заголовок строки: серверный `title`, иначе — правило по типу (`chat.md` §3.1).
String chatTitle(ChatSummary chat) {
  final String? title = chat.title;
  if (title != null && title.isNotEmpty) return title;
  return ChatTexts.titleForType(chat.type);
}

/// Превью последнего сообщения: «Вы: {текст}» для своих, иначе просто текст.
String previewText(ChatSummary chat, String meId) {
  final LastMessagePreview? last = chat.lastMessage;
  if (last == null || last.text.isEmpty) return ChatTexts.noMessages;
  final String prefix = meId.isNotEmpty && last.authorId == meId ? ChatTexts.youPrefix : '';
  return '$prefix${last.text}';
}

/// Время в списке: сегодня — `HH:mm`, вчера — «Вчера», раньше — `dd.MM`.
String listTimeLabel(DateTime? value, DateTime now) {
  if (value == null) return '';
  final DateTime local = value.toLocal();
  final DateTime today = DateTime(now.year, now.month, now.day);
  final DateTime day = DateTime(local.year, local.month, local.day);
  final int diff = today.difference(day).inDays;
  if (diff == 0) return timeLabel(local);
  if (diff == 1) return ChatTexts.yesterday;
  return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}';
}

/// Разделитель дня в ленте: «Сегодня» / «Вчера» / `dd.MM.yyyy` (`chat.md` §3.2).
String dayLabel(DateTime value, DateTime now) {
  final DateTime local = value.toLocal();
  final DateTime today = DateTime(now.year, now.month, now.day);
  final DateTime day = DateTime(local.year, local.month, local.day);
  final int diff = today.difference(day).inDays;
  if (diff == 0) return ChatTexts.today;
  if (diff == 1) return ChatTexts.yesterday;
  return '${local.day.toString().padLeft(2, '0')}.'
      '${local.month.toString().padLeft(2, '0')}.${local.year}';
}

/// «10:42» — время внутри пузыря (`chat.md` §3.2).
String timeLabel(DateTime? value) {
  if (value == null) return '';
  final DateTime local = value.toLocal();
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
