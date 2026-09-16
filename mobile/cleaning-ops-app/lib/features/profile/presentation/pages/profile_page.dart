import 'package:flutter/material.dart';

/// Профиль оператора: ФИО, аватар, смена PIN/пароля, статус GPS, выход.
/// Реализует задача М6.8 по `design/screens/mobile/profile.md`.
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('profile_page'),
      appBar: AppBar(title: const Text('Профиль')),
      body: const Center(child: Text('Профиль (М6.8)')),
    );
  }
}
