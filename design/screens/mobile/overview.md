# 🗺 Обзор мобильного приложения оператора (`mobile`) — DS-002 (М6)

> Не экран, а общий раздел: каркас, навигация, доступ, сквозные сценарии, состояния и словари, на
> которые ссылаются [`auth.md`](./auth.md), [`home_today.md`](./home_today.md),
> [`route_map.md`](./route_map.md), [`checklist.md`](./checklist.md), [`sos.md`](./sos.md),
> [`chat.md`](./chat.md), [`profile.md`](./profile.md) и [`offline.md`](./offline.md).
> Источник состава экранов — `docs/agents/DESIGN_SYSTEM.md` → «Задача DS-002»; функциональность —
> `ПЛАН.md` М6.0–М6.8; код-примеры и чек-лист приёмки — `docs/agents/FRONTEND_MOBILE.md`;
> стек, порты и структура `lib/` — `mobile/README.md`.

## 1. Назначение приложения

Приложение закрывает полный рабочий день оператора **без офиса и без стабильной сети**
(DoD М6: *«оператор выполняет полную смену на телефоне: PIN-вход → маршрут по плану → чек-листы с
фото → материалы списаны на сервере; SOS отправляется в один тап; оффлайн-операции
синхронизируются; push доходят»*). Это **толстый клиент**: он хранит локальную копию смены, плана
этажа, техкарты и очереди действий, а не «рисует то, что отдал сервер».

Семь действий пользователя, вокруг которых построены экраны:

1. войти (PIN / отпечаток / email+пароль) — [`auth.md`](./auth.md);
2. увидеть смену на сегодня и открыть её (check-in) — [`home_today.md`](./home_today.md);
3. пройти маршрут по плану этажа — [`route_map.md`](./route_map.md);
4. выполнить операции помещения с фото и таймером — [`checklist.md`](./checklist.md);
5. отправить аварийную заявку — [`sos.md`](./sos.md);
6. написать в чат — [`chat.md`](./chat.md);
7. проверить профиль, GPS и уведомления, выйти — [`profile.md`](./profile.md).

Справочников, CRUD объектов, техкарт, сотрудников и отчётов в приложении **нет** — это админка
(`frontend/web-admin`, DS-003). Если требование решается звонком бригадиру, оно не становится
экраном приложения.

## 2. Роль и права

| Что | Значение |
|---|---|
| Целевая роль | `OPERATOR` (`shared/types/roles.ts` → `ROLE_LABELS.OPERATOR = 'Оператор'`) |
| Допустимые роли | `OPERATOR`, `SUPERVISOR`, `ADMIN` — все три допущены к `check-in`/`check-out` (`schedule.controller.ts:79`) и к завершению операций (`tickets.controller.ts:104`) |
| Отказ | `CLIENT` → «Приложение предназначено для операторов. Воспользуйтесь порталом заказчика.» + `POST /api/auth/logout` (решение: в мобильном `CLIENT` не нужен, у него DS-004; роли приходят в `GET /api/auth/me`) |
| Вход | `POST /api/auth/login` (email+пароль), `POST /api/auth/pin`, `POST /api/auth/biometric`; далее `GET /api/auth/me` |
| Чтение | свои смены (`GET /api/schedule/my`), маршрут и план этажа (`GET /api/routes/:id`, `GET /api/floors/:id`), помещения и техкарты (`GET /api/rooms/:id`, `GET /api/tech-cards/:id`), свои заявки (`GET /api/tickets?assigneeId=`), свои чаты (`GET /api/chat/chats`), файлы (`GET /api/files/:id`) |
| Запись | `check-in`/`check-out`, завершение операций (`POST /api/tickets/:id/operations/:operationId/complete`), SOS (`POST /api/tickets/emergency`), загрузка фото/аватара (`POST /api/files/upload`), сообщения чата (WS `message:send` / REST-фолбэк), GPS-batch (`POST /api/gps/track`), профиль (`change-pin`, `change-password`), настройки уведомлений (`PATCH /api/notifications/settings`) |
| Запрещено | смена статуса заявки (`PATCH /api/tickets/:id/status` — доступна, но экранов для неё в DS-002 нет: статус меняет бригадир в админке), назначение исполнителя (`POST /:id/assign` — только ADMIN/SUPERVISOR), CRUD объектов/этажей/помещений/маршрутов/техкарт, справочник материалов, сотрудники, отчёты |

