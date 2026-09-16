import 'package:flutter/material.dart';

/// Маршрут дня: план этажа и точки по помещениям.
/// Реализует задача М6.3 по `design/screens/mobile/route_map.md`.
class RouteMapPage extends StatelessWidget {
  const RouteMapPage({super.key, required this.eventId});

  /// id смены (`ScheduleEvent`), к которой привязан маршрут.
  final String eventId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('route_map_page'),
      appBar: AppBar(title: const Text('Маршрут')),
      body: Center(child: Text('Маршрут смены $eventId (М6.3)')),
    );
  }
}
