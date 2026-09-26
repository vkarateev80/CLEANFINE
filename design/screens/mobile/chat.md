# 💬 Экран: Чаты (`chat`) — DS-002 (М6.8)

> DS-002 → `chat.fig`; реализация — М6.8
> (`lib/features/chat/presentation/pages/{chat_list_page,chat_page}.dart`,
> `lib/services/chat_socket_service.dart`).
> Данные: chat-service (3009) — REST `/api/chat/**` и WebSocket namespace `chat` (`socket.io`);
> file-service (3002) — вложения.
> Источник требований — `ПЛАН.md` М6.8: *«Чат (socket.io-client dart): экран чата заявки/объекта,
> доставка сообщений, статус прочтения»*; чек-лист приёмки — «Чат работает», «Оффлайн-режим
> работает». Транспорт и контракт сверены с `chat.gateway.ts`, `ws-auth.ts`, `chats.controller.ts`.

## 1. Назначение

Связать оператора с бригадиром и коллегами по объекту/заявке: принять задачу, уточнить доступ в
помещение, сообщить о проблеме. Экран работает в двух режимах — список чатов и переписка — и умеет
отправлять сообщения без сети (очередь) и дочитывать историю по курсору.

Чатов, которых у оператора нет, экран не показывает: список приходит с сервера
(`GET /api/chat/chats` — только чаты, где пользователь участник), чужой `chatId` даёт 403
«Вы не участник этого чата».

### 1.1. Точка входа в навигации

| Что | Значение |
|---|---|
| Маршруты | `/chats` (список, таб «Чаты»), `/chats/:chatId` (переписка) |
| Кто открывает | таб-бар; тап по заявке на [`home_today.md`](./home_today.md); push-уведомление `CHAT_MESSAGE` (payload `{chatId, messageId, type}` — переход сразу в переписку) |
| Что открывает | file-service (вложение), `GET /api/tickets/:id` (пилюля «Заявка» → деталь заявки) |
| Индикатор непрочитанных | `Badge` на табе «Чаты» и в `AppBar` shell — `sum(ChatSummary.unreadCount)` |

## 2. Схемы экранов (телефон 360–430 dp)

### 2.1. `/chats` — список чатов

```
┌───────────────────────────────────────────────────────────────┐
│  Чаты                                          ⚡2   🔔1      │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🏢 Чат объекта (все сотрудники)                       ②  │  │  Key('chat_tile_<chatId>')
│  │    БЦ «Север»                                           │  │  Key('chat_unread_badge_<chatId>')
│  │    Бригадир: «Санузел 101 закрыт на ремонт»  10:42      │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 🎫 Чат заявки (исполнитель, бригадир, админ)            │  │
│  │    Заявка · Прорыв трубы в санузле 101                  │  │
│  │    Вы: «Фото отправил»                        10:15 ✓✓  │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 👤 Личные сообщения                                     │  │
│  │    Петров Пётр                                          │  │
│  │    «Подойди на 2 этаж»                        Вчера     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│   Сегодня    │     Чаты ⑤      │     Профиль                 │
└───────────────────────────────────────────────────────────────┘
```

### 2.2. `/chats/:chatId` — переписка

