import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/utils/validators.dart';
import '../../../../router/app_router.dart';
import '../../auth_texts.dart';
import '../providers/auth_controller.dart';
import '../providers/auth_providers.dart';
import '../widgets/auth_error_banner.dart';
import '../widgets/auth_header.dart';

/// Экран входа по email и паролю (`/login`) — `design/screens/mobile/auth.md` §3.1, §5.1.
///
/// Ключи элементов — дословно из спецификации и `УСТАВ.md`:
/// `email_field`, `password_field`, `password_toggle`, `submit_button`,
/// `login_pin_button`, `login_biometric_button`, `login_error_text`.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _obscurePassword = true;

  /// Демо-вход лончеров симуляторов (`scripts/launchers/Cleaning-Ops-*.command`):
  /// лончер передаёт `--dart-define=AUTO_LOGIN_EMAIL=…` / `AUTO_LOGIN_PASSWORD=…`,
  /// экран заполняет форму и нажимает «Войти» один раз. Без define значения
  /// пустые — поведение экрана (и юнит-тесты) не меняются.
  static const String _autoEmail = String.fromEnvironment('AUTO_LOGIN_EMAIL');
  static const String _autoPassword = String.fromEnvironment('AUTO_LOGIN_PASSWORD');

  @override
  void initState() {
    super.initState();
    if (_autoEmail.isEmpty || _autoPassword.isEmpty) return;
    // После первого кадра: форма уже прикреплена, validate() внутри _submit
    // увидит заполненные поля.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _emailController.text = _autoEmail;
      _passwordController.text = _autoPassword;
      _submit();
    });
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// Валидация — до сети: «неверный email» не должен уходить на сервер
  /// (`auth.md` §11.1).
  Future<void> _submit() async {
    if (ref.read(authControllerProvider).isSubmitting) return;
    FocusScope.of(context).unfocus();
    final FormState? form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    await ref.read(authControllerProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
    // Переход на /today делает guard роутера: он слушает `sessionProvider`
    // и срабатывает в момент, когда сессия становится авторизованной.
  }

  /// Биометрия — как локальная разблокировка: сначала отпечаток, затем
  /// `POST /api/auth/biometric` с ключом, сохранённым на устройстве (`auth.md` §4.5).
  Future<void> _biometricLogin() async {
    if (ref.read(authControllerProvider).isSubmitting) return;
    final bool confirmed =
        await ref.read(biometricAuthProvider).authenticate(reason: AuthTexts.biometricReason);
    if (!confirmed || !mounted) return;
    await ref.read(authControllerProvider.notifier).loginWithBiometric();
  }

  @override
  Widget build(BuildContext context) {
    final AuthState state = ref.watch(authControllerProvider);
    final bool biometricAvailable =
        ref.watch(biometricAvailabilityProvider).valueOrNull ?? false;
    final bool canSubmit = !state.isSubmitting;

    return Scaffold(
      key: const Key('login_page'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                const SizedBox(height: AppSpacing.xl),
                const AuthHeader(),
                const SizedBox(height: AppSpacing.xl),
                _card(context, state, canSubmit, biometricAvailable),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _card(BuildContext context, AuthState state, bool canSubmit, bool biometricAvailable) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: const Color(AppColors.neutral200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const _FieldLabel(text: '${AuthTexts.emailLabel} *'),
          const SizedBox(height: AppSpacing.sm),
          TextFormField(
            key: const Key('email_field'),
            controller: _emailController,
            enabled: canSubmit,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const <String>[AutofillHints.email],
            autocorrect: false,
            enableSuggestions: false,
            textCapitalization: TextCapitalization.none,
            validator: Validators.email,
            onChanged: (_) => ref.read(authControllerProvider.notifier).clearError(),
            decoration: const InputDecoration(
              hintText: 'operator@cleaning-ops.com',
              isDense: true,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: <Widget>[
              const Expanded(child: _FieldLabel(text: '${AuthTexts.passwordLabel} *')),
              IconButton(
                key: const Key('password_toggle'),
                tooltip: _obscurePassword ? AuthTexts.showPassword : AuthTexts.hidePassword,
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                icon: Icon(
                  _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                ),
              ),
            ],
          ),
          TextFormField(
            key: const Key('password_field'),
            controller: _passwordController,
            enabled: canSubmit,
            obscureText: _obscurePassword,
            autofillHints: const <String>[AutofillHints.password],
            textInputAction: TextInputAction.done,
            validator: (String? value) => Validators.required(value, message: AuthTexts.enterPassword),
            onChanged: (_) => ref.read(authControllerProvider.notifier).clearError(),
            onFieldSubmitted: (_) => _submit(),
          ),
          if (state.errorMessage != null) ...<Widget>[
            const SizedBox(height: AppSpacing.md),
            AuthErrorBanner(
              message: state.errorMessage!,
              textKey: const Key('login_error_text'),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          FilledButton(
            key: const Key('submit_button'),
            onPressed: canSubmit ? _submit : null,
            child: state.isSubmitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text(AuthTexts.signIn),
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(
            key: const Key('login_pin_button'),
            onPressed: canSubmit ? () => context.push(AppRoutes.pin) : null,
            child: const Text(AuthTexts.signInWithPin),
          ),
          if (biometricAvailable) ...<Widget>[
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton.icon(
              key: const Key('login_biometric_button'),
              onPressed: canSubmit ? _biometricLogin : null,
              icon: const Icon(Icons.fingerprint),
              label: const Text(AuthTexts.signInWithBiometrics),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          const Text(
            AuthTexts.forgotPasswordHint,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppTypography.fontSans,
              fontSize: AppTypography.sizeXS,
              color: Color(AppColors.neutral500),
            ),
          ),
        ],
      ),
    );
  }
}

/// Подпись поля: `sizeSM`/`neutral500`, «*» — `danger600` (`auth.md` §6).
class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: AppTypography.fontSans,
        fontSize: AppTypography.sizeSM,
        color: Color(AppColors.neutral500),
      ),
    );
  }
}