Права **повторяют `@Roles(...)` бэкенда, а не заменяют их**. То, чего у оператора быть не должно,
не рендерится вовсе (не `disabled`): неактивная кнопка намекает, что право можно получить.

### 2.1. Скоуп данных «своё»

| Данные | Как ограничиваются |
|---|---|
| Смены | `GET /api/schedule/my?from=&to=` — контроллер берёт `user.id` из JWT (`schedule.controller.ts:63`) |
| Заявки | `GET /api/tickets?assigneeId=<me>` — фильтр **передаёт клиент**; сервер по роли выборку не сужает (та же проблема, что в DS-004 п. 2.1) |
| Чаты | `GET /api/chat/chats` — только чаты, где пользователь участник (`ChatMember`); чужой `chatId` → 403 «Вы не участник этого чата» |
| Другое помещение/этаж | не запрещено сервером: маршрут смены — источник истины, но `GET /api/rooms/:id` отдаст любое помещение. Приложение открывает чек-лист только из точки маршрута своей смены |

Правила приложения при любом варианте: `userId`/`objectId` никогда не берутся из пользовательского
ввода; чужой id → 403/404 — это отдельное состояние экрана, а не «ошибка сети» (см. п. 6).

## 3. Маршруты и каркас

Дерево `go_router` (`lib/router/app_router.dart`). Guard: `redirect` на `/login`, если нет валидного
`accessToken`; обратный redirect с `/login`, `/pin` — если токен есть.

```
/splash                          → SplashPage            (проверка токена, 1 кадр, вне shell)
/login                           → LoginPage             (email/пароль + «Войти по PIN» + биометрия)
/pin                             → PinPage(mode: entry)  (ввод PIN)
/pin/setup                       → PinPage(mode: setup)  (установка/смена PIN, требует пароль)
  ── StatefulShellRoute (нижний таб-бар из 3 пунктов) ──────────────────────────────
  /today                         → HomeTodayPage         (смена на сегодня, заявки, check-in)
  /chats                         → ChatListPage          (список чатов)
  /chats/:chatId                 → ChatPage              (переписка)
  /profile                       → ProfilePage           (профиль, GPS, уведомления)
  /profile/password              → ChangePasswordPage    (смена пароля)
  /profile/pin                   → PinPage(mode: setup)  (смена PIN)
  ── вне shell (полный экран поверх таб-бара) ───────────────────────────────────────
/route/:eventId                  → RouteMapPage          (план этажа + точки маршрута)
/route/:eventId/room/:roomId     → ChecklistPage         (query: ticketId, pointId)
/sos                             → SosPage               (fullscreenDialog)
/offline                         → OfflineQueuePage      (очередь действий, из индикатора)
```

