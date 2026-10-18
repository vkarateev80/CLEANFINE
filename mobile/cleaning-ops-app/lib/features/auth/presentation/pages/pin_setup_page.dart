import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/utils/validators.dart';
import '../../../../router/app_router.dart';
import '../../auth_texts.dart';
import '../providers/auth_controller.dart';
import '../providers/session_provider.dart';
import '../widgets/auth_error_banner.dart';
import '../widgets/auth_header.dart';

/// Установка/смена PIN (`/pin/setup`) — `design/screens/mobile/auth.md` §3.3, §5.3.
///
/// Ключи: `pin_current_password_field`, `pin_new_field`, `pin_repeat_field`,
/// `pin_setup_error_text`, `pin_save_button`.
///
/// Ограничение API (`auth.md` п. 10.2, README сводка № 2): `POST /api/auth/change-pin`
/// требует `currentPassword` **и** валидный access-токен (`@ApiBearerAuth`).
/// Эндпоинта «установить первый PIN» в auth-service нет, поэтому войти сюда без
/// активной сессии можно (маршрут вне guard'а), но сохранить PIN — нельзя:
/// экран честно объясняет, что нужен вход по паролю, и не выдумывает эндпоинт.
class PinSetupPage extends ConsumerStatefulWidget {
  const PinSetupPage({super.key});

  @override
  ConsumerState<PinSetupPage> createState() => _PinSetupPageState();
}

class _PinSetupPageState extends ConsumerState<PinSetupPage> {
  final TextEditingController _currentPasswordController = TextEditingController();
  final TextEditingController _newPinController = TextEditingController();
  final TextEditingController _repeatPinController = TextEditingController();

  /// Ошибка клиентской проверки; серверная приходит из [AuthState.errorMessage].
  String? _localError;

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPinController.dispose();
    _repeatPinController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (ref.read(authControllerProvider).isSubmitting) return;
    FocusScope.of(context).unfocus();

    final String currentPassword = _currentPasswordController.text;
    final String newPin = _newPinController.text.trim();
    final String repeatPin = _repeatPinController.text.trim();

    final String? clientError = _validate(
      currentPassword: currentPassword,
      newPin: newPin,
      repeatPin: repeatPin,
    );
    if (clientError != null) {
      setState(() => _localError = clientError);
      ref.read(authControllerProvider.notifier).clearError();
      return;
    }
    setState(() => _localError = null);

    // Без активной сессии сервер ответит 401 на сам change-pin: сначала пароль.
    if (!ref.read(sessionProvider).isAuthenticated) {
      setState(() => _localError = AuthTexts.pinNotSet);
      return;
    }

    final bool saved = await ref.read(authControllerProvider.notifier).changePin(
          currentPassword: currentPassword,
          newPin: newPin,
        );
    if (!mounted) return;

    if (saved) {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AppRoutes.profile);
      }
    }
  }

  /// Клиентская проверка (§4.4): пароль непустой, PIN 4–6 цифр, повторы совпадают.
  String? _validate({
    required String currentPassword,
    required String newPin,
    required String repeatPin,
  }) {
    if (currentPassword.isEmpty) return AuthTexts.enterPassword;
    final String? pinError = Validators.pin(newPin);
    if (pinError != null) return AuthTexts.pinFormat;
    if (newPin != repeatPin) return AuthTexts.pinMismatch;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final AuthState state = ref.watch(authControllerProvider);
    final bool authenticated = ref.watch(sessionProvider).isAuthenticated;
    final String? error = _localError ?? state.errorMessage;
    final bool canSubmit = !state.isSubmitting;

    return Scaffold(
      key: const Key('pin_setup_page'),
      appBar: AppBar(title: Text(AuthTexts.pinSetupTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const AuthHeader(subtitle: ''),
              const SizedBox(height: AppSpacing.lg),
              if (!authenticated) ...<Widget>[
                _loginRequiredNotice(),
                const SizedBox(height: AppSpacing.lg),
              ],
              _passwordField(canSubmit),
              const SizedBox(height: AppSpacing.md),
              _pinField(
                controller: _newPinController,
                fieldKey: const Key('pin_new_field'),
                label: AuthTexts.newPinLabel,
                enabled: canSubmit,
              ),
              const SizedBox(height: AppSpacing.md),
              _pinField(
                controller: _repeatPinController,
                fieldKey: const Key('pin_repeat_field'),
                label: AuthTexts.repeatPinLabel,
                enabled: canSubmit,
              ),
              if (error != null) ...<Widget>[
                const SizedBox(height: AppSpacing.md),
                AuthErrorBanner(
                  message: error,
                  textKey: const Key('pin_setup_error_text'),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                key: const Key('pin_save_button'),
                onPressed: canSubmit ? _save : null,
                child: state.isSubmitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(AuthTexts.savePin),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                AuthTexts.pinStoredOnServer,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: AppTypography.fontSans,
                  fontSize: AppTypography.sizeXS,
                  color: Color(AppColors.neutral500),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _passwordField(bool enabled) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          '${AuthTexts.currentPasswordLabel} *',
          style: const TextStyle(
            fontFamily: AppTypography.fontSans,
            fontSize: AppTypography.sizeSM,
            color: Color(AppColors.neutral500),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        TextFormField(
          key: const Key('pin_current_password_field'),
          controller: _currentPasswordController,
          enabled: enabled,
          obscureText: true,
          onChanged: (_) => setState(() => _localError = null),
        ),
      ],
    );
  }

  Widget _pinField({
    required TextEditingController controller,
    required Key fieldKey,
    required String label,
    required bool enabled,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          '$label *',
          style: const TextStyle(
            fontFamily: AppTypography.fontSans,
            fontSize: AppTypography.sizeSM,
            color: Color(AppColors.neutral500),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        TextFormField(
          key: fieldKey,
          controller: controller,
          enabled: enabled,
          keyboardType: TextInputType.number,
          maxLength: 6,
          obscureText: true,
          onChanged: (_) => setState(() => _localError = null),
          decoration: const InputDecoration(counterText: ''),
        ),
      ],
    );
  }

  /// Объяснение ограничения API вместо несуществующего эндпоинта (§10.2).
  Widget _loginRequiredNotice() {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: const Color(AppColors.warning500)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Icon(Icons.info_outline, size: 20, color: Color(AppColors.warning600)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  AuthTexts.pinSetupNeedsPassword,
                  style: const TextStyle(
                    fontFamily: AppTypography.fontSans,
                    fontSize: AppTypography.sizeSM,
                    color: Color(AppColors.warning600),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(
            key: const Key('pin_setup_login_button'),
            onPressed: () => context.go(AppRoutes.login),
            child: Text(AuthTexts.signInWithPassword),
          ),
        ],
      ),
    );
  }
}