```
┌───────────────────────────────────────────────────────────────┐
│  ←  Чат заявки                                  🚨            │
│     Петров Пётр, Сидоров С. · в сети                          │ ← sizeXS, neutral500 / success600
├───────────────────────────────────────────────────────────────┤
│  ⚠ Нет соединения — сообщения уйдут при подключении           │  Key('chat_offline_banner')
│                                                               │
│  ─────────────── Сегодня ───────────────                      │
│  ┌──────────────────────────────────────┐                     │
│  │ Прорыв трубы в санузле 101. Вода на  │                     │  Key('chat_message_bubble_<id>')
│  │ полу, доступ через 2 этаж.           │                     │  ← входящее: left, neutral100
│  │                              10:05   │                     │
│  └──────────────────────────────────────┘                     │
│                     ┌───────────────────────────────────────┐ │
│                     │ Принял, иду                            │ │  ← исходящее: right, primary500
│                     │                          10:07  ✓✓     │ │  Key('chat_message_status_<id>')
│                     └───────────────────────────────────────┘ │
│  ┌──────────────────────────────────────┐                     │
│  │ [📷 Фото] фото_2026-09-17.jpg         │                     │  Key('chat_attachment_<id>')
│  │                              10:12   │                     │
│  └──────────────────────────────────────┘                     │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  📎  ┌───────────────────────────────────────┐  ┌──────────┐  │
│      │ Напишите сообщение…                   │  │    ➤     │  │  Key('chat_input_field'),
│      └───────────────────────────────────────┘  └──────────┘  │  Key('chat_send_button'),
│                                                               │  Key('chat_attach_button')
└───────────────────────────────────────────────────────────────┘
```

## 3. Состав блоков

### 3.1. Список чатов (`/chats`)

| Элемент | Источник | Правило |
|---|---|---|
| Иконка типа | `ChatSummary.type` | `object` — `Icons.business`, `ticket` — `Icons.receipt_long`, `direct` — `Icons.person`, `system` — `Icons.campaign` |
| Заголовок | `title` \|\| правило по типу | если `title == null`: `ticket` → «Заявка», `direct` → имя участника (из `ChatDetail.members`, подтягивается лениво) , `object` → «Чат объекта» |
| Превью | `lastMessage.text` (уже обрезано сервером по `chat.lastMessagePreviewLength`) | одна строка, `ellipsis`; пусто → «Сообщений пока нет» |
| Префикс «Вы:» | `lastMessage.authorId == me.id` | «Вы: {text}» |
| Время | `lastMessage.createdAt` | сегодня — `HH:mm`, вчера — «Вчера», раньше — `dd.MM` |
| Непрочитанные | `unreadCount` | `Badge` с числом, `primary500` + `Colors.white` (единственная гарантированно контрастная пара) |
| Сортировка | ответ сервера | по последнему сообщению, свежие выше (`chats.service.ts:204`) |
| Обновление | WS `message:new` + `RefreshIndicator` | список перестраивается при любом входящем (инкремент `unreadCount` локально, если чат не открыт) |

### 3.2. Переписка (`/chats/:chatId`)

| Элемент | Источник | Правило |
|---|---|---|
| Шапка | `GET /api/chat/chats/:id` → `ChatDetail` | название чата + участники; «в сети» — из WS `user:status` (событие приходит на всех, но приложение реагирует только на участников чата) |
| Лента | `GET /api/chat/chats/:id/messages?limit=30` → `{items, limit, hasMore, nextBefore}` | `items` уже идут от старых к новым внутри страницы; лента рисуется `ListView(reverse: true)` |
| Подгрузка истории | скролл вверх до начала | `before = nextBefore`; позиция скролла сохраняется; `hasMore == false` → «Начало переписки» |
| Пузырь входящего | `message.authorId != me.id` | выравнивание влево, фон `neutral100`, `AppRadius.lg`, максимум 80 % ширины |
| Пузырь исходящего | `authorId == me.id` | вправо, фон `primary500`, текст `Colors.white` |
| Системное сообщение | `type == 'system'` (чат системных уведомлений) | по центру, без пузыря, `sizeXS`, `neutral500` |
| Время | `createdAt` | `HH:mm` в углу пузыря; разделители дней «Сегодня»/«Вчера»/`dd.MM.yyyy` |
| Вложения | `attachmentIds[]` (id файлов) | ссылки: `📷 Фото`, `📄 Документ` + имя; URL резолвится через `GET /api/files/:id` (`url`, `thumbnailUrl`, `originalName`) и кладётся в локальный кэш `chat_attachments`; тап → полноэкранный просмотр (`Image.network` c `loadingBuilder`) |
| Черновик | локально | текст поля сохраняется в drift на чат и восстанавливается при возврате |