Каркас shell-экранов (телефон 360–430 dp, портрет):

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  Сегодня · БЦ «Север»                    ⚡3  🔔2          │ ← AppBar h=56
│ ┌──────────────────────────────────────────────────────────┐ │   ⚡3 — неотправленных
│ │ ⚠ Нет соединения — данные могут быть устаревшими          │ │   🔔2 — непрочитанные
│ └──────────────────────────────────────────────────────────┘ │   (OfflineBannerWidget)
│                                                              │
│   <тело экрана: ListView / RefreshIndicator>                 │
│   padding: AppSpacing.lg (16)                                │
│                                                              │
│                                        ╭───────────╮         │
│                                        │  🚨 SOS   │         │ ← FloatingActionButton
│                                        ╰───────────╯         │   danger500, extended
├──────────────────────────────────────────────────────────────┤
│   Сегодня      │     Чаты ②      │     Профиль               │ ← NavigationBar h=64
└──────────────────────────────────────────────────────────────┘   + SafeArea снизу
```

| Элемент каркаса | Реализация (Flutter) | Токены |
|---|---|---|
| AppBar | `AppBar(title: Text('Сегодня · ${objectName}'), actions: [SyncStatusWidget, NotificationBellWidget])`; `elevation: 0`, `backgroundColor: Colors.white` | `neutral900`, `sizeXL`+`weightSemibold`, `neutral200` (граница) |
| Оффлайн-баннер | `OfflineBannerWidget` — `Container` с `warning600` для иконки/текста на фоне `Colors.white`, граница `warning500`; показывается только при оффлайне или непустой очереди | `warning500/600`, `sizeXS` |
| Кнопка SOS | `FloatingActionButton.extended(icon: Icons.warning_amber, label: Text('SOS'))`, `backgroundColor: Color(AppColors.danger500)` — видна на всех shell-экранах (DoD: «SOS отправляется в один тап») | `danger500`, `AppRadius.full` |
| Таб-бар | `NavigationBar` с 3 `NavigationDestination`: «Сегодня» (`Icons.today_outlined`), «Чаты» (`Icons.forum_outlined`, `Badge` с непрочитанными), «Профиль» (`Icons.person_outline`) | активный — `primary500`, подпись `sizeXS`, фон `Colors.white`, `AppShadows.sm` |
| Safe-area | `SafeArea` в `Scaffold.body` + `MediaQuery.viewPadding.bottom` у таб-бара и у нижних кнопок (`bottomNavigationBar` + `SafeArea`) | токена нет — кодом (README, пробел 5) |
| Клавиатура | на `/chats/:chatId` и в формах таб-бар скрывается (`resizeToAvoidBottomInset: true`, нижний блок — `bottomNavigationBar` внутри `Padding(MediaQuery.viewInsets.bottom)`) | — |
| Полноэкранные маршруты | `RouteMapPage`, `ChecklistPage`, `SosPage` **не** имеют таб-бара; выход — `BackButton` и жест «назад» (Android) / свайп от края (iOS) | — |

## 4. Индекс экранов и переходы

| Экран | Файл спеки | Вход из | Выход в |
|---|---|---|---|
| Вход по email/паролю | [`auth.md`](./auth.md) §4 | `/splash` (нет токена) | `/today` |
| Ввод PIN | [`auth.md`](./auth.md) §5 | `/login` («Войти по PIN»), `/splash` (PIN сохранён) | `/today` |
| Установка/смена PIN | [`auth.md`](./auth.md) §6 | `/pin` («Забыли PIN?»), `/profile` («Сменить PIN») | `/profile` / `/today` |
| Сегодня | [`home_today.md`](./home_today.md) | таб-бар, после входа | `/route/:eventId`, `/sos`, `/chats/:chatId` |
| Маршрут дня | [`route_map.md`](./route_map.md) | карточка смены на `/today`; «Продолжить маршрут» | `/route/:eventId/room/:roomId` |
| Чек-лист помещения | [`checklist.md`](./checklist.md) | нажатие на текущую точку маршрута или «Следующая точка» | назад к `/route/:eventId` (после «Завершить помещение») |
| Аварийная заявка (SOS) | [`sos.md`](./sos.md) | пункт «SOS» в таб-баре любого shell-экрана (с 17.10.2026; до этого FAB), иконка в `AppBar` маршрута/чек-листа/переписки | назад (после успеха — `/today`) |
| Чаты | [`chat.md`](./chat.md) | таб-бар, push о сообщении | `/chats/:chatId` |
| Профиль | [`profile.md`](./profile.md) | таб-бар | `/pin/setup`, `/login` (после выхода) |
| Очередь оффлайна | [`offline.md`](./offline.md) | оффлайн-баннер, счётчик в `/profile` | назад |

## 5. Сквозные сценарии

### 5.1. Основной: «полная смена» (DoD М6)

```
PIN-вход (auth.md §5)
   ↓  POST /api/auth/pin
