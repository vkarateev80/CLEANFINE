import 'package:flutter/material.dart';

/// Экран входа по email и паролю.
///
/// Заготовка М6.0: реальные поля, валидация (`Validators.email`,
/// сообщение «Введите корректный email»), вход через `AuthRepository` и переход
/// на PIN/биометрию реализует задача М6.2 по спецификации `design/screens/mobile/auth.md`.
class LoginPage extends StatelessWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('login_page'),
      appBar: AppBar(title: const Text('Вход')),
      body: const Center(child: Text('Экран входа (М6.2)')),
    );
  }
}
