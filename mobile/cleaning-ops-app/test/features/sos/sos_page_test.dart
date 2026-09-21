import 'package:cleaning_ops_app/core/errors/failures.dart';
import 'package:cleaning_ops_app/database/database_provider.dart';
import 'package:cleaning_ops_app/features/sos/domain/emergency_category.dart';
import 'package:cleaning_ops_app/features/sos/presentation/pages/sos_page.dart';
import 'package:cleaning_ops_app/features/sos/presentation/providers/sos_providers.dart';
import 'package:cleaning_ops_app/features/sos/presentation/sos_texts.dart';
import 'package:cleaning_ops_app/shared/data/data_providers.dart';
import 'package:cleaning_ops_app/shared/data/models/emergency_ticket.dart';
import 'package:cleaning_ops_app/shared/data/models/operator_models.dart';
import 'package:cleaning_ops_app/shared/data/models/schedule_event.dart';
import 'package:cleaning_ops_app/shared/data/pending_actions.dart';
import 'package:cleaning_ops_app/shared/services/location_service.dart';
import 'package:cleaning_ops_app/shared/services/photo_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/checklist_fakes.dart';
import '../../helpers/operator_fakes.dart';

/// М6.5: сценарии из `design/screens/mobile/sos.md` §10 — пустая форма, успешная
/// отправка, оффлайн-очередь и отсутствие координат.
void main() {
  const String roomId = 'room-1';

  List<Override> overrides({
    FakeTicketsRepository? tickets,
    FakeFilesRepository? files,
    FakePhotoCaptureService? photos,
    PendingActionQueue? queue,
    LocationService? location,
    List<ScheduleEvent>? events,
  }) {
    return <Override>[
      scheduleRepositoryProvider.overrideWithValue(
        FakeScheduleRepository(
          events: events ?? <ScheduleEvent>[checkedInEvent(id: 'ev1', objectId: 'object-1')],
        ),
      ),
      coreRepositoryProvider.overrideWithValue(
        FakeCoreRepository(
          objectSummary: const ObjectSummary(id: 'object-1', name: 'Бизнес-центр «Ромашка»'),
          roomDetail: roomWithTechCard(id: roomId),
          floorPlan: const FloorPlan(id: 'f1', number: 3),
        ),
      ),
      ticketsRepositoryProvider.overrideWithValue(tickets ?? FakeTicketsRepository()),
      filesRepositoryProvider.overrideWithValue(files ?? FakeFilesRepository()),
      photoCaptureServiceProvider.overrideWithValue(photos ?? FakePhotoCaptureService()),
      pendingActionQueueProvider.overrideWithValue(queue ?? InMemoryPendingActionQueue()),
      locationServiceProvider.overrideWithValue(location ?? FakeLocationService()),
    ];
  }

  Widget wrap(List<Override> list) {
    return ProviderScope(
      overrides: list,
      child: const MaterialApp(home: SosPage(roomId: roomId)),
    );
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// Заполняет форму: тип, фото, описание.
  Future<void> fillForm(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('sos_type_dropdown')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(EmergencyCategory.flood.label).last);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('sos_photo_button')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('sos_description_field')), 'Вода на полу');
    await tester.pumpAndSettle();
  }

  testWidgets('пустая форма: snackbar «Выберите тип и сделайте фото», заявка не уходит', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    await tester.pumpWidget(wrap(overrides(tickets: tickets)));
    await settle(tester);

    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    expect(find.text(SosTexts.validation), findsWidgets);
    expect(find.byKey(const Key('sos_error_text')), findsOneWidget);
    expect(tickets.emergencyCalls, isEmpty);
  });

  /// М7.4: на телефоне ширины 393 логических пикселя строка «Сделать фото» +
  /// «обязательно» в `Row` переполнялась на 39 px (`A RenderFlex overflowed`), а
  /// в live-рендере на устройстве та же строка приводила к жёсткой ошибке
  /// `BoxConstraints forces an infinite width` на Material кнопки. Проверка держит
  /// регрессию: на узком экране форма SOS верстается без исключений.
  testWidgets('узкий экран (393×698): фото-блок верстается без переполнения', (tester) async {
    tester.view.physicalSize = const Size(393 * 3, 698 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(wrap(overrides()));
    await settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('sos_photo_button')), findsOneWidget);
    expect(find.text(SosTexts.required), findsOneWidget);
  });

  testWidgets('успешная отправка: тип в описании, координаты и число оповещённых', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository(
      nearbyOperators: const <NearbyOperator>[
        NearbyOperator(userId: 'u1', distanceMeters: 120),
        NearbyOperator(userId: 'u2', distanceMeters: 240),
        NearbyOperator(userId: 'u3', distanceMeters: 380),
      ],
    );
    final FakeFilesRepository files = FakeFilesRepository();
    await tester.pumpWidget(wrap(overrides(tickets: tickets, files: files)));
    await settle(tester);

    await fillForm(tester);
    expect(find.byKey(const Key('sos_photo_preview')), findsOneWidget);

    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    final Map<String, Object?> call = tickets.emergencyCalls.single;
    expect(call['description'], startsWith('[Тип: ${EmergencyCategory.flood.label}]'));
    expect(call['description'], contains('Вода на полу'));
    expect(call['lat'], 55.7558);
    expect(call['lng'], 37.6173);
    expect(call['objectId'], 'object-1');
    expect(call['roomId'], roomId);
    expect(call['objectName'], 'Бизнес-центр «Ромашка»');
    expect(call['floor'], 'Санузел 101, 3 этаж');
    expect(call['radiusM'], SosConstants.nearbyRadiusM);

    expect(files.uploads.single['filePath'], isNotNull);
    expect(files.attachments.single['ticketId'], 'ticket-sos');

    expect(find.byKey(const Key('sos_success_view')), findsOneWidget);
    expect(find.text(SosTexts.sent), findsOneWidget);
    expect(find.text(SosTexts.priorityAndStatus('Критичный', 'Новая')), findsOneWidget);
    expect(find.text(SosTexts.notified(3)), findsOneWidget);
  });

  testWidgets('без сети заявка уходит в очередь и показывается «сохранена и будет отправлена»', (tester) async {
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue();
    final FakeTicketsRepository tickets = FakeTicketsRepository(
      emergencyFailure: const NetworkFailure(),
    );
    await tester.pumpWidget(wrap(overrides(tickets: tickets, queue: queue)));
    await settle(tester);

    await fillForm(tester);
    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('sos_success_view')), findsOneWidget);
    expect(find.text(SosTexts.queued), findsOneWidget);

    final PendingAction action = (await queue.all()).single;
    expect(action.type, PendingActionTypes.sos);
    expect(action.status, PendingActionStatus.pending);
    expect(action.idempotencyKey, startsWith('sos:'));
    expect(action.payload['clientRequestId'], isNotNull);
    expect(action.payload['objectId'], 'object-1');
    expect(action.payload['localPhotoPath'], isNotNull);
    expect(action.payload['description'], startsWith('[Тип: '));
  });

  testWidgets('нет координат: отправка заблокирована с понятным текстом', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    await tester.pumpWidget(
      wrap(
        overrides(
          tickets: tickets,
          location: FakeLocationService(errorMessage: 'Нет доступа к геолокации'),
        ),
      ),
    );
    await settle(tester);

    expect(find.byKey(const Key('sos_location_error')), findsOneWidget);
    expect(find.text(SosTexts.locationDenied), findsOneWidget);

    await fillForm(tester);
    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    expect(tickets.emergencyCalls, isEmpty);
    expect(find.text(SosTexts.locationDenied), findsWidgets);
  });

  testWidgets('фото отклонено file-service: текст сервера и форма сохранена', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    final FakeFilesRepository files = FakeFilesRepository(
      uploadFailure: const ValidationFailure('Разрешение фото 640×480 меньше минимального 1280×720'),
    );
    await tester.pumpWidget(wrap(overrides(tickets: tickets, files: files)));
    await settle(tester);

    await fillForm(tester);
    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('sos_send_error')), findsOneWidget);
    expect(
      find.text(
        SosTexts.photoRejected('Разрешение фото 640×480 меньше минимального 1280×720'),
      ),
      findsOneWidget,
    );
    expect(tickets.emergencyCalls, isEmpty);
  });

  testWidgets('маленький снимок отклоняется до отправки', (tester) async {
    final FakePhotoCaptureService photos = FakePhotoCaptureService(width: 640, height: 480);
    final FakeFilesRepository files = FakeFilesRepository();
    await tester.pumpWidget(wrap(overrides(photos: photos, files: files)));
    await settle(tester);

    await tester.tap(find.byKey(const Key('sos_photo_button')));
    await tester.pumpAndSettle();

    expect(find.text(SosTexts.photoTooSmall), findsOneWidget);
    expect(files.uploads, isEmpty);
    expect(photos.deleted, isNotEmpty);
  });

  testWidgets('5xx при создании заявки: «Сервис временно недоступен» и «Повторить»', (tester) async {
    final FakeTicketsRepository tickets = FakeTicketsRepository(
      emergencyFailure: const ServerFailure('Bad gateway'),
    );
    await tester.pumpWidget(wrap(overrides(tickets: tickets)));
    await settle(tester);

    await fillForm(tester);
    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    expect(find.text(SosTexts.serviceUnavailable), findsOneWidget);
    expect(find.byKey(const Key('sos_send_retry_button')), findsOneWidget);
  });

  testWidgets('фото не привязалось: заявка успешна, запись об attach осталась в очереди', (tester) async {
    final InMemoryPendingActionQueue queue = InMemoryPendingActionQueue();
    final FakeTicketsRepository tickets = FakeTicketsRepository();
    final FakeFilesRepository files = FakeFilesRepository(
      attachFailure: const NetworkFailure(),
    );
    await tester.pumpWidget(wrap(overrides(tickets: tickets, files: files, queue: queue)));
    await settle(tester);

    await fillForm(tester);
    await tester.tap(find.byKey(const Key('sos_submit_button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('sos_success_view')), findsOneWidget);
    expect(find.text(SosTexts.photoNotAttached), findsOneWidget);
    final PendingAction action = (await queue.all()).single;
    expect(action.type, PendingActionTypes.sosAttachPhoto);
    expect(action.idempotencyKey, 'sos-attach:file-1');
    expect(action.payload['ticketId'], 'ticket-sos');
  });

  testWidgets('нет активной смены: экран блокируется с текстом для оператора', (tester) async {
    await tester.pumpWidget(
      wrap(
        overrides(
          events: <ScheduleEvent>[plannedEvent(id: 'ev1', objectId: null)],
        ),
      ),
    );
    await settle(tester);

    expect(find.text(SosTexts.noObject), findsOneWidget);
    expect(find.byKey(const Key('sos_submit_button')), findsNothing);
  });

  testWidgets('координаты и место из маршрута видны в строке локации', (tester) async {
    await tester.pumpWidget(wrap(overrides()));
    await settle(tester);

    expect(find.byKey(const Key('sos_location_text')), findsOneWidget);
    expect(find.text('55.755800, 37.617300 · Санузел 101, 3 этаж'), findsOneWidget);
  });

  group('SosController', () {
    test('описание собирается с префиксом типа', () {
      expect(
        EmergencyCategory.sewage.toDescription('  Вода уходит плохо  '),
        '[Тип: Засор канализации] Вода уходит плохо',
      );
      expect(EmergencyCategory.other.toDescription('   '), '[Тип: Другое]');
    });
  });
}
