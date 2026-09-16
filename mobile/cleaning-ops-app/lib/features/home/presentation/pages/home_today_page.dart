import 'package:flutter/material.dart';

/// Главный экран `/today`: смена на сегодня, check-in/check-out, заявки,
/// переход к маршруту. Ключи по `design/screens/mobile/home_today.md`.
/// Реализует задача М6.3.
class HomeTodayPage extends StatelessWidget {
  const HomeTodayPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('today_page'),
      appBar: AppBar(title: const Text('Сегодня')),
      body: const Center(child: Text('Главный экран (М6.3)')),
    );
  }
}
