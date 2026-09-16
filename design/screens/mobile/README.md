# 📱 Экраны мобильного приложения оператора — спецификации (DS-002, М6)

Текстовые спецификации экранов мобильного приложения (`mobile/cleaning-ops-app`, Flutter, задача
**М6.0–М6.8**). Это **не бинарные макеты**: файлы Figma (`design/screens/mobile/*.fig` по структуре
агента Design System — `auth_login.fig`, `auth_pin.fig`, `home_today.fig`, `route_map.fig`,
`checklist.fig`, `sos_emergency.fig`, `chat.fig`, `profile.fig`) в репозиторий не кладутся — см.
`КОНТЕКСТ.md`, раздел 6 («Деферы и технический долг»): *«design/screens/\*.fig (макеты DS-002..004) не
создавались — только токены и текстовые спецификации»*. Пункт DS-002 закрывается этим каталогом:
спецификации пригодны для реализации мобильным разработчиком без графического редактора и для
написания widget-тестов, проверка «UI соответствует макетам» выполняется сверкой кода с этими
файлами — тот же приём, что у DS-003 ([`../web-admin/README.md`](../web-admin/README.md)) и DS-004
([`../web-client/README.md`](../web-client/README.md)).

Источники, на которые опираются спецификации (никаких выдуманных сущностей, эндпоинтов и токенов):

| Что | Источник |
|---|---|
| Константы токенов для Flutter (`AppColors`, `AppSpacing`, `AppRadius`, `AppTypography`) | `design/tokens/generated/lib/app_tokens.dart` (генератор `design/scripts/generate.mjs`; правка — только в `design/tokens/*.json`; приложение подключает каталог path-зависимостью `cleaning_ops_tokens`) |
| Значения теней | `design/tokens/shadows.json` (в `app_tokens.dart` **не** генерируются — см. п. «Пробелы токенов») |
| Состав экранов DS-002 и требования (iOS/Android, оффлайн-индикаторы, тёмная тема, accessibility) | `docs/agents/DESIGN_SYSTEM.md` → «Задача DS-002» |
| Функциональность по задачам М6.0–М6.8 | `ПЛАН.md` → «М6 — Мобильное приложение оператора (Flutter)» |
| Примеры кода экранов (маршрут, чек-лист, SOS, drift-очередь) и чек-лист приёмки мобильного | `docs/agents/FRONTEND_MOBILE.md` (копия `УСТАВ.md` → «АГЕНТ: FRONTEND MOBILE»), п. 3–6 |
| Правила кода (Riverpod, Drift, исключения, ключи widget-тестов, производительность) | `УСТАВ.md` → «ПРАВИЛА НАПИСАНИЯ КОДА В DASH» |
| Стек, версии, порты dev-стенда, структура `lib/`, оффлайн-модель | `mobile/README.md` |
| Поля `ScheduleEventView` (смены) | `backend/schedule-service/src/schedule/schedule.service.ts` → `interface ScheduleEventView` |
| Поля `Ticket`, `TicketOperationCompletion`, ответ завершения операции | `backend/ticket-service/prisma/schema.prisma`, `tickets.service.ts` → `CompleteOperationResult` |
| Поля `Object`/`Floor`/`Room`/`Route`/`RoutePoint`/`TechCard`/`TechOperation` | `backend/core-service/prisma/schema.prisma`, `RoutesService.getDetail`, `TechCardsService.getDetail` |
| Поля файла (`url`, `thumbnailUrl`, `watermarked`) | `backend/file-service/src/files/files.service.ts` → `UploadedFileView` |
| Поля `User` (ФИО, `avatarUrl`, `phone`, `role`) | `backend/auth-service/prisma/schema.prisma`, `users/user.mapper.ts` → `SafeUser` |
| Чаты и сообщения (`ChatSummary`, `MessageView`, WS-события) | `backend/chat-service/src/chats/chats.service.ts`, `chat.gateway.ts`, `ws-auth.ts` |
| GPS-batch и его пределы | `backend/gps-service/src/gps/dto/gps.dto.ts`, `gps.constants.ts` |
| Push-устройства, настройки подписок, типы уведомлений | `backend/notification-service/src/notifications/notifications.controller.ts`, `notification-types.ts` |
| Endpoint'ы, коды ответов, права | `docs/architecture/API_SPECIFICATION.md` + контроллеры `backend/*/src/**/*.controller.ts` |
| Подписи статусов и словари значений | `shared/types/tickets.ts`, `shared/types/schedule.ts`, `shared/types/core.ts`, `shared/types/chat.ts`, `shared/types/roles.ts`, `frontend/web-admin/src/types/tickets.ts` (`TICKET_STATUS_LABELS`, `TICKET_PRIORITY_LABELS`, `TICKET_TYPE_LABELS`) |