### 3.3. Composer (поле ввода)

| Элемент | Реализация |
|---|---|
| Поле | `TextField(maxLines: 1..6, minLines: 1, textCapitalization: sentences)`, `Key('chat_input_field')` |
| Отправка | `IconButton(Icons.send)` 48×48, `Key('chat_send_button')`; активна при непустом `trim()` |
| Enter | на телефоне Enter переносит строку (многострочный ввод) — отправка только кнопкой |
| Вложение | `IconButton(Icons.attach_file)`, `Key('chat_attach_button')` — `POST /api/files/upload {kind: 'document'}` → `attachmentIds: [fileId]` |
| Лимиты | текст ≤4000 символов (`MAX_MESSAGE_LENGTH`), вложений ≤20 (`MAX_ATTACHMENTS`) — счётчик появляется от 3800 символов |
| Клавиатура | поле поднимается над клавиатурой (`MediaQuery.viewInsets.bottom`), список скроллится так, чтобы последнее сообщение осталось видимым |

### 3.4. Подключение к WebSocket (одно на экран)

```
только при наличии accessToken, только с экрана /chats/:chatId:
io('$API_CHAT_URL/chat', OptionBuilder()
     .setTransports(['websocket'])
     .setAuth({'token': accessToken})      // основной путь: auth.token (ws-auth.ts)
     .disableAutoConnect().enableReconnection().build())
  onConnect        → статус «в сети», досылка очереди сообщений этого чата
  on('message:new', m)  → если m.chatId == открытый чат: добавить в ленту, автоскролл при нижней границе
  on('message:read', r) → у своих сообщений с id <= r.messageId статус «Прочитано»
  on('user:status', s)  → обновить «в сети» у участника s.userId
  on('error', e)        → если e — ошибка авторизации, переподключиться с обновлённым access-токеном
  onDisconnect          → баннер «Нет соединения — сообщения уйдут при подключении», авто-reconnect
  dispose (уход с экрана) → disconnect()  (иначе на телефоне остаётся висеть сокет и батарея)
```

Пакет: `socket_io_client` (**⚠️ отсутствует в `mobile/README.md`**, добавить в `pubspec.yaml` и в
таблицу зависимостей — п. 11.4).

Отправка (двухступенчатая, как в Уставе и DS-004):

```
1) optimistic-пузырь «Отправляется…» (клиентский id = clientMessageId)
2) emit('message:send', {chatId, text, attachmentIds}, ack)
   ack {ok: true, message}  → заменить временный пузырь на серверный (id, createdAt), статус «Отправлено»
   ack {ok: false, error}   → пузырь с границей danger500 + «Не отправлено · Повторить»
3) при отсутствии соединения — запись в pending_actions (kind: 'chat_message'), отправка при connect
4) REST-фолбэк POST /api/chat/chats/:id/messages — только если сокет не поднялся, а сеть есть
```

### 3.5. Доставка и прочтение

| Индикатор | Что значит | Источник |
|---|---|---|
| «Отправляется…» | пузырь в очереди (локально) | `pending_actions.status = 'pending'` |
| `✓` «Отправлено» | сервер подтвердил сохранение | ack `message:send` (`{ok: true, message}`) или 201 REST |
| `✓✓` «Прочитано» | собеседник отправил `message:read` | WS `message:read {chatId, messageId, readBy, readAt}` |
| «Прочитано до {HH:mm}» | агрегат по участнику | `ChatDetail.members[].lastReadAt` (при открытии чата) |
| «Не отправлено · Повторить» | ошибка отправки | ack `{ok: false}` или 4xx/5xx |

