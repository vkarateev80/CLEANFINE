import 'package:flutter/material.dart';

/// Оффлайн-очередь `/offline`: список неотправленных действий и синхронизация.
/// Ключи по `design/screens/mobile/offline.md` (`offline_sync_now_button` и др.).
/// Реализует задача М6.7.
class OfflinePage extends StatelessWidget {
  const OfflinePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('offline_page'),
      appBar: AppBar(title: const Text('Оффлайн-очередь')),
      body: const Center(child: Text('Оффлайн-очередь (М6.7)')),
    );
  }
}
