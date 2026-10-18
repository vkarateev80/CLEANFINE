import 'package:cleaning_ops_tokens/app_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../router/app_router.dart';
import '../../auth_texts.dart';
import '../../data/models/pin_credentials.dart';
import '../providers/auth_controller.dart';
import '../providers/auth_providers.dart';
import '../widgets/auth_error_banner.dart';
import '../widgets/auth_header.dart';

/// Ввод PIN (`/pin`) — `design/screens/mobile/auth.md` §3.2, §5.2.
///
/// Клавиатура собственная (3×4): системная не используется — исключает
/// автозамену и ускоряет ввод в перчатках. Ключи: `pin_dots`, `pin_hint_text`,
/// `pin_digit_0`…`pin_digit_9`, `pin_delete_button`, `pin_biometric_button`,
/// `pin_submit_button`, `pin_error_text`, `pin_forgot_button`.
class PinLoginPage extends ConsumerStatefulWidget {
  const PinLoginPage({super.key});

  @override
  ConsumerState<PinLoginPage> createState() => _PinLoginPageState();
}

class _PinLoginPageState extends ConsumerState<PinLoginPage> {
  /// Разрешённый максимум цифр: сервер допускает 4–6 (`pin-login.dto.ts`).
  static const int _maxDigits = 6;
  static const int _minDigits = 4;

  String _pin = '';

  void _appendDigit(String digit) {
    if (ref.read(authControllerProvider).isSubmitting) return;
    if (_pin.length >= _maxDigits) return;
    setState(() => _pin += digit);
    ref.read(authControllerProvider.notifier).clearError();

    // Автоотправка: длину PIN устройство знает (`pin_length`), на чужом
    // устройстве она неизвестна — тогда работает кнопка «Войти» (§4.3).
    final int? knownLength = ref.read(pinCredentialsAsyncProvider).valueOrNull?.length;
    if (knownLength != null && _pin.length == knownLength) {
      _submit();
    }
  }