> **Статус реализации.** Приложения `mobile/cleaning-ops-app/` пока нет (в репозитории только
> `.gitkeep` и [`mobile/README.md`](../../../mobile/README.md)) — это и есть задача М6. Backend к
> моменту написания спецификаций реализован (9 сервисов, включая chat-service) — поэтому, в отличие
> от DS-004, здесь **нет «ожидаемых» эндпоинтов**: все пути и поля в спецификациях сверены с кодом
> контроллеров. Отдельно и явно помечены места, где API **не хватает** (см. «Сводка: что требует
> доработки сервисов» и раздел 10 каждого экранного файла).

## Индекс файлов

| № | Файл | Что описывает | Маршрут go_router | Задача |
|---|---|---|---|---|
| 0 | [`overview.md`](./overview.md) | Карта приложения, навигация и таб-бар, сквозные сценарии, словари статусов, доступность | — | М6.0 |
| 1 | [`auth.md`](./auth.md) | Вход: email/пароль, PIN (ввод, установка/смена), биометрия, ошибки, блокировки | `/splash`, `/login`, `/pin`, `/pin/setup` | М6.2 |
| 2 | [`home_today.md`](./home_today.md) | Главный экран: смена на сегодня, check-in/check-out, события и заявки оператора, переход к маршруту | `/today` | М6.3 |
| 3 | [`route_map.md`](./route_map.md) | Маршрут дня: план этажа, точки по координатам помещений, статусы точек, «Следующая точка» | `/route/:eventId` | М6.3 |
| 4 | [`checklist.md`](./checklist.md) | Чек-лист помещения: операции техкарты по порядку, таймер, обязательное фото, завершение | `/route/:eventId/room/:roomId` | М6.4 |
| 5 | [`sos.md`](./sos.md) | Аварийная заявка: тип, обязательное фото, описание, локация, очередь при оффлайне | `/sos` | М6.5 |
| 6 | [`chat.md`](./chat.md) | Чаты: список, переписка, отправка, доставка/прочтение, оффлайн-очередь, WS | `/chats`, `/chats/:chatId` | М6.8 |
| 7 | [`profile.md`](./profile.md) | Профиль: ФИО, аватар, смена PIN/пароля, выход, статус GPS и разрешений, уведомления | `/profile` | М6.8 |
| 8 | [`offline.md`](./offline.md) | Оффлайн-режим: индикатор, очередь действий, синхронизация, таймеры и фото | `/offline` | М6.7 |

Соответствие перечню DS-002 (`docs/agents/DESIGN_SYSTEM.md`): `auth_login.fig` и `auth_pin.fig` —
оба в [`auth.md`](./auth.md) (это два маршрута одного пакета входа); `home_today.fig` →
[`home_today.md`](./home_today.md); `route_map.fig` → [`route_map.md`](./route_map.md);
`checklist.fig` → [`checklist.md`](./checklist.md); `sos_emergency.fig` → [`sos.md`](./sos.md);
`chat.fig` → [`chat.md`](./chat.md); `profile.fig` → [`profile.md`](./profile.md). Файлы
[`overview.md`](./overview.md) и [`offline.md`](./offline.md) — не экраны из перечня DS-002, а
сквозные разделы (каркас/навигация и оффлайн-режим, который DS-002 требует как «индикаторы»).