Отправка `message:read`: когда пузырь входящего попал в видимую область **и** приложение на переднем
плане (`AppLifecycleState.resumed`), отправляем `emit('message:read', {chatId, lastMessageId: <id
последнего видимого>})`; повторно для того же сообщения не отправляем (хранится `lastSentReadId`).
Правило «не читать фоном» скопировано из DS-004 ([`../web-client/chat.md`](../web-client/chat.md)
п. 7.2): иначе бригадир получит ложный сигнал, пока телефон лежит в кармане.

## 4. Действия пользователя

| Действие | Триггер | Результат |
|---|---|---|
| Открыть чат | `Key('chat_tile_<id>')` | `/chats/:chatId`, `message:read` для последнего видимого |
| Отправить | `Key('chat_send_button')` | optimistic-пузырь → `message:send`; поле очищается, черновик удаляется |
| Повторить отправку | «Повторить» в пузыре | тот же текст с тем же `clientMessageId` |
| Прикрепить файл | `Key('chat_attach_button')` | `POST /api/files/upload {kind: 'document'}` → отправка сообщения с `attachmentIds` |
| Открыть вложение | тап по вложению | полноэкранный просмотр (`GET /api/files/:id`) |
| Подгрузить историю | скролл вверх | страница `before = nextBefore` |
| Начать чат с коллегой | «+» в шапке списка | выбор сотрудника (P2, требует `GET /api/users` — недоступен оператору, п. 11.3) |
| SOS | 🚨 в шапке | `/sos` |

## 5. Таблица состояний

| Состояние | Экран | Триггер | Отображение |
|---|---|---|---|
| Загрузка списка | `/chats` | первый вход | 4 скелетона строк (`h=72`) |
| Пусто (чатов нет) | `/chats` | `[]` | `EmptyStateWidget` «Чатов пока нет» + «Чат появится, когда бригадир создаст его по объекту или заявке» |
| Ошибка списка | `/chats` | 5xx/сеть | `ErrorStateWidget` «Не удалось загрузить чаты» + «Повторить» |
| Загрузка истории | `/chats/:chatId` | первый вход | 4 скелетона пузырей (чередование сторон) |
| Пусто (переписки нет) | `/chats/:chatId` | `items == []` | «Напишите первое сообщение» + подсказка «Опишите вопрос — ответ придёт в это окно» |
| Ошибка истории | `/chats/:chatId` | 5xx | баннер «Не удалось загрузить переписку» + «Повторить»; composer активен |
| 403 | `/chats/:chatId` | чужой чат | `EmptyStateWidget` «Чат недоступен» + «К чатам» |
| Подключение WS | `/chats/:chatId` | `connecting` | в шапке «соединение…» (`sizeXS`, `neutral500`); composer активен (в очередь) |
| WS разорван | `/chats/:chatId` | `disconnect` | баннер «Нет соединения — сообщения уйдут при подключении»; composer **не** блокируется; авто-reconnect c backoff 1→2→5→10 с |
| Оффлайн | оба | нет сети | тот же баннер + сообщения в `pending_actions` |
| Сервис недоступен | оба | chat-service лежит (5xx) | «Чат временно недоступен» + «Повторить»; история из drift, если есть |
| Сообщение не ушло | `/chats/:chatId` | ack error | пузырь с `danger500` + «Не отправлено · Повторить» |
| Успех | оба | данные пришли | лента/список; автоскролл только если пользователь у нижней границы |

## 6. Таблица элементов (элемент → виджет → `Key` → действие)

