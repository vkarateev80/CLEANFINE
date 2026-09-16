import 'package:flutter/material.dart';

/// Экран запуска: пока читаются токены из защищённого хранилища.
/// Владелец задачи — М6.2 (авторизация).
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      key: Key('splash_page'),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.cleaning_services_outlined, size: 64),
            SizedBox(height: 16),
            Text('Cleaning Ops'),
            SizedBox(height: 16),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