## Как пользоваться пакетом

1. **Реализатор экрана** открывает `overview.md` (каркас, состояния, доступность, ошибки), затем файл
   своего экрана. Разделы «Состав блоков / Элементы» дают таблицу «элемент → тип виджета Flutter →
   `Key` → действие»: этого достаточно, чтобы собрать виджет, не изобретая структуру.
2. **Тексты берутся дословно** из раздела «Тексты интерфейса» каждого файла (или из колонки
   «Текст» таблицы элементов). Приложение не переписывает строки «по-своему» — иначе widget-тесты
   из спецификации не пройдут, а формулировки разъедутся с Уставом (SOS: «🚨 ОТПРАВИТЬ SOS»,
   snackbar «Выберите тип и сделайте фото», ошибка email «Введите корректный email» —
   они зафиксированы в `УСТАВ.md` и `ПЛАН.md` М6.2/М6.5).
3. **QA/разработчик тестов** берёт раздел «Что проверяет widget-тест» — там указаны входные данные,
   `Key` элементов и ожидаемый текст. Тесты пишутся по этим сценариям без обращения к фигме.
4. **Расхождение с кодом сервисов** — это баг спецификации: правится здесь, а не «молча» в
   приложении. Пометка «⚠️ требует доработки сервиса» означает, что без изменения backend
   требование М6 невыполнимо (перечень — в сводке ниже и в п. 10 файла экрана).

## Общие правила (кратко; подробно — [`overview.md`](./overview.md))

| Правило | Значение |
|---|---|
| Тип клиента | **Толстый офлайн-first клиент**: работает в поле без сети, локальная БД drift, очередь действий, синхронизация при появлении сети (М6.7) |
| Роль | Целевая — `OPERATOR` (`shared/types/roles.ts` → `ROLE_LABELS.OPERATOR = 'Оператор'`). `SUPERVISOR`/`ADMIN` пользуются теми же эндпоинтами и допускаются; `CLIENT` — отказ на входе (портал заказчика — DS-004) |
| Навигация | `go_router` + guard авторизации; нижний таб-бар из 3 пунктов (`Сегодня`, `Чаты`, `Профиль`) + постоянная кнопка SOS; маршрут, чек-лист и SOS — полноэкранные маршруты **поверх** таб-бара |
| Состояния экрана | Единые пять: **загрузка / пусто / ошибка / оффлайн / успех**; на каждом экране — своя таблица состояний, виджеты — из `shared/widgets/` |
| Оффлайн-индикатор | `OfflineBannerWidget` в шапке shell-экранов + счётчик неотправленных действий; `SyncStatusWidget` в шапке маршрутного/чек-лист-экрана |
| Дизайн-токены | Только `design/tokens/generated/app_tokens.dart`; сборка `ThemeData` — `lib/core/theme/app_theme.dart`. Новые токены в задаче М6 **не вводятся** |
| Ключи виджетов | `Key('<экран>_<элемент>')` в snake_case, у списков — с id: `Key('route_point_marker_$pointId')`. Базовые имена заданы Уставом: `email_field`, `submit_button` |
| Идентификаторы для тестов | Список `Key` каждого экрана — обязательная часть таблицы элементов: без них widget-тест «неверный email → текст ошибки» невозможен |

## Легенда токенов: назначение → константа Flutter → значение