| Элемент | Тип виджета Flutter | `Key` | Действие |
|---|---|---|---|
| Список чатов | `RefreshIndicator` + `ListView.builder` | `Key('chats_list')` | pull-to-refresh |
| Строка чата | `ListTile` | `Key('chat_tile_<chatId>')` | открыть переписку |
| Бейдж непрочитанных | `Badge` | `Key('chat_unread_badge_<chatId>')` | — |
| Пустое состояние | `EmptyStateWidget` | `Key('chats_empty_text')` | — |
| Лента | `ListView.builder(reverse: true)` | `Key('chat_message_list')` | — |
| Пузырь | `Container` + `Align` | `Key('chat_message_bubble_<messageId>')` | — |
| Статус сообщения | `Icon`/`Text` | `Key('chat_message_status_<messageId>')` | — |
| Вложение | `InkWell` + `Image.network` | `Key('chat_attachment_<messageId>')` | просмотр |
| Поле ввода | `TextField` | `Key('chat_input_field')` | ввод |
| Отправить | `IconButton(Icons.send)` | `Key('chat_send_button')` | `message:send` |
| Прикрепить | `IconButton(Icons.attach_file)` | `Key('chat_attach_button')` | загрузка вложения |
| Баннер соединения/оффлайна | `OfflineBannerWidget` | `Key('chat_offline_banner')` | `/offline` |
| Состояние синхронизации | `SyncStatusWidget` | `Key('chat_sync_status')` | `/offline` |
| Подсказка «начало переписки» | `Text` | `Key('chat_history_start_text')` | — |

## 7. Используемые дизайн-токены

| Место | Константа | Значение |
|---|---|---|
| Фон ленты | `AppColors.neutral50` | `#F9FAFB` |
| Пузырь входящего | `AppColors.neutral100`, текст `neutral900` | `#F3F4F6` |
| Пузырь исходящего | `AppColors.primary500`, текст `Colors.white` | `#3399FF` |
| Пузырь с ошибкой | граница `danger500`, фон `Colors.white`, текст `danger600` | |
| Системное сообщение | текст `neutral500`, `sizeXS` | |
| Время внутри пузыря | `sizeXS` (12) + `neutral500` (входящее) / `primary100` (исходящее) | |
| Разделитель дня | `sizeXS` + `neutral400` | |
| Бейдж непрочитанных | `primary500` + `Colors.white`, `AppRadius.full` | |
| Composer | `Colors.white`, верхняя граница `neutral200`, поле `AppRadius.full` (24), текст `sizeBASE` | 16 px — иначе iOS зумит |
| Кнопка отправки | `primary500`, 48×48, `AppRadius.full`; `disabled` — `neutral200`/`neutral400` | |
| Строка чата | `Colors.white`, разделитель `neutral200`, `AppShadows.sm` у активного (нажатого) | |
| Баннер оффлайна | `warning500`/`warning600` | |
| Отступы | `md` (12) внутри пузыря, `lg` (16) по краям ленты, `sm` (8) между пузырями | |
| Скругления | пузырь — `AppRadius.lg`, поле — `full`, карточка чата — `lg` | |

## 8. Данные из API

| Запрос | Параметры | Ответ / поля | Использование |
|---|---|---|---|
| `GET /api/chat/chats` | — | `ChatSummary[]`: `id`, `type`, `title`, `objectId`, `ticketId`, `createdAt`, `lastMessage` (`id`, `authorId`, `text`, `attachmentIds`, `createdAt`) \| `null`, `unreadCount` | список, бейджи непрочитанных |
| `POST /api/chat/chats` | `{type, participantIds?, objectId?, ticketId?, title?}` | `ChatSummary` (идемпотентно для `ticket`/`object`) | P2: создание `direct`-чата; `ticket`/`object` оператору **запрещены** (403) |
| `GET /api/chat/chats/:id` | — | `ChatDetail`: `id`, `type`, `title`, `objectId`, `ticketId`, `createdAt`, `members[]` (`userId`, `role`, `joinedAt`, `lastReadAt`) | шапка, участники, «прочитано до» |
| `GET /api/chat/chats/:id/messages` | `before` (ISO, курсор), `limit` (приложение запрашивает 30; сервер: по умолчанию 50, максимум 100) | `{items: MessageView[], limit, hasMore, nextBefore}`; `MessageView`: `id`, `chatId`, `authorId`, `text`, `attachmentIds`, `createdAt` | лента, подгрузка истории |
| `POST /api/chat/chats/:id/messages` | `{text, attachmentIds?}` | 201 `MessageView` | REST-фолбэк |
| `POST /api/chat/chats/:id/read` | `{lastMessageId}` | 200 `{chatId, userId, lastMessageId, readAt}` | отметка прочтения (HTTP-путь) |
| `GET /api/chat/messages/search` | `q`, `chatId?`, `limit?` | `{items, total}` | P2: поиск по сообщениям |
| `WS /chat` (`message:send`) | `{chatId, text, attachmentIds?}` | ack `{ok: true, message}` \| `{ok: false, error, status?}` | отправка (основной путь) |
| `WS /chat` (`message:read`) | `{chatId, lastMessageId}` | ack `{ok: true, readAt}` \| `{ok: false, error}` | прочтение |
| `WS /chat` (сервер → клиент) | `message:new` (`MessageView`), `message:read` (`{chatId, messageId, readBy, readAt}`), `user:status` (`{userId, online}`), `error` (`{message}`) | — | лента, статусы, присутствие |
| `POST /api/files/upload` | multipart `file`, `kind: 'document'` | `UploadedFileView` (`id`, `url`, `originalName`) | вложение |
| `GET /api/files/:id` | — | `UploadedFileView` | резолв URL/имени вложения |
| `GET /api/notifications` | `page=1&limit=20&unreadOnly=true` | `unreadCount` | бейдж в шапке shell |

