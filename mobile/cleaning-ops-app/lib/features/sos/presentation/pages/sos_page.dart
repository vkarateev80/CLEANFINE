import 'package:flutter/material.dart';

/// Аварийная заявка (SOS): тип, обязательное фото, описание, локация.
/// Реализует задача М6.5 по `design/screens/mobile/sos.md`.
class SosPage extends StatelessWidget {
  const SosPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('sos_page'),
      appBar: AppBar(title: const Text('Аварийная заявка')),
      body: const Center(child: Text('SOS (М6.5)')),
    );
  }
}