  void _deleteDigit() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
    ref.read(authControllerProvider.notifier).clearError();
  }

  Future<void> _submit() async {
    if (_pin.length < _minDigits) return;
    if (ref.read(authControllerProvider).isSubmitting) return;

    await ref.read(authControllerProvider.notifier).loginWithPin(pin: _pin);
    if (!mounted) return;

    // Неверный PIN: поле очищается, фокус остаётся на клавиатуре (§4.3).
    if (ref.read(authControllerProvider).hasError) {
      setState(() => _pin = '');
    }
  }

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
    final PinCredentials? credentials = ref.watch(pinCredentialsAsyncProvider).valueOrNull;
    final bool biometricAvailable =
        ref.watch(biometricAvailabilityProvider).valueOrNull ?? false;
    final String? identity = credentials?.email ?? credentials?.phone;
    final int dots = credentials?.length ?? _maxDigits;
    final bool canSubmit = _pin.length >= _minDigits && !state.isSubmitting;

    return Scaffold(
      key: const Key('pin_page'),
      appBar: AppBar(title: Text(AuthTexts.pinTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const AuthHeader(subtitle: ''),
              if (identity != null) ...<Widget>[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  maskIdentity(identity),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: AppTypography.fontSans,
                    fontSize: AppTypography.sizeSM,
                    color: Color(AppColors.neutral500),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              _dots(filled: _pin.length, total: dots),
              const SizedBox(height: AppSpacing.sm),
              Text(
                AuthTexts.pinHint,
                key: const Key('pin_hint_text'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: AppTypography.fontSans,
                  fontSize: AppTypography.sizeSM,
                  color: Color(AppColors.neutral500),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              _keypad(biometricAvailable: biometricAvailable),
              if (state.errorMessage != null) ...<Widget>[
                const SizedBox(height: AppSpacing.lg),
                AuthErrorBanner(
                  message: state.errorMessage!,
                  textKey: const Key('pin_error_text'),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                key: const Key('pin_submit_button'),
                // `onPressed: null` при < 4 цифр — это проверяет widget-тест (§11.3).
                onPressed: canSubmit ? _submit : null,
                child: state.isSubmitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Text(AuthTexts.signIn),
              ),
              TextButton(
                key: const Key('pin_forgot_button'),
                onPressed: state.isSubmitting ? null : () => context.push(AppRoutes.pinSetup),
                child: Text(AuthTexts.forgotPin),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Индикатор: заполненная точка `primary500`, пустая `neutral300` (§4.3).
  Widget _dots({required int filled, required int total}) {
    final int count = total < _minDigits ? _maxDigits : total;
    return Row(
      key: const Key('pin_dots'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: List<Widget>.generate(count, (int index) {
        return Container(
          width: 16,
          height: 16,
          margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: index < filled
                ? const Color(AppColors.primary500)
                : const Color(AppColors.neutral300),
          ),
        );
      }),
    );
  }

  Widget _keypad({required bool biometricAvailable}) {
    return Column(
      children: <Widget>[
        _keypadRow(<Widget>[_digitButton(1), _digitButton(2), _digitButton(3)]),
        const SizedBox(height: AppSpacing.sm),
        _keypadRow(<Widget>[_digitButton(4), _digitButton(5), _digitButton(6)]),
        const SizedBox(height: AppSpacing.sm),
        _keypadRow(<Widget>[_digitButton(7), _digitButton(8), _digitButton(9)]),
        const SizedBox(height: AppSpacing.sm),
        _keypadRow(<Widget>[
          // Биометрия — левый нижний угол; без сохранённого ключа ячейка пуста,
          // кнопки нет вовсе (§4.3, §11.4).
          if (biometricAvailable) _biometricButton() else const SizedBox.shrink(),
          _digitButton(0),
          _deleteButton(),
        ]),
      ],
    );
  }

  Widget _keypadRow(List<Widget> cells) {
    return Row(
      children: <Widget>[
        for (int index = 0; index < cells.length; index++) ...<Widget>[
          if (index > 0) const SizedBox(width: AppSpacing.sm),
          Expanded(child: SizedBox(height: 64, child: cells[index])),
        ],
      ],
    );
  }

  Widget _digitButton(int digit) {
    return _KeypadButton(
      key: Key('pin_digit_$digit'),
      onPressed: () => _appendDigit('$digit'),
      child: Text(
        '$digit',
        style: const TextStyle(
          fontFamily: AppTypography.fontSans,
          fontSize: AppTypography.size2XL,
          fontWeight: FontWeight.w500,
          color: Color(AppColors.neutral900),
        ),
      ),
    );
  }

  Widget _deleteButton() {
    return _KeypadButton(
      key: const Key('pin_delete_button'),
      onPressed: _deleteDigit,
      child: const Icon(Icons.backspace_outlined, color: Color(AppColors.neutral900)),
    );
  }

  Widget _biometricButton() {
    return _KeypadButton(
      key: const Key('pin_biometric_button'),
      onPressed: _biometricLogin,
      child: const Icon(Icons.fingerprint, color: Color(AppColors.primary600)),
    );
  }
}

/// Кнопка клавиатуры PIN: `neutral100` на фоне, `AppRadius.lg`, нажатие — `primary100`.
class _KeypadButton extends StatelessWidget {
  const _KeypadButton({super.key, required this.child, required this.onPressed});

  final Widget child;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(AppColors.neutral100),
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        onTap: onPressed,
        child: Center(child: child),
      ),
    );
  }
}

/// Маскировка email/телефона на экране PIN (`auth.md` §3.2: «маскируется»).
String maskIdentity(String value) {
  final int at = value.indexOf('@');
  if (at <= 0) {
    // Телефон: оставляем последние две цифры.
    if (value.length <= 4) return value;
    final String hidden = List<String>.filled(value.length - 2, '•').join();
    return '$hidden${value.substring(value.length - 2)}';
  }
  final String name = value.substring(0, at);
  final String domain = value.substring(at);
  final String visible = name.length <= 2 ? name.substring(0, 1) : name.substring(0, 2);
  return '$visible•••$domain';
}