Права по контроллеру: все эндпоинты — только «свои» чаты; `POST /api/chat/chats` для `ticket`/`object`
требует ADMIN/SUPERVISOR, для `direct` — любой авторизованный, `system` — только ADMIN
(`chats.controller.ts:45–59`).

## 9. Тексты интерфейса (дословно)

| Где | Текст |
|---|---|
| Заголовки | «Чаты», «Чат заявки», «Чат объекта», «Личные сообщения», «Системные уведомления» |
| Список | «Сообщений пока нет», «Вы: {текст}», «Вчера», «Сегодня» |
| Пустые состояния | «Чатов пока нет», «Чат появится, когда бригадир создаст его по объекту или заявке», «Напишите первое сообщение», «Опишите вопрос — ответ придёт в это окно» |
| Поле ввода | «Напишите сообщение…» |
| Статусы | «Отправляется…», «Отправлено», «Прочитано», «Прочитано до {HH:mm}», «Не отправлено · Повторить», «соединение…», «в сети», «был(а) недавно» |
| Ошибки | «Не удалось загрузить чаты», «Не удалось загрузить переписку», «Чат недоступен», «Чат временно недоступен», «Сообщение не может быть пустым», «Сообщение длиннее 4000 символов», «Слишком много вложений (максимум 20)» |
| Оффлайн | «Нет соединения — сообщения уйдут при подключении», «Сообщение уйдёт при появлении сети» |
| История | «Начало переписки» |

## 10. Что проверяет widget-тест

1. **Отправка без сети → очередь**: при выключенном WS и отсутствии сети нажатие
   `Key('chat_send_button')` с текстом «Принял» рисует пузырь со статусом «Отправляется…» и создаёт
   в `pending_actions` запись `kind: 'chat_message'` с `status = 'pending'` и непустым
   `clientMessageId`; после мока `onConnect` запись уходит и статус меняется на «Отправлено».
2. **Прочтение**: после эмуляции события `message:read` с `messageId` своего сообщения у
   `Key('chat_message_status_<id>')` появляется `Semantics(label: 'Прочитано')` (или текст «Прочитано»).
3. **Чужой чат (403)**: мок `GET /api/chat/chats/:id` бросает 403 → виден текст «Чат недоступен»,
   composer отсутствует.
4. **Пустой список**: `GET /api/chat/chats` → `[]` → виден текст «Чатов пока нет» и
   `Key('chats_empty_text')`; таб «Чаты» не показывает бейдж непрочитанных.

## 11. Ограничения и открытые вопросы

