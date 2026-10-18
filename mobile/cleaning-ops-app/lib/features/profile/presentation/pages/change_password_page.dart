import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../router/app_router.dart';
import '../profile_texts.dart';
import '../providers/profile_providers.dart';

/// Смена пароля `/profile/password` (DS-002 `profile.md` §3.2, §6).
///
/// После успеха сервер отзывает **все** сессии (`auth.service.ts`), поэтому
/// приложение очищает токены (это делает `AuthRepository.changePassword`),
/// показывает «Пароль изменён. Войдите заново.» и уходит на `/login`.
class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  final TextEditingController _repeat = TextEditingController();

  String? _localError;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _repeat.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final ChangePasswordState state = ref.read(changePasswordProvider);
    if (state.isSubmitting) return;
    FocusScope.of(context).unfocus();

    final String current = _current.text;
    final String next = _next.text;
    final String repeat = _repeat.text;

    // Проверки до сети: «Пароли не совпадают» и «Новый пароль должен быть не
    // короче 6 символов» (`profile.md` §4, §9).
    if (next.length < 6) {
      setState(() => _localError = ProfileTexts.shortPassword);
      return;
    }
    if (next != repeat) {
      setState(() => _localError = ProfileTexts.passwordsMismatch);
      return;
    }
    setState(() => _localError = null);

    // Мессенджер берём до await: после выхода из аккаунта страница снимается
    // роутером, а snackbar должен остаться видимым на экране входа.
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final bool ok = await ref.read(changePasswordProvider.notifier).submit(
          currentPassword: current,
          newPassword: next,
        );
    if (!mounted) return;
    if (!ok) return;

    messenger.showSnackBar(SnackBar(content: Text(ProfileTexts.passwordChanged)));
    if (mounted) context.go(AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    final ChangePasswordState state = ref.watch(changePasswordProvider);
    final String? error = _localError ?? state.error;

    return Scaffold(
      key: const Key('change_password_page'),
      appBar: AppBar(title: Text(ProfileTexts.passwordTitle)),
      backgroundColor: AppPalette.background,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: <Widget>[
          _field(
            fieldKey: const Key('current_password_field'),
            label: ProfileTexts.currentPassword,
            controller: _current,
            enabled: !state.isSubmitting,
          ),
          const SizedBox(height: AppSpacing.md),
          _field(
            fieldKey: const Key('new_password_field'),
            label: ProfileTexts.newPassword,
            controller: _next,
            enabled: !state.isSubmitting,
          ),
          const SizedBox(height: AppSpacing.md),
          _field(
            fieldKey: const Key('new_password_repeat_field'),
            label: ProfileTexts.repeatPassword,
            controller: _repeat,
            enabled: !state.isSubmitting,
          ),
          if (error != null) ...<Widget>[
            const SizedBox(height: AppSpacing.md),
            Text(
              error,
              key: const Key('change_password_error_text'),
              style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.dangerText),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          SizedBox(
            height: 48,
            child: FilledButton(
              key: const Key('save_password_button'),
              onPressed: state.isSubmitting ? null : _save,
              child: state.isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(ProfileTexts.save),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field({
    required Key fieldKey,
    required String label,
    required TextEditingController controller,
    required bool enabled,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          label,
          style: const TextStyle(fontSize: AppTypography.sizeSM, color: AppPalette.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        TextFormField(
          key: fieldKey,
          controller: controller,
          enabled: enabled,
          obscureText: true,
          onChanged: (_) => setState(() => _localError = null),
        ),
      ],
    );
  }
}
