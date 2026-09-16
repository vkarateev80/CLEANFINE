# Мобильное приложение оператора (М6)

Толстый офлайн-first клиент для оператора: PIN/биометрия, маршрут дня по плану этажа,
чек-листы с фото и таймерами, SOS, GPS-трекинг, чат, push.

- Приложение: `mobile/cleaning-ops-app/` (Flutter, пакет `cleaning_ops_app`, org `com.cleaningops`).
- Спецификации экранов: `design/screens/mobile/**` (пакет DS-002).
- Требования: `ПЛАН.md` → «М6 — Мобильное приложение оператора (Flutter)», `УСТАВ.md` →
  «Агент FRONTEND MOBILE» (копия в `docs/agents/FRONTEND_MOBILE.md`).

## Стек и версии

| Компонент | Версия | Назначение |
|---|---|---|
| Flutter | 3.19.6 (stable) | SDK; Dart 3.3.4 |
| flutter_riverpod | 2.x | состояние |
| go_router | 14.x | навигация и guard авторизации |
| dio | 5.x | HTTP, refresh-интерцептор |
| drift + sqlite3_flutter_libs | 2.x | локальная БД и очередь оффлайн-действий |
| flutter_secure_storage | 9.x | access/refresh и биометрический ключ |
| geolocator | 12.x | GPS-трекинг и check-in по геозоне |
| camera + image_picker | — | фотофиксация |
| flutter_map | 6.x | карта (админка/М3), в маршруте — план этажа |
| local_auth | 2.x | биометрия |
| firebase_messaging | 14.x | push (в dev — мок) |
| dev: drift_dev, build_runner, flutter_lints | — | генерация кода, линт |

Установка SDK: официальный zip `flutter_windows_3.19.6-stable.zip` распакован в `C:\src\flutter`;
в PATH добавляется `C:\src\flutter\bin`. Проверка: `flutter --version`.

## Запуск и проверки

```powershell
cd mobile\cleaning-ops-app
flutter pub get
flutter analyze          # обязательное требование приёмки М6.0/М6.8
flutter test             # unit + widget-тесты
flutter test --coverage  # покрытие (порог 80 % по фичам — М6.8)
```

Что проверяется локально, а что нет:

- **Проверяется:** `flutter analyze`, `flutter test`, генерация drift (`dart run build_runner build`).
- **Не проверяется без SDK платформ:** сборка APK/IPA и запуск на устройстве требуют Android SDK
  (JDK 17) и Xcode соответственно — на рабочей машине их нет, поэтому `flutter build apk`
  и `flutter doctor --android-licenses` остаются за пределами автоматической проверки. Это
  зафиксировано в `КОНТЕКСТ.md` (раздел 6, деферы М6).

## Адреса сервисов (dev)

Прямого API-gateway в dev нет, поэтому каждый сервис адресуется отдельным портом. Хост задаётся
через `--dart-define`, чтобы приложение работало и на эмуляторе, и на устройстве в одной сети:

| Сервис | Порт | Параметр |
|---|---|---|
| auth | 3001 | `API_AUTH_URL` |
| files | 3002 | `API_FILES_URL` |
| core | 3003 | `API_CORE_URL` |
| gps | 3004 | `API_GPS_URL` |
| tickets | 3005 | `API_TICKETS_URL` |
| notifications | 3006 | `API_NOTIFICATIONS_URL` |
| schedule | 3008 | `API_SCHEDULE_URL` |
| chat | 3009 | `API_CHAT_URL` |

- По умолчанию хост `10.0.2.2` (адрес хоста из Android-эмулятора). Для iOS-симулятора и
  устройства: `flutter run --dart-define=API_HOST=192.168.1.10`.
- Значения по умолчанию и сборка URL — `lib/core/constants/api_constants.dart`.

## Структура `lib/`

```
lib/
├── main.dart              # ProviderScope + запуск
├── app.dart               # MaterialApp.router, тема
├── core/
│   ├── constants/         # api_constants.dart, labels.dart
│   ├── theme/             # app_theme.dart, app_colors.dart (поверх design/tokens/generated/app_tokens.dart)
│   ├── utils/             # validators.dart, formatters.dart, clock.dart
│   └── errors/            # exceptions.dart, failures.dart
├── features/              # feature-first: auth, home, route_map, checklist, sos, chat, profile, offline
│   └── <фича>/            # data / presentation (страницы, виджеты, провайдеры)
├── shared/
│   ├── data/              # модели, репозитории, Result/Failure, pending_actions.dart (очередь)
│   ├── services/          # location_service.dart, photo_service.dart
│   └── widgets/           # переиспользуемые виджеты (каркас с табами и SOS)
├── router/app_router.dart # go_router + guard авторизации
└── services/              # api_client.dart, secure_storage_service.dart, service_providers.dart
```

Сделано по фазам М6: каркас и авторизация (М6.0–М6.2), «Сегодня» и маршрут дня (М6.3), чек-лист
помещения (М6.4). Состояние приёмки: `flutter analyze` — 0 замечаний, `flutter test` — 67 тестов.
Каталог `lib/database/` (drift) появится в М6.7 — сейчас очередь действий живёт в памяти процесса
(`lib/shared/data/pending_actions.dart`).

Правила кода — «Правила написания кода в Dash» (`УСТАВ.md`): PascalCase для классов и виджетов,
camelCase для полей и методов, snake_case для файлов, суффиксы виджетов (`Page`, `Screen`,
`Widget`, `Tile`, `Button`), исключения маппятся в `Failure` на границе репозитория.

## Оффлайн-модель (кратко)

1. Действия оператора (SOS, завершение операции, сообщение в чат) сначала пишутся в локальную
   очередь (`pending_actions`) со статусом `pending`. До М6.7 очередь держится в памяти
   (`InMemoryPendingActionQueue`), дальше её заменяет таблица drift — интерфейс `PendingActionQueue`
   уже тот, которым будет пользоваться синхронизатор.
2. Синхронизатор при появлении сети отправляет действия по порядку, с экспоненциальной задержкой
   и идемпотентными ключами (у операций — `operationId`, у SOS — локальный `clientRequestId`).
3. UI показывает индикатор «оффлайн» и число неотправленных действий; после синка статус меняется
   на `synced`.
4. План этажа и данные смены кэшируются, чтобы маршрут открывался без сети.
5. Завершение операции без сети сохраняет снимок на устройстве, а в очереди лежит `localPhotoPath`:
   фото уходит в file-service, когда соединение вернётся.
