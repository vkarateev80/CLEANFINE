import 'dart:async';
import 'dart:io';

import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../auth/data/models/auth_user.dart';
import '../profile_formatters.dart';
import '../profile_texts.dart';
import '../providers/profile_providers.dart';

/// Карточка пользователя (DS-002 `profile.md` §3.1, §6).
///
/// ФИО, роль, email и телефон не редактируются: их меняет администратор
/// (`profile.md` §1). Аватар загружается через file-service, но записать
/// `avatarUrl` в профиль нечем (п. 10.1) — поэтому показываем выбранный файл
/// локально и кэшируем его на устройстве.
class ProfileCard extends ConsumerStatefulWidget {
  const ProfileCard({super.key, required this.user});

  final AuthUser user;

  @override
  ConsumerState<ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends ConsumerState<ProfileCard> {
  /// Локально выбранный аватар: `avatarUrl` сервера остаётся прежним.
  String? _localAvatarUrl;
  File? _cachedAvatar;

  @override
  void initState() {
    super.initState();
    // Кэш аватара — фоном и best-effort: `path_provider` не должен задерживать
    // отрисовку (урок М6.7).
    unawaited(_loadCachedAvatar());
  }

  Future<void> _loadCachedAvatar() async {
    final File? file = await ref.read(avatarCacheProvider).file(widget.user.id);
    if (!mounted || file == null) return;
    setState(() => _cachedAvatar = file);
  }

  Future<void> _changePhoto() async {
    final ImageSource? source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (BuildContext sheetContext) => SafeArea(
        key: const Key('profile_avatar_sheet'),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ListTile(
              key: const Key('profile_avatar_camera'),
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text(ProfileTexts.camera),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              key: const Key('profile_avatar_gallery'),
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text(ProfileTexts.gallery),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    final String? path = await ref.read(photoPickerProvider).pick(source);
    if (path == null || !mounted) return;

    try {
      final String? url = await ref.read(profileProvider.notifier).uploadAvatar(path);
      if (!mounted) return;
      if (url != null) setState(() => _localAvatarUrl = url);
      // Кэш `{avatars_dir}/{userId}.jpg` — фоном, ошибка не важна (`profile.md` §3.1).
      unawaited(ref.read(avatarCacheProvider).save(widget.user.id, path));
    } on ProfileActionException catch (error) {
      if (!mounted) return;
      _showMessage('${ProfileTexts.photoRejected}: ${error.message}');
    }
  }

  void _showMessage(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final AuthUser user = widget.user;
    final String phone = formatPhone(user.phone);

    return Card(
      key: const Key('profile_card'),
      elevation: 0,
      color: AppPalette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        side: const BorderSide(color: AppPalette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _avatar(user),
                const SizedBox(width: AppSpacing.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        user.fullName.isEmpty ? user.email : user.fullName,
                        key: const Key('profile_name_text'),
                        style: const TextStyle(
                          fontSize: AppTypography.sizeLG,
                          fontWeight: FontWeight.w500,
                          color: AppPalette.textPrimary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      // Роль и email — одной строкой, но двумя виджетами: роль
                      // должна находиться отдельным текстом (`profile.md` §10.4:
                      // `role = 'OPERATOR'` → `find.text('Оператор')`).
                      Row(
                        children: <Widget>[
                          Text(
                            RoleLabels.of(user.role),
                            key: const Key('profile_role_text'),
                            style: const TextStyle(
                              fontSize: AppTypography.sizeSM,
                              color: AppPalette.textSecondary,
                            ),
                          ),
                          if (user.email.isNotEmpty)
                            Flexible(
                              child: Text(
                                ' · ${user.email}',
                                key: const Key('profile_email_text'),
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: AppTypography.sizeSM,
                                  color: AppPalette.textSecondary,
                                ),
                              ),
                            ),
                        ],
                      ),
                      if (phone.isNotEmpty) ...<Widget>[
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          phone,
                          key: const Key('profile_phone_text'),
                          style: const TextStyle(
                            fontSize: AppTypography.sizeSM,
                            color: AppPalette.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('profile_avatar_button'),
                onPressed: _changePhoto,
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text(ProfileTexts.changePhoto),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// `CircleAvatar(radius: 32)`: сетевой аватар, кэш устройства или инициалы.
  Widget _avatar(AuthUser user) {
    final String? networkUrl = _localAvatarUrl ?? user.avatarUrl;
    final File? cached = _cachedAvatar;
    final Widget fallback = Container(
      width: 64,
      height: 64,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: AppPalette.primaryLight, shape: BoxShape.circle),
      child: Text(
        initialsOf(user.fullName.isEmpty ? user.email : user.fullName),
        style: const TextStyle(
          fontSize: AppTypography.sizeXL,
          color: AppPalette.primaryDark,
          fontWeight: FontWeight.w600,
        ),
      ),
    );

    return ClipOval(
      child: SizedBox(
        width: 64,
        height: 64,
        child: networkUrl != null && networkUrl.isNotEmpty
            ? Image.network(
                networkUrl,
                key: const Key('profile_avatar_image'),
                fit: BoxFit.cover,
                loadingBuilder: (BuildContext context, Widget child, ImageChunkEvent? progress) {
                  if (progress == null) return child;
                  // Пока сетевой аватар грузится, показываем кэш или инициалы.
                  return cached != null ? Image.file(cached, fit: BoxFit.cover) : fallback;
                },
                errorBuilder: (BuildContext context, Object error, StackTrace? stack) => fallback,
              )
            : (cached != null
                ? Image.file(
                    cached,
                    key: const Key('profile_avatar_image'),
                    fit: BoxFit.cover,
                    errorBuilder: (BuildContext context, Object error, StackTrace? stack) => fallback,
                  )
                : fallback),
      ),
    );
  }
}