| Назначение | Константа (`app_tokens.dart`) | Значение | Применение в мобильном |
|---|---|---|---|
| Фон экрана | `AppColors.neutral50` | `#F9FAFB` | `Scaffold.backgroundColor` |
| Поверхность (карточка, лист, таб-бар) | — | `Colors.white` | токена «white» нет — так же, как `bg-white` в DS-003/DS-004 |
| Границы | `AppColors.neutral200` | `#E5E7EB` | `BorderSide`, `Divider` |
| «Пустое» состояние / dashed | `AppColors.neutral300` | `#D1D5DB` | рамка пустого состояния |
| Основной текст | `AppColors.neutral900` | `#111827` | `TextTheme.bodyLarge/…` |
| Вторичный текст, подписи | `AppColors.neutral500` | `#6B7280` | подписи полей, время, подзаголовки |
| Подсказки в полях | `AppColors.neutral400` | `#9CA3AF` | `hintText` |
| Акцент, primary-действие | `AppColors.primary500`, `primary600` | `#3399FF`, `#1A80E6` | `FilledButton`, активный таб, текущая точка |
| Мягкая заливка акцента | `AppColors.primary50`, `primary100` | `#EBF5FF`, `#D6EBFF` | подложка активного таба, KPI-плитки |
| Успех (выполнено) | `AppColors.success500`, `success600` | `#22C55E`, `#16A34A` | статус точки «выполнено», «Завершить помещение» |
| Предупреждение (пропущено, оффлайн) | `AppColors.warning500`, `warning600` | `#F59E0B`, `#D97706` | пропущенная точка, баннер «Нет соединения» |
| Ошибка, SOS | `AppColors.danger500`, `danger600` | `#EF4444`, `#DC2626` | кнопка SOS, баннеры ошибок, «требуется фото» |
| Информация | `AppColors.info500`, `info600` | `#3B82F6`, `#2563EB` | нейтральные подсказки |
| Заголовок экрана | `sizeXL` (20) + `weightSemibold` (600) | 20 px / 600 | `AppBar.title` |
| Заголовок блока, название помещения | `sizeLG` (18) + `weightMedium` (500) | 18 px / 500 | карточки, заголовки секций |
| Основной текст, текст в полях ввода | `sizeBASE` (16) | 16 px | ≥16 px — иначе iOS зумит при фокусе |
| Текст кнопок, таблиц, списков | `sizeSM` (14) | 14 px | |
| Мелкие подписи, бейджи, таймеры | `sizeXS` (12) | 12 px | ниже не опускаемся |
| Числа, время, координаты, ID | `fontMono` (`JetBrains Mono`) | — | таймер операции, координаты, `HH:mm`, `dd.MM.yyyy` |
| Отступы | `AppSpacing.xs…xl` (4/8/12/16/24), `2xl` (32), `3xl` (48) | 4px-сетка | базовый `lg` (16) для экрана, `sm` (8) между строками списка |
| Скругления | `AppRadius.md` (8), `lg` (12), `xl` (16), `full` (9999) | — | карточка — `xl`, кнопка/поле — `lg`, маркер точки и бейдж — `full` |

## Пробелы токенов, существенные именно для мобильного

Правка `design/tokens/*.json` и перегенерация `app_tokens.dart` — **отдельная задача DS**, в М6
токены не меняются. Спецификации обойдены существующими константами; пробелы ниже перечислены
честно, потому что часть из них — прямые требования DS-002:

1. **Тени не сгенерированы.** В `app_tokens.dart` есть только цвета, отступы, радиусы и типографика;
   `shadows.json` (sm/md/lg/xl) в Dart не экспортируется. Решение: константы `AppShadows.sm/md/lg/xl`
   объявляются **один раз** в `lib/core/theme/app_theme.dart` значениями из `shadows.json`
   (`offsetY`/`blur`/`spread`/`color`), экраны используют `AppShadows.lg` и т. п. Требуется
   доработка генератора (`design/scripts/generate.mjs`), чтобы тени шли из токенов, а не из
   дублирующего кода.
2. **Нет семантических токенов тёмной темы.** DS-002 требует «Тёмная тема», но в
   `design/tokens/colors.json` есть только светлая палитра (`neutral-50…900` без dark-семантики).
   До появления отдельных dark-переменных приложение собирается в **светлой теме**
   (`ThemeMode.light`), тёмная тема — задача DS (та же формулировка, что в DS-003/DS-004).
