import 'package:flutter/material.dart';

/// Переписка в чате: история, отправка, доставка и прочтение.
/// Реализует задача М6.8 по `design/screens/mobile/chat.md`.
class ChatThreadPage extends StatelessWidget {
  const ChatThreadPage({super.key, required this.chatId});

  /// id чата (chat-service `Chat`).
  final String chatId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('chat_thread_page'),
      appBar: AppBar(title: const Text('Переписка')),
      body: Center(child: Text('Чат $chatId (М6.8)')),
    );
  }
}
