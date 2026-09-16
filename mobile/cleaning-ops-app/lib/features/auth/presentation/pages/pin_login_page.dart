import 'package:flutter/material.dart';

/// Вход по PIN (4–6 цифр). Элементы и ключи — по `design/screens/mobile/auth.md`
/// (`pin_submit_button`, `pin_digit_0`…, `pin_delete_button`, `pin_biometric_button`).
class PinLoginPage extends StatelessWidget {
  const PinLoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('pin_page'),
      appBar: AppBar(title: const Text('Вход по PIN')),
      body: const Center(child: Text('Вход по PIN (М6.2)')),
    );
  }
}