3. **Нет цвета «поверхность».** Белый фон карточек/листов/таб-бара — константа `Colors.white`,
   токена `white` нет (в web это `bg-white`).
4. **Мягкой заливки статусов нет.** У `success/warning/danger/info` есть только 500/600 — нет
   `*-50/100`. Поэтому бейджи статусов — «белая пилюля + точка semantic-500 + текст semantic-600»,
   а не цветной фон (то же решение, что в DS-003/DS-004).
5. **Нет токенов размеров области нажатия и safe-area.** Touch-target ≥48 dp и отступы под «чёлку»
   и домашний индикатор задаются кодом (`SafeArea`, `MediaQuery.viewPadding`), токенов для них нет.
6. **Нет семантической типографики** (`titleLarge`, `labelSmall` и т. п.). `ThemeData.textTheme`
   собирается в `app_theme.dart` из `AppTypography.size*`/`weight*`; экраны ссылаются на стиль темы,
   а не на «магические» размеры.

## Сводка: что требует доработки сервисов

Ниже — все места, где требования М6 (или DS-002) **нельзя** выполнить на текущем API. Подробности и
последствия — в п. 10 соответствующего файла.

| № | Чего не хватает | Где | Что требуется |
|---|---|---|---|
| 1 | Нет регистрации биометрического ключа: `POST /api/auth/biometric` только **ищет** пользователя по `biometricKey` (`auth.service.ts`), а записать ключ нечем — `PATCH /api/users/:id` доступен только ADMIN и в `UpdateUserDto` поля `biometricKey` нет | [`auth.md`](./auth.md) п. 10.1 | `POST /api/auth/biometric/register { biometricKey }` (под JWT) либо `biometricKey` в self-service обновлении профиля |
| 2 | Нет эндпоинта «установить PIN», если PIN ещё не задан: `POST /api/auth/change-pin` требует `currentPassword` | [`auth.md`](./auth.md) п. 10.2 | отдельный `POST /api/auth/pin/setup` или разрешить `change-pin` без текущего пароля при пустом `pinCode` |
| 3 | Оператор не может сохранить себе аватар: `POST /api/files/upload` вернёт `url`, но записать `avatarUrl` в свой профиль нечем (`PATCH /api/users/:id` — ADMIN) | [`profile.md`](./profile.md) п. 10.1 | `PATCH /api/auth/me { avatarUrl }` (или `POST /api/auth/avatar`) |
| 4 | Нет отписки устройства от push: `POST /api/notifications/device` — только upsert | [`profile.md`](./profile.md) п. 10.2 | `DELETE /api/notifications/device { token }` или `POST …/device/unregister` (иначе после выхода push уходят прошлому пользователю) |
| 5 | У аварийной заявки **нет поля «тип аварии»** (`EmergencyTicketDto`: `objectId`, `roomId`, `description`, `lat`, `lng`, `objectName`, `floor`, `radiusM`) и нет словаря типов | [`sos.md`](./sos.md) п. 10.1 | поле `category`/`emergencyType` в `EmergencyTicketDto` + словарь значений (например, в `shared/types/tickets.ts`) |
| 6 | Аварийная заявка **не принимает фото**: `photoUrl` в `EmergencyTicketDto` отсутствует (в отличие от `CompleteOperationDto`) | [`sos.md`](./sos.md) п. 10.2 | либо `photoUrl` в теле SOS, либо один вызов «создать + привязать» (сейчас: upload → emergency → `POST /api/files/:id/attach`) |
| 7 | `lat`/`lng` в аварийной заявке **обязательны** (`@IsNumber`, без `@IsOptional`) | [`sos.md`](./sos.md) п. 10.3 | сделать координаты необязательными либо явно запретить SOS без GPS (сейчас при отказе в разрешении SOS технически невозможен) |
| 8 | Прогресс маршрута сервер не хранит: статус точки маршрута (ожидает/в работе/выполнено/пропущено) — только локальное состояние; сервер знает лишь `TicketOperationCompletion` | [`route_map.md`](./route_map.md) п. 10.1 | эндпоинт прогресса смены/маршрута (например, `GET /api/schedule/events/:id/progress`) или таблица отметок точек |
| 9 | Нет записи «помещение завершено» и нет счётчика операций на сервере: `totalOperations` передаёт **клиент**, а `POST …/operations/:operationId/complete` идемпотентен по паре `(ticketId, operationId)` | [`checklist.md`](./checklist.md) п. 10.1–10.2 | запись прогресса по `roomId` (серверный учёт) либо отдельный `POST /api/tickets/:id/rooms/:roomId/complete` |
| 10 | Две комнаты с одной техкартой ломают чек-лист: `@@unique([ticketId, operationId])` в `ticket_operation_completions` | [`checklist.md`](./checklist.md) п. 10.3 | ключ `(ticketId, roomId, operationId)` либо операция-в-комнате как отдельная сущность |
| 11 | `ScheduleEventView` не содержит `objectName` и названия маршрута — только `objectId`/`routeId`/`scheduleName` | [`home_today.md`](./home_today.md) п. 10.1 | добавить `objectName`/`routeName` в проекцию смены (иначе N+1 запросов к core на главном экране) |
| 12 | `message:send` в WS и REST-фолбэк не принимают клиентский ключ идемпотентности: `parseSendPayload` знает только `chatId`/`text`/`attachmentIds` | [`chat.md`](./chat.md) п. 10.1 | `clientMessageId` в payload + отбрасывание дублей на сервере (иначе ретрай после обрыва создаёт дубль) |
| 13 | У `MessageView` нет `deliveredAt`/`readAt` и нет счётчика доставки: «доставлено» неотличимо от «отправлено» | [`chat.md`](./chat.md) п. 10.2 | поле статуса доставки в `MessageView` либо отдельное событие `message:delivered` |
| 14 | Оператор не может создать `ticket`/`object`-чат: `POST /api/chat/chats` разрешает их только ADMIN/SUPERVISOR | [`chat.md`](./chat.md) п. 10.3 | правило доступа для OPERATOR (участник заявки) либо автосоздание чата при назначении на заявку |
| 15 | Уведомления чата приходят как `CHAT_MESSAGE`, но словаря русских подписей типов на сервере нет | [`profile.md`](./profile.md) п. 10.3 | словарь подписей в `shared`/сервисе, иначе он дублируется в приложении |
| 16 | Нет мониторинга связности: в зависимостях (`mobile/README.md`) нет пакета отслеживания сети | [`offline.md`](./offline.md) п. 10.1 | решение: `connectivity_plus` в `pubspec.yaml` (+ обновление `mobile/README.md`) либо связность по факту ошибок Dio |

## Доступность (общие требования DS-002; по экранам — в их файлах)

- **Контраст:** основной текст `neutral-900` на белом, вторичный — `neutral-500`; статусные цвета не
  используются как фон текста (мягких `*-50` нет) — только точка + текст `semantic-600`.
- **Размер области нажатия ≥48×48 dp** (`MaterialTapTargetSize.padded` у кнопок, `ListTile` для
  строк-действий). Иконки в `AppBar` — `IconButton` с `tooltip`.
- **Статусы дублируются текстом**, не только цветом: у точки маршрута — подпись статуса, у заявки —
  бейдж со словом.
- **Скринридеры:** `Semantics(label: …)` на нетекстовых маркерах (точка маршрута — «Точка 3, Санузел
  101, в работе»), `liveRegion: true` на баннере оффлайна и на snackbar-ошибках.
- **Размер текста:** базовый ≥16 px, подписи ≥12 px; при системном масштабировании до 1.3 вёрстка не
  должна обрезать кнопки (проверяется на 320 dp по ширине).
- **Не только жест:** всё, что доступно свайпом/долгим нажатием, доступно и обычным нажатием
  (например, «Завершить помещение» — кнопка, а не свайп).
