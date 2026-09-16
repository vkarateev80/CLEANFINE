import 'package:flutter/material.dart';

/// Чек-лист помещения внутри маршрута: `/route/:eventId/room/:roomId`.
/// Ключи по `design/screens/mobile/checklist.md`. Реализует задача М6.4.
class ChecklistPage extends StatelessWidget {
  const ChecklistPage({super.key, required this.eventId, required this.roomId});

  /// id смены (`ScheduleEvent`).
  final String eventId;

  /// id помещения (core `Room`).
  final String roomId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('checklist_page'),
      appBar: AppBar(title: const Text('Чек-лист')),
      body: Center(child: Text('Чек-лист помещения $roomId (смена $eventId, М6.4)')),
    );
  }
}
