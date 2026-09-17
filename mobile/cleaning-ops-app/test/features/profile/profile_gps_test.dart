import 'package:cleaning_ops_app/database/app_database.dart';
import 'package:cleaning_ops_app/features/profile/presentation/pages/profile_page.dart';
import 'package:cleaning_ops_app/features/profile/presentation/widgets/gps_status_section.dart';
import 'package:cleaning_ops_app/services/gps_tracking_service.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/gps_fakes.dart';
import '../../helpers/operator_fakes.dart';

/// М6.6: индикатор GPS в профиле — разрешение, состояние трекинга, счётчики
/// (DS-002 `profile.md` §3.3, §6). База и сеть заменены заглушкой состояния:
/// проверяется разметка, а не хранение (оно покрыто `gps_tracking_service_test`).
void main() {
  final DateTime lastSentAt = DateTime(2026, 9, 16, 14, 32);

  // Одна база на файл: drift предупреждает, если открыть несколько экземпляров.
  late AppDatabase database;
  setUpAll(() => database = AppDatabase.memory());
  tearDownAll(() => database.close());

  Widget wrap(GpsTrackingState state) {
    return ProviderScope(
      overrides: <Override>[
        gpsTrackingServiceProvider.overrideWithValue(StubGpsTrackingService(state, database)),
      ],
      child: const MaterialApp(home: ProfilePage()),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  String textOf(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data!;

  testWidgets('разрешённая геолокация: статус и «трекинг включён»', (tester) async {
    await tester.pumpWidget(
      wrap(const GpsTrackingState(access: LocationAccess.granted)),
    );
    await settle(tester);

    expect(find.byKey(const Key('profile_gps_section')), findsOneWidget);
    expect(textOf(tester, 'profile_gps_status_text'), LocationAccess.granted.label);
    expect(textOf(tester, 'profile_gps_tracking_text'), 'Трекинг включён · отправлено 0 точек');
    expect(find.byKey(const Key('profile_gps_settings_button')), findsOneWidget);
    expect(find.byKey(const Key('profile_page')), findsOneWidget);
  });

  testWidgets('отказ в разрешении: «Нет разрешения — трекинг не работает»', (tester) async {
    await tester.pumpWidget(wrap(const GpsTrackingState(access: LocationAccess.denied)));
    await settle(tester);

    expect(textOf(tester, 'profile_gps_status_text'), LocationAccess.denied.label);
    expect(textOf(tester, 'profile_gps_tracking_text'), 'Нет разрешения — трекинг не работает');
  });

  testWidgets('вне смены трекинг приостановлен — это норма, а не ошибка', (tester) async {
    await tester.pumpWidget(
      wrap(const GpsTrackingState(access: LocationAccess.granted, paused: true)),
    );
    await settle(tester);

    expect(textOf(tester, 'profile_gps_tracking_text'), 'Трекинг приостановлен (смена не открыта)');
  });

  testWidgets('счётчики точек, буфер, последняя отправка и ошибка видны в профиле', (tester) async {
    await tester.pumpWidget(
      wrap(
        GpsTrackingState(
          access: LocationAccess.grantedWhileInUse,
          sent: 142,
          buffered: 3,
          lastSentAt: lastSentAt,
          lastError: 'Нет соединения',
        ),
      ),
    );
    await settle(tester);

    expect(textOf(tester, 'profile_gps_tracking_text'), 'Трекинг включён · отправлено 142 точки');
    expect(textOf(tester, 'profile_gps_buffered_text'), 'в буфере 3');
    expect(textOf(tester, 'profile_gps_last_sent_text'), 'Последняя отправка 14:32');
    expect(textOf(tester, 'profile_gps_error_text'), 'Ошибка отправки: Нет соединения');
  });

  testWidgets('кнопка «Открыть настройки» зовёт системный экран разрешений', (tester) async {
    final FakeLocationService location = FakeLocationService(access: LocationAccess.deniedForever);
    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          locationServiceProvider.overrideWithValue(location),
          gpsTrackingServiceProvider.overrideWithValue(
            StubGpsTrackingService(
              const GpsTrackingState(access: LocationAccess.deniedForever),
              database,
            ),
          ),
        ],
        child: const MaterialApp(home: ProfilePage()),
      ),
    );
    await settle(tester);

    await tester.tap(find.byKey(const Key('profile_gps_settings_button')));
    await tester.pumpAndSettle();

    expect(location.settingsCalls, 1);
  });

  test('склонение счётчика точек', () {
    expect(points(1), 'точка');
    expect(points(2), 'точки');
    expect(points(5), 'точек');
    expect(points(11), 'точек');
    expect(points(21), 'точка');
    expect(points(112), 'точек');
  });
}
