import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/i18n/app_language.dart';

/// Пустое состояние экрана чата (DS-002 `chat.md` §5).
///
/// Ключ передаётся снаружи: у списка чатов он `chats_empty_text`, у ленты —
/// подсказка «Напишите первое сообщение».
class ChatEmptyState extends StatelessWidget {
  const ChatEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.titleKey,
    this.hint,
    this.action,
  });

  final IconData icon;
  final String title;
  final Key? titleKey;
  final String? hint;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 56, color: AppPalette.textMuted),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              key: titleKey,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: AppTypography.sizeLG, fontWeight: FontWeight.w600),
            ),
            if (hint != null) ...<Widget>[
              const SizedBox(height: AppSpacing.sm),
              Text(
                hint!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: AppTypography.sizeSM,
                  color: AppPalette.textSecondary,
                ),
              ),
            ],
            if (action != null) ...<Widget>[const SizedBox(height: AppSpacing.lg), action!],
          ],
        ),
      ),
    );
  }
}

/// Состояние ошибки с кнопкой «Повторить» (`chat.md` §5).
class ChatErrorState extends StatelessWidget {
  const ChatErrorState({
    super.key,
    required this.message,
    required this.onRetry,
    this.textKey,
    this.icon = Icons.error_outline,
  });

  final String message;
  final Key? textKey;
  final IconData icon;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      // Ошибку тоже можно потянуть вниз — жестом пользователь ожидает retry.
      physics: const AlwaysScrollableScrollPhysics(),
      children: <Widget>[
        SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
        ChatEmptyState(
          icon: icon,
          title: message,
          titleKey: textKey,
          action: FilledButton(
            key: const Key('chat_retry_button'),
            onPressed: onRetry,
            child: Text(tr('Повторить')),
          ),
        ),
      ],
    );
  }
}

/// Скелетон списка чатов: 4 строки высотой 72 (`chat.md` §5).
class ChatListSkeleton extends StatelessWidget {
  const ChatListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      key: const Key('chats_skeleton'),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 4,
      itemBuilder: (BuildContext context, int index) => Container(
        height: 72,
        margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          color: AppPalette.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
      ),
    );
  }
}

/// Скелетон ленты: 4 пузыря с чередованием сторон (`chat.md` §5).
class ChatThreadSkeleton extends StatelessWidget {
  const ChatThreadSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      key: const Key('chat_thread_skeleton'),
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 4,
      itemBuilder: (BuildContext context, int index) {
        final bool mine = index.isOdd;
        return Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            height: 56,
            width: MediaQuery.sizeOf(context).width * (index.isEven ? 0.7 : 0.5),
            margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
            decoration: BoxDecoration(
              color: AppPalette.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
          ),
        );
      },
    );
  }
}
