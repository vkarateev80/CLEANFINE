import 'package:flutter/material.dart';

/// Установка/смена PIN (`/pin/setup`).
/// Ключи по `design/screens/mobile/auth.md`: `pin_save_button`, `pin_forgot_button`.
class PinSetupPage extends StatelessWidget {
  const PinSetupPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('pin_setup_page'),
      appBar: AppBar(title: const Text('Установка PIN')),
      body: const Center(child: Text('Установка PIN (М6.2)')),
    );
  }
}