1. **Идемпотентность `message:send` по `clientMessageId` — закрыта (М6, 26.09.2026).**
   Сервер принимает ключ в WS-payload (`parseSendPayload`) и в `SendMessageDto` (REST-фолбэк),
   дедуплицирует по уникальному `(authorId, clientMessageId)`: повтор возвращает уже
   сохранённое сообщение (`duplicate=true` — без повторной рассылки `message:new` и push),
   гонка параллельных ретраев ловится P2002. Приложение шлёт ключ всеми тремя путями
   (сокет, REST, очередь `chat_message`), поэтому ретрай после обрыва дубля не создаёт.
2. **`deliveredAt` в `MessageView` есть (М6, 26.09.2026); `readAt` по-прежнему нет:**
   единственный сигнал прочтения — событие `message:read` (и агрегат
   `ChatDetail.members[].lastReadAt`). `deliveredAt` заполняется, когда сообщение получил
   устройство получателя: онлайн при отправке, либо при загрузке истории / прочтении
   (`null` — только «отправлено»). Отдельного UI-состояния «Доставлено» в ленте пока нет:
   две галочки означают «прочитано».
3. **Оператор не может создать чат заявки/объекта.** `POST /api/chat/chats` для типов `ticket` и
   `object` требует ADMIN/SUPERVISOR (`chats.controller.ts:49–52`). Оператор видит только те чаты,
   куда его добавили. Практическое следствие: если по заявке чата нет, оператору некуда написать —
   остаётся [`sos.md`](./sos.md) или комментарий к заявке (`POST /api/tickets/:id/comments`).
   Требуется решение: автосоздание `ticket`-чата при назначении исполнителя или право OPERATOR
   создавать чат заявки, в которой он исполнитель.
4. **`socket_io_client` нет в зависимостях.** `ПЛАН.md` М6.8 называет «socket.io-client dart», но в
   таблице зависимостей [`mobile/README.md`](../../../mobile/README.md) пакета нет (там перечислены
   riverpod, go_router, dio, drift, secure_storage, geolocator, camera/image_picker, flutter_map,
   local_auth, firebase_messaging). Нужно добавить `socket_io_client` в `pubspec.yaml` и в
   `mobile/README.md` — иначе чат реализуется только REST-поллингом, что противоречит М6.8
   («доставка сообщений»).
5. **Вложения резолвятся отдельными запросами.** `MessageView.attachmentIds` — это только id
   файлов (`fileId`), URL и имя приходят из `GET /api/files/:id`. Лента из 30 сообщений с
   вложениями даёт N дополнительных запросов (кэшируются в `chat_attachments`). Полезно поле
   `attachments: [{id, url, thumbnailUrl, originalName, mimeType}]` в `MessageView`.
6. **Нет события «печатает»** (`typing`) в `chat.gateway.ts` — индикатор набора не реализуется
   (P2, как в DS-004 п. 10.4).
7. **Имена собеседников.** `ChatSummary`/`ChatDetail` содержат только `userId` (в `members` — `role`,
   `joinedAt`, `lastReadAt`), а `GET /api/users` оператору недоступен (ADMIN/SUPERVISOR). Значит,
   имя участника в шапке и в превью `direct`-чата получить нечем, кроме `system`/`ticket`-заголовка.
   Требуется эндпоинт «краткая карточка пользователя» или расширение `ChatMemberView` полем
   `fullName`.
8. **Черновики и непрочитанные живут локально**: `unreadCount` приходит с сервера, но при оффлайне
   инкрементируется локально и может разойтись — при следующем `GET /api/chat/chats` число
   перезаписывается серверным.
9. **Время смены суток.** `MessageView.createdAt` — ISO UTC; разделители дней считаются по
   локальной дате устройства, а смены — по UTC-дню (`ScheduleEvent.date`). В редких случаях
   «сегодня» на главном экране и в чате могут отличаться — это следствие п. 11.1
   [`overview.md`](./overview.md).
