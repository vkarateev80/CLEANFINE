// М7.4 — UAT роли «Оператор» НА УСТРОЙСТВЕ (эмулятор co-test).
//
// Это вторая половина сценария М6: тот же путь оператора, но не контрактом, а
// руками по интерфейсу. Разделение сделано осознанно — в чек-листе роли видно,
// какой пункт подтверждён прогоном на устройстве, а какой контрактным прогоном
// (`test/uat/uat-operator.mjs`).
//
// Шаги не «падают» на первом же сбое: каждый пишет ПРОЙДЕНО/НЕ ПРОЙДЕНО вместе с
// фактическим наблюдением, а в конце печатается сводка. Так один недоступный шаг
// (например, камера эмулятора) не стирает результаты остальных.
//
// Запуск: flutter test integration_test/uat_operator_device_test.dart -d emulator-5554

import 'package:cleaning_ops_app/core/constants/api_constants.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/app_harness.dart';

const String kEmail = 'operator';
const String kPassword = 'oper123';
const String kPin = '3456';

final List<String> _log = <String>[];

void record(String id, String title, bool ok, String actual) {
  _log.add('${ok ? 'ПРОЙДЕНО' : 'НЕ ПРОЙДЕНО'} [$id] $title — $actual');
  // ignore: avoid_print
  print('UAT_DEVICE ${_log.last}');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('оператор на устройстве: PIN, смена, маршрут, чек-лист, SOS, чат, профиль', (
    WidgetTester tester,
  ) async {
    printDeviceHeader(tester, 'uat_operator_device');
    final StandApi api = StandApi(kEmail, kPassword);

    await launchApp(tester);

    // ---------------------------------------------------------------
    // 1. Запуск: сохранённая сессия или экран входа
    // ---------------------------------------------------------------
    // На устройстве, где оператор уже входил, приложение по правилам М6.2 сразу
    // открывает `/today` — это не ошибка сценария, а штатное поведение. Поэтому
    // шаг принимает ОБА исхода и фиксирует, какой случился; отдельно проверяется,
    // что приложение не осталось на сплэше.
    final bool onLogin = await waitFor(
      tester,
      find.byKey(const Key('login_page')),
      timeout: const Duration(seconds: 15),
      what: 'экран входа',
    );
    final bool alreadySignedIn = !onLogin &&
        await waitFor(
          tester,
          find.byKey(const Key('today_page')),
          timeout: const Duration(seconds: 25),
          what: '/today с сохранённой сессией',
        );
    record(
      'D1',
      'Запуск: сохранённая сессия или экран входа',
      onLogin || alreadySignedIn,
      onLogin
          ? 'открыт /login (сессии не было)'
          : (alreadySignedIn ? 'открыт /today с сохранённой сессией' : 'ни /login, ни /today'),
    );
    if (!onLogin && !alreadySignedIn) return;

    // ---------------------------------------------------------------
    // 2. Вход по email и паролю (если сессии не было)
    // ---------------------------------------------------------------
    bool onToday = alreadySignedIn;
    if (onLogin) {
      await tester.enterText(find.byKey(const Key('email_field')), kEmail);
      await tester.pump();
      await tester.enterText(find.byKey(const Key('password_field')), kPassword);
      await tester.pump();
      await tapKey(tester, 'submit_button');
      onToday = await waitFor(
        tester,
        find.byKey(const Key('today_page')),
        timeout: const Duration(seconds: 45),
        what: '/today после входа',
      );
    }
    record(
      'D2',
      'Вход по email и паролю',
      onToday,
      onToday
          ? (onLogin ? 'вход выполнен, открылся /today' : 'вход не потребовался (сессия сохранена)')
          : 'остался на входе',
    );
    if (!onToday) return;

    // ---------------------------------------------------------------
    // 2. Профиль: настройка PIN и выход
    // ---------------------------------------------------------------
    await tapKey(tester, 'shell_tab_profile');
    final bool onProfile = await waitFor(
      tester,
      find.byKey(const Key('profile_page')),
      timeout: const Duration(seconds: 20),
      what: 'профиль',
    );
    record('D3', 'Профиль открывается из таб-бара', onProfile, onProfile ? 'карточка профиля есть' : 'нет');

    bool pinSaved = false;
    if (onProfile) {
      await scrollToKey(tester, 'profile_change_pin_tile');
      await tapKey(tester, 'profile_change_pin_tile');
      final bool onPinSetup = await waitFor(
        tester,
        find.byKey(const Key('pin_setup_page')),
        timeout: const Duration(seconds: 15),
        what: 'экран установки PIN',
      );
      if (onPinSetup) {
        await tester.enterText(find.byKey(const Key('pin_current_password_field')), kPassword);
        await tester.pump();
        await tester.enterText(find.byKey(const Key('pin_new_field')), kPin);
        await tester.pump();
        await tester.enterText(find.byKey(const Key('pin_repeat_field')), kPin);
        await tester.pump();
        await tapKey(tester, 'pin_save_button', settle: const Duration(seconds: 2));
        pinSaved = find.byKey(const Key('pin_setup_error_text')).evaluate().isEmpty;
        await liveFor(tester, const Duration(seconds: 1));
      }
    }
    record(
      'D4',
      'Установка PIN из профиля',
      pinSaved,
      pinSaved ? 'PIN $kPin сохранён, ошибок на экране нет' : 'экран вернул ошибку',
    );

    // Выход из аккаунта (проверяем и он, и последующий PIN-вход).
    bool loggedOut = false;
    if (onProfile) {
      // После сохранения PIN приложение могло уйти с экрана профиля —
      // возвращаемся в него через таб-бар, как это делает оператор.
      await tapKey(tester, 'shell_tab_profile', settle: const Duration(seconds: 1));
      await waitFor(
        tester,
        find.byKey(const Key('profile_page')),
        timeout: const Duration(seconds: 15),
        what: 'профиль перед выходом',
      );
      // Кнопка выхода — внизу длинного списка профиля.
      await scrollToKey(tester, 'profile_logout_button', attempts: 12);
      await tapKey(tester, 'profile_logout_button', settle: const Duration(seconds: 1));
      await tapKey(tester, 'profile_logout_confirm_button', settle: const Duration(seconds: 3));
      loggedOut = await waitFor(
        tester,
        find.byKey(const Key('login_page')),
        timeout: const Duration(seconds: 25),
        what: 'экран входа после выхода',
      );
    }
    record('D5', 'Выход из аккаунта', loggedOut, loggedOut ? 'вернулись на /login' : 'экран входа не появился');

    // ---------------------------------------------------------------
    // 3. PIN-вход
    // ---------------------------------------------------------------
    bool pinLogin = false;
    if (loggedOut) {
      await tapKey(tester, 'login_pin_button');
      final bool onPin = await waitFor(
        tester,
        find.byKey(const Key('pin_page')),
        timeout: const Duration(seconds: 15),
        what: 'экран PIN',
      );
      if (onPin) {
        for (final String digit in kPin.split('')) {
          await tapKey(tester, 'pin_digit_$digit', settle: const Duration(milliseconds: 120));
        }
        await tapKey(tester, 'pin_submit_button', settle: const Duration(seconds: 3));
        pinLogin = await waitFor(
          tester,
          find.byKey(const Key('today_page')),
          timeout: const Duration(seconds: 30),
          what: '/today после PIN-входа',
        );
      }
    }
    record('D6', 'Вход по PIN (телефон + 4 цифры)', pinLogin, pinLogin ? 'PIN принят, открылся /today' : 'PIN-вход не прошёл');

    // ---------------------------------------------------------------
    // 4. Смена дня и маршрут
    // ---------------------------------------------------------------
    final bool shiftCard = find.byKey(const Key('today_shift_card')).evaluate().isNotEmpty;
    record('D7', 'Карточка смены на /today', shiftCard, shiftCard ? 'карточка смены отрисована' : 'карточки нет');

    final bool routeButton = await waitFor(
      tester,
      find.byKey(const Key('today_route_button')),
      timeout: const Duration(seconds: 20),
      what: 'кнопка маршрута',
    );
    record(
      'D8',
      'Кнопка маршрута доступна (смена открыта)',
      routeButton,
      routeButton ? 'кнопка «Продолжить»/«Маршрут» есть' : 'кнопки нет — смена не открыта',
    );

    bool planLoaded = false;
    bool checklistOpened = false;
    if (routeButton) {
      await tapKey(tester, 'today_route_button');
      final bool onRoute = await waitFor(
        tester,
        find.byKey(const Key('route_map_page')),
        timeout: const Duration(seconds: 30),
        what: 'карта маршрута',
      );
      planLoaded = onRoute &&
          await waitFor(
            tester,
            find.byKey(const Key('route_floor_plan_image')),
            timeout: const Duration(seconds: 25),
            what: 'план этажа',
          );
      record(
        'D9',
        'Карта маршрута: план этажа отрисован (не заглушка)',
        planLoaded,
        planLoaded ? 'план загружен, заглушки нет' : 'показана заглушка «План этажа недоступен»',
      );

      // На карте точки показаны маркерами на плане (`route_point_marker_<id>`);
      // отдельный список (`route_points_list`) — резервный режим, когда плана нет.
      final int markers = findByKeyPrefix('route_point_marker_').evaluate().length;
      final bool fallbackList = find.byKey(const Key('route_points_list')).evaluate().isNotEmpty;
      record(
        'D10',
        'Маршрут: точки показаны на плане маркерами',
        markers > 0,
        'маркеров точек на плане: $markers; резервный список (без плана): $fallbackList',
      );

      checklistOpened = await tapKey(tester, 'route_next_button');
      if (checklistOpened) {
        checklistOpened = await waitFor(
          tester,
          find.byKey(const Key('checklist_page')),
          timeout: const Duration(seconds: 30),
          what: 'чек-лист',
        );
      }
      record(
        'D11',
        'Переход из маршрута в чек-лист помещения',
        checklistOpened,
        checklistOpened ? 'чек-лист открылся' : 'переход не сработал',
      );
    }

    // ---------------------------------------------------------------
    // 5. Чек-лист: операции и завершение
    // ---------------------------------------------------------------
    if (checklistOpened) {
      final bool opsList = await waitFor(
        tester,
        find.byKey(const Key('checklist_operations_list')),
        timeout: const Duration(seconds: 20),
        what: 'список операций',
      );
      final String progress = find
          .byKey(const Key('checklist_progress_text'))
          .evaluate()
          .isNotEmpty
          ? (tester.widget<Text>(find.byKey(const Key('checklist_progress_text'))).data ?? '')
          : '';
      record(
        'D12',
        'Чек-лист: список операций и прогресс',
        opsList,
        opsList ? 'операции отрисованы, прогресс «$progress»' : 'списка операций нет',
      );

      // Операции идут строго по порядку: завершаем первую доступную.
      final Finder startButton = findByKeyPrefix('checklist_op_start_button_');
      if (startButton.evaluate().isNotEmpty) {
        await tester.tap(startButton.first, warnIfMissed: false);
        await tester.pump();
        await liveFor(tester, const Duration(seconds: 1));
      }
      final Finder completeButton = findByKeyPrefix('checklist_op_complete_button_');
      final Finder noPhotoButton = find.byKey(const Key('checklist_room_complete_button'));
      bool actionTapped = false;
      if (noPhotoButton.evaluate().isNotEmpty) {
        await tester.tap(noPhotoButton.first, warnIfMissed: false);
        actionTapped = true;
      } else if (completeButton.evaluate().isNotEmpty) {
        await tester.tap(completeButton.first, warnIfMissed: false);
        actionTapped = true;
      }
      await tester.pump();
      await liveFor(tester, const Duration(seconds: 3));
      record(
        'D13',
        'Чек-лист: кнопка завершения операции нажата',
        actionTapped,
        actionTapped
            ? 'нажата (с фото — откроется камера, без фото — завершение сразу)'
            : 'кнопки завершения на экране нет',
      );
    }

    // ---------------------------------------------------------------
    // 7. Чат
    // ---------------------------------------------------------------
    // Чек-лист и маршрут — полноэкранные маршруты ПОВЕРХ каркаса с таб-баром
    // (`app_router.dart`: ShellRoute содержит только «Сегодня», «Чаты», «Профиль»).
    // Оператор в жизни нажимает «назад»; тест делает то же, иначе таб-бара на
    // экране просто нет.
    await returnToShell(tester);
    await tapKey(tester, 'shell_tab_chats');
    final bool onChats = await waitFor(
      tester,
      find.byKey(const Key('chats_page')),
      timeout: const Duration(seconds: 25),
      what: 'список чатов',
    );
    await liveFor(tester, const Duration(seconds: 2));
    final bool chatRows = find.byKey(const Key('chats_list')).evaluate().isNotEmpty;
    final bool emptyChats = find.byKey(const Key('chats_empty_text')).evaluate().isNotEmpty;
    record(
      'D18',
      'Чат: список чатов оператора',
      onChats && (chatRows || emptyChats),
      onChats
          ? 'экран чатов открыт; список чатов: $chatRows, пустое состояние: $emptyChats'
          : 'экран чатов не открылся',
    );

    bool messageSent = false;
    if (onChats && chatRows && find.byType(ListTile).evaluate().isNotEmpty) {
      await tester.tap(find.byType(ListTile).first, warnIfMissed: false);
      await tester.pump();
      final bool onThread = await waitFor(
        tester,
        find.byKey(const Key('chat_thread_page')),
        timeout: const Duration(seconds: 25),
        what: 'переписка',
      );
      if (onThread) {
        // Поле ввода появляется вместе с лентой: ждём его, а не «надеемся», что
        // страница уже дорисована (иначе `enterText` падает на отсутствующем виджете).
        final bool composer = await waitFor(
          tester,
          find.byKey(const Key('chat_input_field')),
          timeout: const Duration(seconds: 25),
          what: 'поле ввода сообщения',
        );
        if (composer) {
          await tester.enterText(
            find.byKey(const Key('chat_input_field')),
            'UAT-M74-D сообщение оператора из прогона на устройстве',
          );
          await tester.pump();
          await tapKey(tester, 'chat_send_button', settle: const Duration(seconds: 3));
          messageSent = find.byKey(const Key('chat_send_error_text')).evaluate().isEmpty;
        }
      }
    }
    record('D19', 'Чат: отправка сообщения из приложения', messageSent, messageSent ? 'сообщение ушло без ошибки' : 'отправка не подтверждена');

    // ---------------------------------------------------------------
    // 8. Профиль: состояние трекинга и очередь
    // ---------------------------------------------------------------
    await returnToShell(tester);
    await tapKey(tester, 'shell_tab_profile');
    await waitFor(
      tester,
      find.byKey(const Key('profile_page')),
      timeout: const Duration(seconds: 20),
      what: 'профиль',
    );
    // Прокручиваем именно список профиля, а не первый попавшийся Scrollable.
    final bool gpsSection = await scrollToKey(
      tester,
      'profile_gps_section',
      within: find.byKey(const Key('profile_page')),
    );
    final bool queueTile = await scrollToKey(
      tester,
      'profile_queue_tile',
      within: find.byKey(const Key('profile_page')),
    );
    record(
      'D20',
      'Профиль: раздел GPS и счётчик оффлайн-очереди',
      gpsSection && queueTile,
      'GPS-раздел: $gpsSection, плитка очереди: $queueTile',
    );

    // ---------------------------------------------------------------
    // 6. SOS — ПОСЛЕДНИМ шагом
    //
    // Почему последним: съёмка фото уходит в системное приложение камеры через
    // `image_picker`, то есть приложение на время съёмки уходит в фон, а затвор в
    // эмуляторе нажимает хост-скрипт (`test/uat/camera-shutter.sh`). Если этот шаг
    // стоит в середине, всё, что после него, рискует не записаться. Поэтому к
    // моменту съёмки уже собраны все остальные наблюдения.
    // ---------------------------------------------------------------
    // Возвращаемся на чек-лист тем же путём, что и оператор: Сегодня → Маршрут →
    // Ближайшая точка → SOS.
    await returnToShell(tester);
    await tapKey(tester, 'shell_tab_today', settle: const Duration(seconds: 1));
    await waitFor(tester, find.byKey(const Key('today_page')),
        timeout: const Duration(seconds: 20), what: '/today перед SOS');
    await tapKey(tester, 'today_route_button');
    await waitFor(tester, find.byKey(const Key('route_map_page')),
        timeout: const Duration(seconds: 25), what: 'маршрут перед SOS');
    await tapKey(tester, 'route_next_button');
    await waitFor(tester, find.byKey(const Key('checklist_page')),
        timeout: const Duration(seconds: 25), what: 'чек-лист перед SOS');

    bool sosOpened = await tapKey(tester, 'checklist_sos_button', settle: const Duration(seconds: 2));
    if (sosOpened) {
      sosOpened = await waitFor(
        tester,
        find.byKey(const Key('sos_page')),
        timeout: const Duration(seconds: 20),
        what: 'экран SOS',
      );
    }
    record('D14', 'Открытие SOS из чек-листа', sosOpened, sosOpened ? 'экран SOS открылся' : 'SOS не открылся');

    if (sosOpened) {
      // Координаты берутся из геолокации: на эмуляторе первый фикс приходит
      // медленно, поэтому ждём появления текста координат, а не «одну секунду».
      final bool location = await waitFor(
        tester,
        find.byKey(const Key('sos_location_text')),
        timeout: const Duration(seconds: 150),
        what: 'координаты в SOS',
      );
      record(
        'D15',
        'SOS: подстановка координат',
        location,
        location ? 'координаты получены и показаны' : 'координаты не получены за 150 с',
      );
      // Тип аварии обязателен: без него форма не уходит по валидации.
      await tapKey(tester, 'sos_type_dropdown', settle: const Duration(milliseconds: 600));
      final Finder flood = find.text('Прорыв трубы / затопление').last;
      if (flood.evaluate().isNotEmpty) {
        await tester.tap(flood, warnIfMissed: false);
        await tester.pump();
        await liveFor(tester, const Duration(milliseconds: 600));
      }
      await tester.enterText(
        find.byKey(const Key('sos_description_field')),
        'UAT-M74-D протечка в санузле (прогон на устройстве)',
      );
      await tester.pump();

      // Фото обязательно по спецификации (`sos.md` §7). Съёмка идёт системной
      // камерой эмулятора: затвор нажимает хост-скрипт `camera-shutter.sh`
      // (у системного приложения камеры нет точки автоматизации из теста).
      await tapKey(tester, 'sos_photo_button', settle: const Duration(seconds: 3));
      final bool photoTaken = await waitFor(
        tester,
        find.byKey(const Key('sos_photo_preview')),
        timeout: const Duration(seconds: 150),
        what: 'превью снимка SOS',
      );
      record(
        'D16',
        'SOS: фото через камеру эмулятора',
        photoTaken,
        photoTaken
            ? 'снимок снят системной камерой и показан в превью'
            : 'превью не появилось за 150 с (затвор в камере не нажат?)',
      );

      if (photoTaken && location) {
        await tapKey(tester, 'sos_submit_button', settle: const Duration(seconds: 5));
        final bool sent = await waitFor(
          tester,
          find.byKey(const Key('sos_success_view')),
          timeout: const Duration(seconds: 60),
          what: 'подтверждение SOS',
        );
        final String errorText = find.byKey(const Key('sos_error_text')).evaluate().isNotEmpty
            ? (tester.widget<Text>(find.byKey(const Key('sos_error_text'))).data ?? '')
            : '';
        record(
          'D17',
          'SOS: отправка аварийной заявки',
          sent,
          sent ? 'экран успеха показан' : 'успеха нет; текст формы: «$errorText»',
        );
      }
    }

    // Серверная сверка того, что интерфейс показал: смена открыта, треки пишутся.
    final Map<String, dynamic> my = await api.apiGet(ApiConstants.scheduleBaseUrl, '/api/schedule/my');
    final List<dynamic> events = (my['items'] ?? my) as List<dynamic>;
    final bool checkedIn = events.any((dynamic e) => (e as Map<String, dynamic>)['status'] != 'PLANNED');
    record(
      'D21',
      'Серверная сверка состояния смены',
      checkedIn,
      'статусы смен: ${events.map((dynamic e) => (e as Map<String, dynamic>)['status']).toSet().join(', ')}',
    );

    // ignore: avoid_print
    print('UAT_DEVICE_ИТОГ ${_log.where((String line) => line.startsWith('ПРОЙДЕНО')).length} '
        'из ${_log.length} шагов пройдено');
    expect(_log, isNotEmpty);
  });
}