/today: GET /api/schedule/my?from=today&to=today  → смена PLANNED
   ↓  «Начать смену»: POST /api/schedule/check-in {scheduleId, lat, lng}
   ↓  геозона: вне зоны → 403 «Вы находитесь вне зоны объекта» (кнопка «Повторить»)
/route/:eventId: GET /api/routes/:routeId → точки (Room.coords*)
                 GET /api/floors/:floorId  → planImageUrl, planWidth/Height
   ↓  активна первая точка → /route/:eventId/room/:roomId?ticketId=…
/checklist: GET /api/rooms/:roomId → techCardId → GET /api/tech-cards/:id → operations[]
   ↓  операция 1: таймер → (requiresPhoto ? camera → POST /api/files/upload : —)
   ↓  POST /api/tickets/:ticketId/operations/:operationId/complete {photoUrl, requiresPhoto}
   ↓  … операции 2..N (следующая заблокирована до завершения предыдущей)
   ↓  «Завершить помещение» (все операции выполнены) → точка «выполнено»
   ↓  «Следующая точка» (route_map) → следующее помещение
… все точки маршрута
   ↓  /today: «Закрыть смену» POST /api/schedule/check-out {scheduleId}
```

Материалы списываются **на сервере** по событию `ticket.operation.completed` (консьюмер
material-service) — приложение ничего для этого не делает и остатков не показывает.

### 5.2. «Нет сети посреди маршрута»

`POST …/operations/:id/complete` не проходит → действие уходит в drift-очередь
([`offline.md`](./offline.md) §4), операция помечается «выполнено (ожидает отправки)», таймер
останавливается, чек-лист продолжает работать по локальным данным. При появлении сети синхронизатор
отправляет операции в порядке маршрута; `alreadyCompleted: true` в ответе — успех, а не ошибка.

### 5.3. «Авария»

Пункт `SOS` таб-бара (до 17.10.2026 — FAB) → [`sos.md`](./sos.md): тип + обязательное фото + описание + координаты → отправка.
Без сети — в очередь (`pending_actions`, приоритет 1) с локальным `clientRequestId`; фото уже
загружено в file-service или лежит в `photos_dir` до отправки. `nearbyOperators` из ответа
показываются в подтверждении («Оповещены 3 оператора поблизости»), но **не** влияют на факт
создания заявки.

### 5.4. «Сообщение бригадиру»

Таб «Чаты» → `/chats/:chatId` → WS-соединение с `auth.token` → `message:send`. Нет соединения —
сообщение в очереди с `clientMessageId`, пузырь «отправляется»; после `connect` — досылка.
Прочтение — `message:read { chatId, lastMessageId }` для видимых сообщений при активном экране.

## 6. Состояния: единые правила для всех экранов

| Состояние | Как выглядит (Flutter) | Виджет |
|---|---|---|
| Первая загрузка | скелетон из 3–5 строк `Container(height: 16, decoration: BoxDecoration(color: Color(AppColors.neutral200), borderRadius: BorderRadius.circular(AppRadius.sm)))`; высота сохраняется, чтобы вёрстка не «прыгала» | `LoadingSkeletonWidget` |
| Обновление (refetch / `AsyncValue.isRefreshing`) | контент поверх, `LinearProgressIndicator` в `AppBar` (`bottom`) — без подмены данными скелетоном | `RefreshIndicator` + флаг |
| Пусто | `Column` по центру: иконка `neutral400`, заголовок `sizeSM`+`neutral500`, подсказка `sizeXS`+`neutral400`, действие — `FilledButton`; рамка `Border.all(color: Color(AppColors.neutral300), style: BorderStyle.solid)` + `AppRadius.xl` | `EmptyStateWidget` |
| Ошибка сети/5xx | `Container` с границей `danger500`, текст `danger600` `sizeSM` + `TextButton('Повторить')` | `ErrorStateWidget` |
| **403** | отдельный экран, не баннер: «Нет доступа» + пояснение + «Выйти» / «Назад» | `EmptyStateWidget` + логика экрана |
| **404 / удалено** | «Не найдено или удалено» + «Назад» | `EmptyStateWidget` |
| Частичные/устаревшие данные | баннер `warning600` на белом: «Данные от 14:32 — нет соединения» | `OfflineBannerWidget` с `lastUpdatedAt` |
| Оффлайн | тот же баннер (текст «Нет соединения — данные могут быть устаревшими») + счётчик очереди | `OfflineBannerWidget` |
| Успех | контент; тосты/снекбары только для действий (см. таблицы действий) | — |

Отображение ошибок по коду (единый маппинг `Failure` → текст, `lib/core/errors/failures.dart`):

| Код/исключение | Текст | Примечание |
|---|---|---|
| нет сети (`DioException.connectionError`) | «Нет соединения. Проверьте интернет» | действие уходит в очередь, если оно из очереди-совместимых |
| 400 (DTO) | текст сервера (`response.data.message`) | поля формы подсвечиваются, если сообщение привязано к полю |
| 401 | прозрачный refresh (`single-flight`); не удалось — выход и `/login` | как в `ApiClient` из Устава |
| 403 | текст сервера («Вы находитесь вне зоны объекта» и т. п.) | без «Повторить» там, где повтор бессмысленен |
| 404 | «Не найдено или удалено» | |
| 5xx / 502 | «Сервис временно недоступен. Повторите позже» | кнопка «Повторить» |
| 429 | «Слишком много попыток. Попробуйте позже» | вход (лимит 5/мин) |

## 7. Данные и API: общие правила

1. **Базовые адреса.** Прямого gateway в dev нет: каждый сервис — свой порт (`mobile/README.md`):
   auth `3001`, files `3002`, core `3003`, gps `3004`, tickets `3005`, notifications `3006`,
   schedule `3008`, chat `3009`. Хост — `--dart-define=API_HOST` (по умолчанию `10.0.2.2` для
   Android-эмулятора), константы — `lib/core/constants/api_constants.dart`.
2. **Авторизация.** `Authorization: Bearer <accessToken>`, refresh-интерцептор `dio` с
   **single-flight** (как `ApiClient` в Уставе): при открытии `/today` параллельно уходят смены,
   объект и заявки — второй параллельный 401 не должен запускать второй refresh.
3. **Токены** — `flutter_secure_storage` (`access_token`, `refresh_token`, `biometric_key`,
   `pin_email`); в логи не пишутся (Устав, «Безопасность»).
4. **Пагинация** — серверная, `skip`/`take` (tickets, `take` ≤ 100) и курсорная (`before`/`limit` у
   сообщений, `limit` ≤ 100, ответ `{ items, hasMore, nextBefore }`). На телефоне базовый размер
   страницы — 20 (трафик), максимум сервиса — 100.
5. **Кэш.** Всё, что нужно в поле, живёт в drift: смена на сегодня, маршрут и точки, помещения,
   операции техкарты, чаты/сообщения, очередь действий. Правило: **экран сначала рисует кэш, потом
   сеть** (offline-first), «сеть» никогда не блокирует рисование.
6. **Инвалидация.** После `check-in` — профиль смены и `/today`; после завершения операции —
   прогресс маршрута и `GET /api/tickets/:id`; после SOS — список заявок; после отправки сообщения —
   список чатов (`unreadCount`, `lastMessage`).
7. **Идемпотентность на клиенте.** У каждого отложенного действия — свой ключ: `operationId` для
   операций, `chatId+clientMessageId` для сообщений, `clientRequestId` для SOS. Серверная
   идемпотентность есть только у операций (`@@unique([ticketId, operationId])`) и `check-in`/
   `check-out`; для SOS и сообщений её нет — см. [`sos.md`](./sos.md) п. 10.4 и
   [`chat.md`](./chat.md) п. 10.1.
8. **Время.** Все даты — ISO 8601 в UTC, отображение — локальное: время `HH:mm`, дата `dd.MM.yyyy`
   (`lib/core/utils/formatters.dart`). Смены фильтруются по `date` = `YYYY-MM-DD` (UTC-день смены,
   `schedule.service.ts`), поэтому «сегодня» считается по UTC, а не по локальной дате — расхождение
   показывается как есть, без «умных» сдвигов.
9. **Числа и координаты** — шрифт `AppTypography.fontMono`.

## 8. Оффлайн-first модель (кратко; полностью — [`offline.md`](./offline.md))

| Слой | Что хранится |
|---|---|
| `drift` (локальная БД) | `shift_events`, `route_points`, `checklist_operations`, `chat_messages`, `pending_actions` |
| Файловая система (`path_provider`) | фото до отправки (`photos_dir`), кэш плана этажа (`plans_dir`, ключ — `floorId`) |
| `flutter_secure_storage` | токены, биометрический ключ, email/телефон для PIN-входа |
| Очередь действий | `pending_actions` со статусами `pending → sending → synced / failed`, `attempts`, `nextAttemptAt` |
| Синхронизация | по факту появления сети (успешный любой запрос или слушатель связности) — по приоритету: SOS → операции → завершение помещения → чат → GPS |
| Индикатор | `OfflineBannerWidget` в шапке shell, `SyncStatusWidget` («Синхронизация: 3 из 5») на маршруте/чек-листе, экран `/offline` со списком очереди |

## 9. Словари статусов и подписей (единый источник — `shared/`, не дублировать в приложении)

| Домен | Значения | Русские подписи | Источник |
|---|---|---|---|
| Роль | `OPERATOR`/`SUPERVISOR`/`ADMIN`/`CLIENT` | Оператор / Бригадир / Администратор / Клиент | `shared/types/roles.ts` → `ROLE_LABELS` |
| Статус смены | `PLANNED`/`CHECKED_IN`/`CHECKED_OUT`/`MISSED` | Запланирована / Открыта / Закрыта / Неявка | `shared/types/schedule.ts` → `SCHEDULE_EVENT_STATUS_LABELS` |
| Статус заявки | `new`…`overdue` (9) | Новая / Назначена / В работе / Приостановлена / Выполнена / Проверена / Отклонена / Закрыта / Просрочена | `frontend/web-admin/src/types/tickets.ts` → `TICKET_STATUS_LABELS` |
| Тип заявки | `planned`/`unscheduled`/`emergency` | Плановая / Внеплановая / Аварийная (SOS) | `TICKET_TYPE_LABELS` |
| Приоритет | `low`/`normal`/`high`/`critical` | Низкий / Обычный / Высокий / Критичный | `TICKET_PRIORITY_LABELS` |
| Тип чата | `object`/`ticket`/`direct`/`system` | Чат объекта (все сотрудники) / Чат заявки (исполнитель, бригадир, админ) / Личные сообщения / Системные уведомления | `shared/types/chat.ts` → `CHAT_TYPE_LABELS` |
| Статус маршрута | `DRAFT`/`ACTIVE`/`ARCHIVED` | Черновик / Активен / В архиве | `shared/types/core.ts` → `ROUTE_STATUS_LABELS` |
| **Статус точки маршрута** | `pending`/`active`/`done`/`skipped` | Ожидает / В работе / Выполнено / Пропущено | **локальный словарь приложения** — на сервере такого поля нет (README, сводка № 8) |
| Тип уведомления | `NEW_TICKET`, `EMERGENCY`, `TICKET_OVERDUE`, `GEOFENCE_EXIT`, `MATERIAL_LOW`, `SCHEDULE_MISSED`, `CHAT_MESSAGE` | см. [`profile.md`](./profile.md) §7 | `notification-service/src/notifications/notification-types.ts` (значения) |
| Дни недели | 1…7 | Пн…Вс | `shared/types/schedule.ts` → `WEEKDAY_LABELS` |

## 10. Адаптация под iOS и Android

| Аспект | Android | iOS |
|---|---|---|
| Таб-бар и переходы | `NavigationBar` (Material 3); системная кнопка «назад» и `PopScope` на `/sos` (подтверждение отмены заполненной формы) | `NavigationBar` в Material-теме приложения (один код); свайп от левого края работает системно, `PopScope` — то же подтверждение |
| Клавиатура | `resizeToAvoidBottomInset: true`, поле чата поднимается над клавиатурой | то же + `MediaQuery.viewInsets.bottom`; шрифт ввода ≥16 px (иначе iOS зумит) |
| Safe-area | `SafeArea` + `viewPadding` (навигационная полоса) | `SafeArea` (вырез, домашний индикатор) |
| Разрешения | `ACCESS_FINE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS`, foreground service для GPS — запрос в контексте действия (кнопка «Начать смену» → геолокация, «Сделать фото» → камера) | `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSFaceIDUsageDescription`; биометрия — `Face ID` вместо `Touch ID` (текст кнопки не меняется: «Войти по отпечатку» → при отсутствии отпечатка, но наличии Face ID — «Войти по биометрии») |
| Биометрия | `local_auth` → `biometricOnly: false` допускает PIN устройства | `biometricOnly: true` (Face ID), с фолбэком на PIN приложения |
| Push | FCM-токен регистрируется в `POST /api/notifications/device` с `platform: 'android'` | `platform: 'ios'` |
| Жесты | долгое нажатие — контекстное меню списка; обязательные действия дублированы кнопкой | то же |

Обязательные правила: нет горизонтального скролла; область нажатия ≥48 dp; ни одно действие не
живёт только в свайпе; приложение не пересобирает `ThemeData` под платформу (одна тема, различия
только в системных элементах).

## 11. Открытые вопросы (общие)

1. **«Сегодня» по UTC или по локальной дате?** `GET /api/schedule/my?from=&to=` фильтрует день
   смены (`date` — полночь UTC). Для оператора в UTC+3 смена в 22:00 UTC попадает в «завтра».
   Требуется решение: передавать локальную дату и мириться со сдвигом либо доработать сервис
   (фильтр по `plannedStart` в диапазоне ISO).
2. **Привязка смены к объекту и маршруту при `objectId = null`**: график может быть без объекта
   (`Schedule.objectId` nullable) и без маршрута (`routeId` nullable). Что показывать оператору в
   этом случае — «Маршрут не назначен» (§5 `home_today.md` п. 10.2) или чек-лист без плана?
3. **Несколько смен в один день.** `GET /api/schedule/my` отдаёт массив; экран описан для N смен
   (карточки), но сценарий «перейти к маршруту» активен только у смены `CHECKED_IN`. Правило выбора
   «текущей смены» — по `status`, затем по `plannedStart`.
4. **Оффлайн-старт приложения.** Без сети `GET /api/auth/me` не проходит: вход возможен только по
   PIN/биометрии при живом refresh-токене (`POST /api/auth/refresh` тоже требует сети — значит,
   сессия должна быть валидной). Нужно решение по политике «оффлайн-входу» (доверять локальной
   сессии N часов?) — это влияет на `auth.md` п. 10.5 и `offline.md` п. 10.4.
5. **Геокодирование «помещение/этаж» для SOS** (`ПЛАН.md` М6.5 упоминает как минимум координаты):
   API поиска помещения по координатам нет (`GET /api/gps/geofences/:userId/check` — только
   геозона). Сейчас экран показывает координаты и последнюю известную точку маршрута (локально).
6. **Иконки.** Отдельной иконочной библиотеки в проект не добавляем: используются `Icons.*` из
   Material (в web — глифы/SVG; правило то же — не тянуть новую зависимость).
7. **Тёмная тема** (требование DS-002) — не реализуема без dark-токенов; см. README, пробел 2.
