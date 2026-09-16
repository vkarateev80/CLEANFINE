import 'package:flutter/material.dart';

/// Список чатов оператора (заявка, объект, direct).
/// Реализует задача М6.8 по `design/screens/mobile/chat.md`.
class ChatsPage extends StatelessWidget {
  const ChatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('chats_page'),
      appBar: AppBar(title: const Text('Чат')),
      body: const Center(child: Text('Список чатов (М6.8)')),
    );
  }
}
